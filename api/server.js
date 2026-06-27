const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.PORT || process.env.AI_USAGE_API_PORT || 8011);
const HOST = process.env.AI_USAGE_API_HOST || "127.0.0.1";
const DB_PATH = path.resolve(process.env.AI_USAGE_DB_PATH || "/var/lib/ai-usage/local-db.json");
const ADMIN_EMAIL = process.env.AI_USAGE_ADMIN_EMAIL || "hello@ai-usage.biz";
const FROM_EMAIL = process.env.AI_USAGE_FROM_EMAIL || "AI Usage <hello@ai-usage.biz>";
const SENDMAIL_PATH = process.env.AI_USAGE_SENDMAIL_PATH || "/usr/sbin/sendmail";
const ADMIN_API_TOKEN = process.env.AI_USAGE_ADMIN_API_TOKEN || "";
const MAX_BODY_BYTES = 64 * 1024;

let writeQueue = Promise.resolve();

const nowIso = () => new Date().toISOString();

const baseDatabase = () => ({
  surveyResponses: [],
  businesses: [],
  notifications: [],
});

const ensureDbDir = async () => {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
};

const readDatabase = async () => {
  await ensureDbDir();

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...baseDatabase(),
      ...parsed,
      surveyResponses: Array.isArray(parsed.surveyResponses) ? parsed.surveyResponses : [],
      businesses: Array.isArray(parsed.businesses) ? parsed.businesses : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
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

  return businesses.findIndex((business) => {
    if (website && normalize(business.website).toLowerCase() === website) {
      return true;
    }

    if (email && normalize(business.email).toLowerCase() === email) {
      return true;
    }

    return businessName && normalize(business.name).toLowerCase() === businessName;
  });
};

const upsertSurveyResponse = async (payload, request) => {
  const submittedAt = nowIso();
  const responseId = normalize(payload.responseId) || crypto.randomUUID();
  const answers = payload.answers;
  const saveResult = await withDatabase(async (database) => {
    const businessIndex = findBusinessIndex(database.businesses, answers);
    const previousBusiness = businessIndex >= 0 ? database.businesses[businessIndex] : null;
    const businessId = previousBusiness?.id || crypto.randomUUID();
    const businessRecord = {
      id: businessId,
      name: normalize(answers["Business name"]),
      website: normalize(answers.Website),
      email: normalize(answers.Email),
      followUpStatus: normalize(answers["Follow-up permission"]) || "permission blank",
      currentAiUse: answerList(answers, "Current AI use"),
      mainPainPoint: answerList(answers, "Main pain point"),
      desiredAiPossibility: answerList(answers, "Desired AI possibility"),
      latestResponseId: responseId,
      updatedAt: submittedAt,
      createdAt: previousBusiness?.createdAt || submittedAt,
      source: "survey",
      slug: previousBusiness?.slug || slugify(normalize(answers["Business name"]) || normalize(answers.Website) || businessId),
    };

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
      source: normalize(payload.source) || "survey",
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

  return {
    ...saveResult,
    notificationRecord,
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
    sendJson(response, result.created ? 201 : 200, {
      ok: true,
      responseId: result.responseRecord.id,
      businessId: result.businessRecord.id,
      notificationStatus: result.notificationRecord.status,
      savedAt: result.responseRecord.updatedAt,
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
    });
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "Not found.",
  });
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
