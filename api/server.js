const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { syncBusinessToSheets, syncSurveyToSheets } = require("./google-sheets");

const PORT = Number(process.env.PORT || process.env.AI_USAGE_API_PORT || 8011);
const HOST = process.env.AI_USAGE_API_HOST || "127.0.0.1";
const STATIC_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.resolve(process.env.AI_USAGE_DB_PATH || "/var/lib/ai-usage/local-db.json");
const ADMIN_EMAIL = process.env.AI_USAGE_ADMIN_EMAIL || "hello@ai-usage.biz";
const FROM_EMAIL = process.env.AI_USAGE_FROM_EMAIL || "AI Usage <hello@ai-usage.biz>";
const SENDMAIL_PATH = process.env.AI_USAGE_SENDMAIL_PATH || "/usr/sbin/sendmail";
const ADMIN_API_TOKEN = process.env.AI_USAGE_ADMIN_API_TOKEN || "";
const GOOGLE_MAPS_BROWSER_KEY = process.env.AI_USAGE_GOOGLE_MAPS_BROWSER_KEY || "";
const MAX_BODY_BYTES = 64 * 1024;
const CAPTURE_LOG_PATH = path.resolve(
  process.env.AI_USAGE_CAPTURE_LOG_PATH || path.join(path.dirname(DB_PATH), "survey-capture-log.jsonl")
);
const STATIC_MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
});

let writeQueue = Promise.resolve();

const nowIso = () => new Date().toISOString();

const baseDatabase = () => ({
  surveyResponses: [],
  businesses: [],
  notifications: [],
  sheetSyncs: [],
});

const ensureDbDir = async () => {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
};

const backupInvalidDatabase = async (raw, error) => {
  if (!raw.trim()) {
    return "";
  }

  const backupPath = `${DB_PATH}.invalid-${nowIso().replace(/[:.]/g, "-")}`;
  await fs.writeFile(backupPath, raw, "utf8");
  console.error(`Invalid survey database copied aside at ${backupPath}: ${error.message}`);
  return backupPath;
};

const readDatabase = async () => {
  await ensureDbDir();

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    if (!raw.trim()) {
      return baseDatabase();
    }

    const parsed = JSON.parse(raw);
    return {
      ...baseDatabase(),
      ...parsed,
      surveyResponses: Array.isArray(parsed.surveyResponses) ? parsed.surveyResponses : [],
      businesses: Array.isArray(parsed.businesses) ? parsed.businesses : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      sheetSyncs: Array.isArray(parsed.sheetSyncs) ? parsed.sheetSyncs : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return baseDatabase();
    }

    if (error instanceof SyntaxError) {
      await backupInvalidDatabase(await fs.readFile(DB_PATH, "utf8").catch(() => ""), error);
      return baseDatabase();
    }

    throw error;
  }
};

const writeDatabase = async (database) => {
  await ensureDbDir();
  const tempPath = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, DB_PATH);
};

const withDatabase = (mutator) => {
  writeQueue = writeQueue.then(async () => {
    const database = await readDatabase();
    const result = await mutator(database);
    await writeDatabase(database);
    return result;
  });

  return writeQueue;
};

const normalize = (value) => String(value || "").trim();

const slugify = (value) =>
  normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const toArray = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalize).filter(Boolean);
  }

  const cleanValue = normalize(value);
  return cleanValue ? [cleanValue] : [];
};

const answerList = (answers, key) => [
  ...toArray(answers[key]),
  ...toArray(answers[`${key} - Custom`]),
];

const isTestSubmission = (answers, source = "") => {
  const submittedValues = [
    ...toArray(answers["Test submission"]),
    ...toArray(answers["Submission tag"]),
    normalize(answers["Business name"]),
    normalize(source),
  ].map((value) => value.toLowerCase());

  return submittedValues.some((value) => ["yes", "true", "test", "production-smoke"].includes(value) || /(^|[-\s])smoke($|[-\s])|^test/.test(value));
};

const normalizeSubmissionAnswers = (answers, source = "") => {
  const normalizedAnswers = { ...answers };
  const testSubmission = isTestSubmission(normalizedAnswers, source);

  normalizedAnswers["Test submission"] = testSubmission ? "Yes" : "No";
  normalizedAnswers["Submission tag"] = testSubmission ? "test" : "live";

  return normalizedAnswers;
};

const preferSubmitted = (previous, key, value) => {
  const cleanValue = normalize(value);
  return cleanValue || normalize(previous?.[key]);
};

const preferSubmittedArray = (previous, key, values) => {
  if (values.length) {
    return values;
  }

  return Array.isArray(previous?.[key]) ? previous[key] : [];
};

const appendCaptureLog = async (record) => {
  try {
    await fs.mkdir(path.dirname(CAPTURE_LOG_PATH), { recursive: true });
    await fs.appendFile(CAPTURE_LOG_PATH, `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    console.error(`Survey capture log failed: ${error.message}`);
  }
};

const readRequestJson = (request) =>
  new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body too large."), { statusCode: 413 }));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body."), { statusCode: 400 }));
      }
    });

    request.on("error", reject);
  });

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(payload)}\n`);
};

const getStaticFilePath = (pathname) => {
  let decodedPathname;

  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return "";
  }

  const requestedPath = decodedPathname === "/"
    ? "/index.html"
    : path.extname(decodedPathname)
      ? decodedPathname
      : `${decodedPathname.replace(/\/$/, "")}.html`;
  const filePath = path.resolve(STATIC_ROOT, `.${requestedPath}`);

  if (filePath !== STATIC_ROOT && !filePath.startsWith(`${STATIC_ROOT}${path.sep}`)) {
    return "";
  }

  return filePath;
};

const sendStatic = async (request, response, pathname) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, {
      ok: false,
      error: "Method not allowed.",
    });
    return;
  }

  const filePath = getStaticFilePath(pathname);

  if (!filePath) {
    sendJson(response, 404, {
      ok: false,
      error: "Not found.",
    });
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": STATIC_MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT" && pathname !== "/") {
      await sendStatic(request, response, "/");
      return;
    }

    if (error.code === "ENOENT") {
      sendJson(response, 404, {
        ok: false,
        error: "Not found.",
      });
      return;
    }

    throw error;
  }
};

const escapeHeader = (value) => normalize(value).replace(/[\r\n]+/g, " ");

const buildNotificationEmail = ({ responseRecord, businessRecord }) => {
  const lines = [
    `Business: ${businessRecord.name || "Unknown"}`,
    `Website: ${businessRecord.website || ""}`,
    `Email: ${businessRecord.email || ""}`,
    `Follow-up: ${businessRecord.followUpStatus || "permission blank"}`,
    `Current AI use: ${answerList(responseRecord.answers, "Current AI use").join(", ")}`,
    `Main pain point: ${answerList(responseRecord.answers, "Main pain point").join(", ")}`,
    `Desired AI possibility: ${answerList(responseRecord.answers, "Desired AI possibility").join(", ")}`,
    `Best 30-day fix: ${normalize(responseRecord.answers["Best 30-day fix"])}`,
    "",
    "Full response JSON:",
    JSON.stringify(responseRecord.answers, null, 2),
  ];

  return [
    `From: ${escapeHeader(FROM_EMAIL)}`,
    `To: ${escapeHeader(ADMIN_EMAIL)}`,
    `Subject: ${escapeHeader(`AI Usage survey: ${businessRecord.name || responseRecord.id}`)}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    lines.join("\n"),
  ].join("\n");
};

const writeNotificationOutbox = async (emailBody, notificationId) => {
  const outboxDir = path.join(path.dirname(DB_PATH), "notification-outbox");
  await fs.mkdir(outboxDir, { recursive: true });
  const filePath = path.join(outboxDir, `${notificationId}.eml`);
  await fs.writeFile(filePath, emailBody, "utf8");
  return filePath;
};

const sendAdminNotification = async ({ responseRecord, businessRecord }) => {
  const notificationId = crypto.randomUUID();
  const emailBody = buildNotificationEmail({ responseRecord, businessRecord });

  try {
    await fs.access(SENDMAIL_PATH);
    await new Promise((resolve, reject) => {
      const child = spawn(SENDMAIL_PATH, ["-t", "-oi"], {
        stdio: ["pipe", "ignore", "pipe"],
      });

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr || `sendmail exited with status ${code}`));
      });
      child.stdin.end(emailBody);
    });

    return {
      id: notificationId,
      status: "sent",
      channel: "sendmail",
      createdAt: nowIso(),
      to: ADMIN_EMAIL,
    };
  } catch (error) {
    const outboxPath = await writeNotificationOutbox(emailBody, notificationId);
    return {
      id: notificationId,
      status: "queued",
      channel: "outbox",
      createdAt: nowIso(),
      to: ADMIN_EMAIL,
      outboxPath,
      error: error.message,
    };
  }
};

const syncSpreadsheet = async ({ responseRecord, businessRecord }) => {
  const syncId = crypto.randomUUID();
  const createdAt = nowIso();

  try {
    const result = await syncSurveyToSheets({ responseRecord, businessRecord });
    return {
      id: syncId,
      responseId: responseRecord.id,
      businessId: businessRecord.id,
      status: result.status,
      responseAction: result.responseAction || "",
      businessAction: result.businessAction || "",
      chartRefreshStatus: result.chartRefreshStatus || "",
      chartRefreshUpdatedCharts: result.chartRefreshUpdatedCharts || 0,
      chartRefreshReason: result.chartRefreshReason || "",
      chartRefreshError: result.chartRefreshError || "",
      reason: result.reason || "",
      createdAt,
    };
  } catch (error) {
    console.error(`Google Sheets sync failed for response ${responseRecord.id}: ${error.message}`);
    return {
      id: syncId,
      responseId: responseRecord.id,
      businessId: businessRecord.id,
      status: "failed",
      error: error.message,
      createdAt,
    };
  }
};

const syncBusinessSpreadsheet = async ({ businessRecord }) => {
  const syncId = crypto.randomUUID();
  const createdAt = nowIso();

  try {
    const result = await syncBusinessToSheets({ businessRecord });
    return {
      id: syncId,
      responseId: "",
      businessId: businessRecord.id,
      status: result.status,
      responseAction: "",
      businessAction: result.businessAction || "",
      chartRefreshStatus: result.chartRefreshStatus || "",
      chartRefreshUpdatedCharts: result.chartRefreshUpdatedCharts || 0,
      chartRefreshReason: result.chartRefreshReason || "",
      chartRefreshError: result.chartRefreshError || "",
      reason: result.reason || "",
      createdAt,
    };
  } catch (error) {
    console.error(`Google Sheets sync failed for business ${businessRecord.id}: ${error.message}`);
    return {
      id: syncId,
      responseId: "",
      businessId: businessRecord.id,
      status: "failed",
      error: error.message,
      createdAt,
    };
  }
};

const validateSurveyPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return "Payload must be a JSON object.";
  }

  if (!payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
    return "Payload must include an answers object.";
  }

  const businessName = normalize(payload.answers["Business name"]);
  const website = normalize(payload.answers.Website);
  const email = normalize(payload.answers.Email);
  const hasCurrentAiUse = toArray(payload.answers["Current AI use"]).length || normalize(payload.answers["Current AI use - Custom"]);
  const hasMainPainPoint = toArray(payload.answers["Main pain point"]).length || normalize(payload.answers["Main pain point - Custom"]);
  const hasDesiredPossibility =
    toArray(payload.answers["Desired AI possibility"]).length || normalize(payload.answers["Desired AI possibility - Custom"]);

  if (!businessName && !website && !email) {
    return "Add at least a business name, website, or email.";
  }

  if (!hasCurrentAiUse || !hasMainPainPoint || !hasDesiredPossibility) {
    return "The three survey questions need at least one answer each.";
  }

  return "";
};

const validateBusinessMarkerPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return "Payload must be a JSON object.";
  }

  if (!payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
    return "Payload must include an answers object.";
  }

  const businessName = normalize(payload.answers["Business name"]);
  const website = normalize(payload.answers.Website);
  const email = normalize(payload.answers.Email);
  const googlePlaceId = normalize(payload.answers["Google Place ID"]);

  if (!businessName && !website && !email && !googlePlaceId) {
    return "Add at least a business name, website, email, or confirmed Google business.";
  }

  return "";
};

const findBusinessIndex = (businesses, answers) => {
  const providedBusinessId = normalize(answers.businessId);

  if (providedBusinessId) {
    const index = businesses.findIndex((business) => business.id === providedBusinessId);
    if (index >= 0) {
      return index;
    }
  }

  const website = normalize(answers.Website).toLowerCase();
  const email = normalize(answers.Email).toLowerCase();
  const businessName = normalize(answers["Business name"]).toLowerCase();
  const googlePlaceId = normalize(answers["Google Place ID"]);

  return businesses.findIndex((business) => {
    if (googlePlaceId && normalize(business.googlePlaceId) === googlePlaceId) {
      return true;
    }

    if (website && normalize(business.website).toLowerCase() === website) {
      return true;
    }

    if (email && normalize(business.email).toLowerCase() === email) {
      return true;
    }

    return businessName && normalize(business.name).toLowerCase() === businessName;
  });
};

const buildBusinessRecord = ({
  previousBusiness,
  businessId,
  answers,
  responseId = "",
  source = "survey",
  submittedAt,
  testSubmission,
  submissionTag,
  overrides = {},
}) => {
  const priorityAreas = toArray(answers.Priority);

  return {
    id: businessId,
    name: preferSubmitted(previousBusiness, "name", answers["Business name"]),
    website: preferSubmitted(previousBusiness, "website", answers.Website),
    email: preferSubmitted(previousBusiness, "email", answers.Email),
    address: preferSubmitted(previousBusiness, "address", answers["Business address"]),
    googlePlaceId: preferSubmitted(previousBusiness, "googlePlaceId", answers["Google Place ID"]),
    googleMapsUrl: preferSubmitted(previousBusiness, "googleMapsUrl", answers["Google Maps URL"]),
    latitude: preferSubmitted(previousBusiness, "latitude", answers["Business latitude"]),
    longitude: preferSubmitted(previousBusiness, "longitude", answers["Business longitude"]),
    locationAccuracyMeters: preferSubmitted(previousBusiness, "locationAccuracyMeters", answers["Location accuracy"]),
    businessDistanceMeters: preferSubmitted(previousBusiness, "businessDistanceMeters", answers["Business distance meters"]),
    locationSource: preferSubmitted(previousBusiness, "locationSource", answers["Location source"]),
    locationLabel: preferSubmitted(previousBusiness, "locationLabel", answers["Location label"]),
    locationConfirmed: normalize(answers["Location confirmed"]) === "Yes"
      ? "Yes"
      : normalize(previousBusiness?.locationConfirmed) || normalize(answers["Location confirmed"]),
    followUpStatus: preferSubmitted(previousBusiness, "followUpStatus", answers["Follow-up permission"]) || "permission blank",
    solicitationStatus: normalize(previousBusiness?.solicitationStatus) || "unmarked",
    doNotSolicit: normalize(previousBusiness?.doNotSolicit) || "No",
    doNotSolicitAt: normalize(previousBusiness?.doNotSolicitAt),
    doNotSolicitReason: normalize(previousBusiness?.doNotSolicitReason),
    contactRole: preferSubmitted(previousBusiness, "contactRole", answers["Contact role"]),
    shareMoreDetail: preferSubmitted(previousBusiness, "shareMoreDetail", answers["Share more detail"]),
    computerUse: preferSubmitted(previousBusiness, "computerUse", answers["Computer use"]),
    willingnessToPay: preferSubmitted(previousBusiness, "willingnessToPay", answers["Willingness to pay"]),
    marketingTools: preferSubmitted(previousBusiness, "marketingTools", answers["Marketing tools"]),
    websiteLikesAndDislikes: preferSubmitted(previousBusiness, "websiteLikesAndDislikes", answers["Website likes and dislikes"]),
    leadLeakage: preferSubmitted(previousBusiness, "leadLeakage", answers["Lead leakage"]),
    mostValuableCustomer: preferSubmitted(previousBusiness, "mostValuableCustomer", answers["Most valuable customer"]),
    priorityAreas: preferSubmittedArray(previousBusiness, "priorityAreas", priorityAreas),
    best30DayFix: preferSubmitted(previousBusiness, "best30DayFix", answers["Best 30-day fix"]),
    testSubmission: testSubmission ? "Yes" : "No",
    submissionTag,
    currentAiUse: preferSubmittedArray(previousBusiness, "currentAiUse", answerList(answers, "Current AI use")),
    mainPainPoint: preferSubmittedArray(previousBusiness, "mainPainPoint", answerList(answers, "Main pain point")),
    desiredAiPossibility: preferSubmittedArray(previousBusiness, "desiredAiPossibility", answerList(answers, "Desired AI possibility")),
    latestResponseId: responseId || normalize(previousBusiness?.latestResponseId),
    updatedAt: submittedAt,
    createdAt: previousBusiness?.createdAt || submittedAt,
    source,
    slug: previousBusiness?.slug || slugify(normalize(answers["Business name"]) || normalize(answers.Website) || businessId),
    ...overrides,
  };
};

const upsertSurveyResponse = async (payload, request) => {
  const submittedAt = nowIso();
  const responseId = normalize(payload.responseId) || crypto.randomUUID();
  const source = normalize(payload.source) || "survey";
  const answers = normalizeSubmissionAnswers(payload.answers, source);
  const testSubmission = isTestSubmission(answers, source);
  const submissionTag = testSubmission ? "test" : "live";
  await appendCaptureLog({
    id: responseId,
    source,
    submissionTag,
    testSubmission,
    answers,
    userAgent: request.headers["user-agent"] || "",
    ip: request.headers["x-forwarded-for"] || request.socket.remoteAddress || "",
    receivedAt: submittedAt,
  });

  const saveResult = await withDatabase(async (database) => {
    const businessIndex = findBusinessIndex(database.businesses, answers);
    const previousBusiness = businessIndex >= 0 ? database.businesses[businessIndex] : null;
    const businessId = previousBusiness?.id || crypto.randomUUID();
    const businessRecord = buildBusinessRecord({
      previousBusiness,
      businessId,
      answers,
      responseId,
      source: "survey",
      submittedAt,
      testSubmission,
      submissionTag,
    });

    if (businessIndex >= 0) {
      database.businesses[businessIndex] = {
        ...previousBusiness,
        ...businessRecord,
      };
    } else {
      database.businesses.push(businessRecord);
    }

    const responseRecord = {
      id: responseId,
      businessId,
      answers,
      source,
      testSubmission: testSubmission ? "Yes" : "No",
      submissionTag,
      userAgent: request.headers["user-agent"] || "",
      ip: request.headers["x-forwarded-for"] || request.socket.remoteAddress || "",
      updatedAt: submittedAt,
      createdAt: submittedAt,
    };

    const responseIndex = database.surveyResponses.findIndex((response) => response.id === responseId);

    if (responseIndex >= 0) {
      responseRecord.createdAt = database.surveyResponses[responseIndex].createdAt || submittedAt;
      database.surveyResponses[responseIndex] = responseRecord;
    } else {
      database.surveyResponses.push(responseRecord);
    }

    return {
      responseRecord,
      businessRecord: database.businesses.find((business) => business.id === businessId),
      created: responseIndex < 0,
    };
  });

  const notificationRecord = await sendAdminNotification({
    responseRecord: saveResult.responseRecord,
    businessRecord: saveResult.businessRecord,
  });

  await withDatabase(async (database) => {
    notificationRecord.responseId = responseId;
    notificationRecord.businessId = saveResult.businessRecord.id;
    database.notifications.push(notificationRecord);
  });

  const sheetSyncRecord = await syncSpreadsheet({
    responseRecord: saveResult.responseRecord,
    businessRecord: saveResult.businessRecord,
  });

  await withDatabase(async (database) => {
    database.sheetSyncs.push(sheetSyncRecord);
  });

  return {
    ...saveResult,
    notificationRecord,
    sheetSyncRecord,
  };
};

const markBusinessDoNotSolicit = async (payload, request) => {
  const markedAt = nowIso();
  const source = normalize(payload.source) || "do-not-solicit";
  const answers = normalizeSubmissionAnswers({
    ...payload.answers,
    "Follow-up permission": "Do not solicit",
  }, source);
  const testSubmission = isTestSubmission(answers, source);
  const submissionTag = testSubmission ? "test" : "live";
  const reason = normalize(payload.reason) || normalize(answers["Do not solicit reason"]) || "Declined survey";

  await appendCaptureLog({
    id: crypto.randomUUID(),
    source,
    submissionTag,
    testSubmission,
    answers,
    outcome: "do_not_solicit",
    reason,
    userAgent: request.headers["user-agent"] || "",
    ip: request.headers["x-forwarded-for"] || request.socket.remoteAddress || "",
    receivedAt: markedAt,
  });

  const saveResult = await withDatabase(async (database) => {
    const businessIndex = findBusinessIndex(database.businesses, answers);
    const previousBusiness = businessIndex >= 0 ? database.businesses[businessIndex] : null;
    const businessId = previousBusiness?.id || crypto.randomUUID();
    const businessRecord = buildBusinessRecord({
      previousBusiness,
      businessId,
      answers,
      source,
      submittedAt: markedAt,
      testSubmission,
      submissionTag,
      overrides: {
        followUpStatus: "do not solicit",
        solicitationStatus: "do_not_solicit",
        doNotSolicit: "Yes",
        doNotSolicitAt: markedAt,
        doNotSolicitReason: reason,
      },
    });

    if (businessIndex >= 0) {
      database.businesses[businessIndex] = {
        ...previousBusiness,
        ...businessRecord,
      };
    } else {
      database.businesses.push(businessRecord);
    }

    return {
      businessRecord: database.businesses.find((business) => business.id === businessId),
      created: businessIndex < 0,
    };
  });

  const sheetSyncRecord = await syncBusinessSpreadsheet({
    businessRecord: saveResult.businessRecord,
  });

  await withDatabase(async (database) => {
    database.sheetSyncs.push(sheetSyncRecord);
  });

  return {
    ...saveResult,
    sheetSyncRecord,
  };
};

const isAuthorized = (request) => {
  if (!ADMIN_API_TOKEN) {
    return false;
  }

  return request.headers.authorization === `Bearer ${ADMIN_API_TOKEN}`;
};

const handleRequest = async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "ai-usage-api",
      dbPath: DB_PATH,
      time: nowIso(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/maps/config") {
    sendJson(response, 200, {
      ok: true,
      googleMapsEnabled: Boolean(GOOGLE_MAPS_BROWSER_KEY),
      googleMapsBrowserKey: GOOGLE_MAPS_BROWSER_KEY,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/survey-responses") {
    const payload = await readRequestJson(request);
    const validationError = validateSurveyPayload(payload);

    if (validationError) {
      sendJson(response, 400, {
        ok: false,
        error: validationError,
      });
      return;
    }

    const result = await upsertSurveyResponse(payload, request);
    sendJson(response, 200, {
      ok: true,
      responseId: result.responseRecord.id,
      businessId: result.businessRecord.id,
      notificationStatus: result.notificationRecord.status,
      sheetSyncStatus: result.sheetSyncRecord.status,
      savedAt: result.responseRecord.updatedAt,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/businesses/do-not-solicit") {
    const payload = await readRequestJson(request);
    const validationError = validateBusinessMarkerPayload(payload);

    if (validationError) {
      sendJson(response, 400, {
        ok: false,
        error: validationError,
      });
      return;
    }

    const result = await markBusinessDoNotSolicit(payload, request);
    sendJson(response, 200, {
      ok: true,
      businessId: result.businessRecord.id,
      created: result.created,
      doNotSolicit: result.businessRecord.doNotSolicit,
      solicitationStatus: result.businessRecord.solicitationStatus,
      sheetSyncStatus: result.sheetSyncRecord.status,
      savedAt: result.businessRecord.updatedAt,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/survey-responses") {
    if (!isAuthorized(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized." });
      return;
    }

    const database = await readDatabase();
    sendJson(response, 200, {
      ok: true,
      surveyResponses: database.surveyResponses,
      businesses: database.businesses,
      sheetSyncs: database.sheetSyncs,
    });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, {
      ok: false,
      error: "Not found.",
    });
    return;
  }

  await sendStatic(request, response, url.pathname);
};

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    const statusCode = error.statusCode || 500;
    sendJson(response, statusCode, {
      ok: false,
      error: statusCode === 500 ? "Internal server error." : error.message,
    });

    console.error(error);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`AI Usage API listening on http://${HOST}:${PORT}`);
  console.log(`Database path: ${DB_PATH}`);
});
