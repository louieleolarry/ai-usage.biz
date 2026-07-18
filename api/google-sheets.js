const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const https = require("node:https");

const SPREADSHEET_ID = process.env.AI_USAGE_GOOGLE_SHEET_ID || "";
const DEFAULT_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let accessTokenCache = null;

const RESPONSE_SHEET = "Survey Responses";
const BUSINESS_SHEET = "Businesses";

const responseHeaders = [
  "Business Name",
  "Business ID",
  "Response ID",
  "Submitted At",
  "Created At",
  "Source",
  "Website",
  "Email",
  "Contact Role",
  "Follow-up Permission",
  "Current AI Use",
  "Current AI Use Custom",
  "Main Pain Point",
  "Main Pain Point Custom",
  "Desired AI Possibility",
  "Desired AI Possibility Custom",
  "Best 30-day Fix",
  "Computer Use",
  "Willingness To Pay",
  "Marketing Tools",
  "Website Likes And Dislikes",
  "Lead Leakage",
  "Most Valuable Customer",
  "Priority",
  "Google Place ID",
  "Google Maps URL",
  "Business Address",
  "Business Latitude",
  "Business Longitude",
  "Location Accuracy",
  "Business Distance Meters",
  "Location Source",
  "Location Label",
  "Location Confirmed",
  "User Agent",
  "IP",
  "Answers JSON",
  "Test Submission",
  "Submission Tag",
];

const businessHeaders = [
  "Business ID",
  "Latest Response ID",
  "Updated At",
  "Created At",
  "Name",
  "Website",
  "Email",
  "Address",
  "Google Place ID",
  "Google Maps URL",
  "Latitude",
  "Longitude",
  "Location Confirmed",
  "Location Source",
  "Location Label",
  "Location Accuracy Meters",
  "Business Distance Meters",
  "Follow-up Status",
  "Contact Role",
  "Share More Detail",
  "Current AI Use",
  "Main Pain Point",
  "Desired AI Possibility",
  "Computer Use",
  "Willingness To Pay",
  "Marketing Tools",
  "Website Likes And Dislikes",
  "Lead Leakage",
  "Most Valuable Customer",
  "Priority Areas",
  "Best 30-day Fix",
  "Slug",
  "Source",
  "Test Submission",
  "Submission Tag",
  "Solicitation Status",
  "Do Not Solicit",
  "Do Not Solicit At",
  "Do Not Solicit Reason",
];

const normalize = (value) => String(value || "").trim();

const toArray = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalize).filter(Boolean);
  }

  const cleanValue = normalize(value);
  return cleanValue ? [cleanValue] : [];
};

const joinValues = (value) => toArray(value).join("; ");

const answerList = (answers, key) => [
  ...toArray(answers[key]),
  ...toArray(answers[`${key} - Custom`]),
];

const getSubmissionTag = ({ answers = {}, name = "", source = "", submissionTag = "" } = {}) => {
  const values = [
    ...toArray(answers["Test submission"]),
    ...toArray(answers["Submission tag"]),
    normalize(answers["Business name"]),
    normalize(name),
    normalize(source),
    normalize(submissionTag),
  ].map((value) => value.toLowerCase());

  return values.some((value) => ["yes", "true", "test", "production-smoke"].includes(value) || /(^|[-\s])smoke($|[-\s])|^test/.test(value)) ? "test" : "live";
};

const getTestSubmissionValue = (record = {}) => getSubmissionTag(record) === "test" ? "Yes" : "No";

const base64Url = (value) => Buffer.from(value)
  .toString("base64")
  .replace(/=/g, "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_");

const requestJson = (url, { method = "GET", headers = {}, body = "" } = {}) =>
  new Promise((resolve, reject) => {
    const request = https.request(url, {
      method,
      headers: {
        Accept: "application/json",
        ...headers,
      },
    }, (response) => {
      let responseBody = "";

      response.on("data", (chunk) => {
        responseBody += chunk;
      });

      response.on("end", () => {
        let parsed = {};

        if (responseBody.trim()) {
          try {
            parsed = JSON.parse(responseBody);
          } catch (error) {
            reject(new Error(`Google API returned invalid JSON: ${error.message}`));
            return;
          }
        }

        if (response.statusCode >= 400) {
          reject(new Error(parsed.error?.message || parsed.error_description || `Google API returned ${response.statusCode}`));
          return;
        }

        resolve(parsed);
      });
    });

    request.on("error", reject);
    request.setTimeout(15000, () => {
      request.destroy(new Error("Google API request timed out."));
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });

const parseCredentialsJson = (raw) => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Google credentials JSON: ${error.message}`);
  }
};

const readCredentialsFile = async (filePath) => {
  if (!filePath) {
    return null;
  }

  return parseCredentialsJson(await fs.readFile(filePath, "utf8"));
};

const getCredentials = async () => {
  const directJson = parseCredentialsJson(process.env.AI_USAGE_GOOGLE_CREDENTIALS_JSON || "");

  if (directJson) {
    return directJson;
  }

  if (process.env.AI_USAGE_GOOGLE_CREDENTIALS_PATH) {
    return readCredentialsFile(process.env.AI_USAGE_GOOGLE_CREDENTIALS_PATH);
  }

  if (process.env.AI_USAGE_GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.AI_USAGE_GOOGLE_PRIVATE_KEY) {
    return {
      type: "service_account",
      client_email: process.env.AI_USAGE_GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.AI_USAGE_GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      token_uri: TOKEN_URL,
    };
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return readCredentialsFile(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  return null;
};

const getServiceAccountAccessToken = async (credentials) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claim = {
    iss: credentials.client_email,
    scope: DEFAULT_SCOPES.join(" "),
    aud: credentials.token_uri || TOKEN_URL,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(credentials.private_key);
  const assertion = `${signingInput}.${base64Url(signature)}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }).toString();
  const result = await requestJson(credentials.token_uri || TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  return {
    accessToken: result.access_token,
    expiresAt: Date.now() + Math.max(0, Number(result.expires_in || 3600) - 60) * 1000,
  };
};

const getAuthorizedUserAccessToken = async (credentials) => {
  const body = new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: credentials.refresh_token,
    grant_type: "refresh_token",
  }).toString();
  const result = await requestJson(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  return {
    accessToken: result.access_token,
    expiresAt: Date.now() + Math.max(0, Number(result.expires_in || 3600) - 60) * 1000,
  };
};

const getAccessToken = async () => {
  if (accessTokenCache?.accessToken && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.accessToken;
  }

  const credentials = await getCredentials();

  if (!credentials) {
    throw new Error("Google Sheets credentials are not configured.");
  }

  if (credentials.type === "service_account") {
    accessTokenCache = await getServiceAccountAccessToken(credentials);
    return accessTokenCache.accessToken;
  }

  if (credentials.type === "authorized_user") {
    accessTokenCache = await getAuthorizedUserAccessToken(credentials);
    return accessTokenCache.accessToken;
  }

  throw new Error(`Unsupported Google credentials type: ${credentials.type || "unknown"}`);
};

const isSheetsConfigured = () => Boolean(SPREADSHEET_ID);

const sheetsRequest = async (apiPath, { method = "GET", body } = {}) => {
  if (!SPREADSHEET_ID) {
    throw new Error("AI_USAGE_GOOGLE_SHEET_ID is not configured.");
  }

  const accessToken = await getAccessToken();
  const requestBody = body ? JSON.stringify(body) : "";
  return requestJson(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(requestBody ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      } : {}),
    },
    body: requestBody,
  });
};

const quoteSheetName = (sheetName) => `'${String(sheetName).replace(/'/g, "''")}'`;

const columnName = (index) => {
  let number = index + 1;
  let name = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - remainder) / 26);
  }

  return name;
};

const ensureSheet = async (sheetName) => {
  const metadata = await sheetsRequest("?fields=sheets.properties.title");
  const exists = (metadata.sheets || []).some((sheet) => sheet.properties?.title === sheetName);

  if (exists) {
    return;
  }

  await sheetsRequest(":batchUpdate", {
    method: "POST",
    body: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
            },
          },
        },
      ],
    },
  });
};

const getSheetValues = async (sheetName, width) => {
  const lastColumn = columnName(width - 1);
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A:${lastColumn}`);

  try {
    const result = await sheetsRequest(`/values/${range}?majorDimension=ROWS`);
    return result.values || [];
  } catch (error) {
    if (/Unable to parse range|not found/i.test(error.message)) {
      return [];
    }

    throw error;
  }
};

const updateValues = async (sheetName, rowNumber, values) => {
  const lastColumn = columnName(values.length - 1);
  const sheetRange = `${quoteSheetName(sheetName)}!A${rowNumber}:${lastColumn}${rowNumber}`;
  const range = encodeURIComponent(sheetRange);
  await sheetsRequest(`/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    body: {
      range: sheetRange,
      majorDimension: "ROWS",
      values: [values],
    },
  });
};

const appendValues = async (sheetName, values) => {
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A:A`);
  await sheetsRequest(`/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: {
      majorDimension: "ROWS",
      values: [values],
    },
  });
};

const ensureHeaders = async (sheetName, headers, values) => {
  const firstRow = values[0] || [];
  const headersMatch = headers.every((header, index) => firstRow[index] === header);

  if (!headersMatch) {
    await updateValues(sheetName, 1, headers);
  }
};

const findSheetRowMatch = ({ values, headers, keyHeader, row }) => {
  const keyIndex = headers.indexOf(keyHeader);
  const keyValue = row[keyIndex];
  const exactIndex = values.findIndex((existingRow, index) => index > 0 && existingRow[keyIndex] === keyValue);

  if (exactIndex >= 0 || keyHeader !== "Response ID") {
    return {
      index: exactIndex,
      legacyColumns: false,
    };
  }

  const businessIdIndex = headers.indexOf("Business ID");

  if (businessIdIndex < 0) {
    return {
      index: -1,
      legacyColumns: false,
    };
  }

  const legacyIndex = values.findIndex((existingRow, index) =>
    index > 0
      && existingRow[keyIndex] === row[businessIdIndex]
      && existingRow[businessIdIndex] === keyValue
  );

  return {
    index: legacyIndex,
    legacyColumns: legacyIndex >= 0,
  };
};

const upsertSheetRow = async ({ sheetName, headers, keyHeader, row }) => {
  await ensureSheet(sheetName);

  const values = await getSheetValues(sheetName, headers.length);
  await ensureHeaders(sheetName, headers, values);

  const rowMatch = findSheetRowMatch({ values, headers, keyHeader, row });

  if (rowMatch.index >= 0) {
    await updateValues(sheetName, rowMatch.index + 1, row);
    return {
      action: rowMatch.legacyColumns ? "updated-legacy" : "updated",
      rowCount: values.length,
    };
  }

  await appendValues(sheetName, row);
  return {
    action: "inserted",
    rowCount: Math.max(values.length + 1, 2),
  };
};

const getSpreadsheetMetadata = async () =>
  sheetsRequest("?fields=sheets(properties(sheetId,title),charts(chartId,spec))");

const updateChartSpec = async (chartId, spec) =>
  sheetsRequest(":batchUpdate", {
    method: "POST",
    body: {
      requests: [
        {
          updateChartSpec: {
            chartId,
            spec,
          },
        },
      ],
    },
  });

const expandSourceRanges = (value, rowCountBySheetId) => {
  let changed = false;

  if (Array.isArray(value)) {
    value.forEach((item) => {
      changed = expandSourceRanges(item, rowCountBySheetId) || changed;
    });
    return changed;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value.sourceRange?.sources)) {
    value.sourceRange.sources.forEach((range) => {
      const rowCount = rowCountBySheetId.get(range.sheetId);

      if (rowCount && Number.isFinite(range.endRowIndex) && range.endRowIndex < rowCount) {
        range.endRowIndex = rowCount;
        changed = true;
      }
    });
  }

  Object.values(value).forEach((child) => {
    changed = expandSourceRanges(child, rowCountBySheetId) || changed;
  });

  return changed;
};

const refreshChartRanges = async (rowCountBySheetName) => {
  const sheetNames = Object.keys(rowCountBySheetName);

  if (!sheetNames.length) {
    return {
      status: "skipped",
      reason: "No synced sheet rows were provided.",
    };
  }

  const metadata = await getSpreadsheetMetadata();
  const sheetIdByName = new Map((metadata.sheets || []).map((sheet) => [
    sheet.properties?.title,
    sheet.properties?.sheetId,
  ]));
  const rowCountBySheetId = new Map();

  sheetNames.forEach((sheetName) => {
    const sheetId = sheetIdByName.get(sheetName);

    if (Number.isFinite(sheetId)) {
      rowCountBySheetId.set(sheetId, rowCountBySheetName[sheetName]);
    }
  });

  if (!rowCountBySheetId.size) {
    return {
      status: "skipped",
      reason: "Synced sheets were not found in spreadsheet metadata.",
    };
  }

  const charts = (metadata.sheets || []).flatMap((sheet) => sheet.charts || []);
  let updatedCharts = 0;

  for (const chart of charts) {
    if (!Number.isFinite(chart.chartId) || !chart.spec) {
      continue;
    }

    const spec = JSON.parse(JSON.stringify(chart.spec));

    if (expandSourceRanges(spec, rowCountBySheetId)) {
      await updateChartSpec(chart.chartId, spec);
      updatedCharts += 1;
    }
  }

  return {
    status: updatedCharts ? "updated" : "unchanged",
    updatedCharts,
  };
};

const buildResponseRow = (responseRecord) => {
  const answers = responseRecord.answers || {};

  return [
    answers["Business name"],
    responseRecord.businessId,
    responseRecord.id,
    responseRecord.updatedAt,
    responseRecord.createdAt,
    responseRecord.source,
    answers.Website,
    answers.Email,
    answers["Contact role"],
    answers["Follow-up permission"],
    joinValues(answers["Current AI use"]),
    answers["Current AI use - Custom"],
    joinValues(answers["Main pain point"]),
    answers["Main pain point - Custom"],
    joinValues(answers["Desired AI possibility"]),
    answers["Desired AI possibility - Custom"],
    answers["Best 30-day fix"],
    answers["Computer use"],
    answers["Willingness to pay"],
    answers["Marketing tools"],
    answers["Website likes and dislikes"],
    answers["Lead leakage"],
    answers["Most valuable customer"],
    joinValues(answers.Priority),
    answers["Google Place ID"],
    answers["Google Maps URL"],
    answers["Business address"],
    answers["Business latitude"],
    answers["Business longitude"],
    answers["Location accuracy"],
    answers["Business distance meters"],
    answers["Location source"],
    answers["Location label"],
    answers["Location confirmed"],
    responseRecord.userAgent,
    responseRecord.ip,
    JSON.stringify(answers),
    getTestSubmissionValue(responseRecord),
    getSubmissionTag(responseRecord),
  ].map(normalize);
};

const buildBusinessRow = (businessRecord) => [
  businessRecord.id,
  businessRecord.latestResponseId,
  businessRecord.updatedAt,
  businessRecord.createdAt,
  businessRecord.name,
  businessRecord.website,
  businessRecord.email,
  businessRecord.address,
  businessRecord.googlePlaceId,
  businessRecord.googleMapsUrl,
  businessRecord.latitude,
  businessRecord.longitude,
  businessRecord.locationConfirmed,
  businessRecord.locationSource,
  businessRecord.locationLabel,
  businessRecord.locationAccuracyMeters,
  businessRecord.businessDistanceMeters,
  businessRecord.followUpStatus,
  businessRecord.contactRole,
  businessRecord.shareMoreDetail,
  joinValues(businessRecord.currentAiUse),
  joinValues(businessRecord.mainPainPoint),
  joinValues(businessRecord.desiredAiPossibility),
  businessRecord.computerUse,
  businessRecord.willingnessToPay,
  businessRecord.marketingTools,
  businessRecord.websiteLikesAndDislikes,
  businessRecord.leadLeakage,
  businessRecord.mostValuableCustomer,
  joinValues(businessRecord.priorityAreas),
  businessRecord.best30DayFix,
  businessRecord.slug,
  businessRecord.source,
  businessRecord.testSubmission || getTestSubmissionValue(businessRecord),
  businessRecord.submissionTag || getSubmissionTag(businessRecord),
  businessRecord.solicitationStatus,
  businessRecord.doNotSolicit,
  businessRecord.doNotSolicitAt,
  businessRecord.doNotSolicitReason,
].map(normalize);

const syncSurveyToSheets = async ({ responseRecord, businessRecord }) => {
  if (!isSheetsConfigured()) {
    return {
      status: "skipped",
      reason: "Google Sheet ID is not configured.",
    };
  }

  const responseAction = await upsertSheetRow({
    sheetName: RESPONSE_SHEET,
    headers: responseHeaders,
    keyHeader: "Response ID",
    row: buildResponseRow(responseRecord),
  });
  const businessAction = await upsertSheetRow({
    sheetName: BUSINESS_SHEET,
    headers: businessHeaders,
    keyHeader: "Business ID",
    row: buildBusinessRow(businessRecord),
  });
  let chartRefresh = {
    status: "skipped",
    reason: "Chart ranges were not refreshed.",
  };

  try {
    chartRefresh = await refreshChartRanges({
      [RESPONSE_SHEET]: responseAction.rowCount,
      [BUSINESS_SHEET]: businessAction.rowCount,
    });
  } catch (error) {
    chartRefresh = {
      status: "failed",
      error: error.message,
    };
  }

  return {
    status: "synced",
    responseAction: responseAction.action,
    businessAction: businessAction.action,
    chartRefreshStatus: chartRefresh.status,
    chartRefreshUpdatedCharts: chartRefresh.updatedCharts || 0,
    chartRefreshReason: chartRefresh.reason || "",
    chartRefreshError: chartRefresh.error || "",
  };
};

const syncBusinessToSheets = async ({ businessRecord }) => {
  if (!isSheetsConfigured()) {
    return {
      status: "skipped",
      reason: "Google Sheet ID is not configured.",
    };
  }

  const businessAction = await upsertSheetRow({
    sheetName: BUSINESS_SHEET,
    headers: businessHeaders,
    keyHeader: "Business ID",
    row: buildBusinessRow(businessRecord),
  });
  let chartRefresh = {
    status: "skipped",
    reason: "Chart ranges were not refreshed.",
  };

  try {
    chartRefresh = await refreshChartRanges({
      [BUSINESS_SHEET]: businessAction.rowCount,
    });
  } catch (error) {
    chartRefresh = {
      status: "failed",
      error: error.message,
    };
  }

  return {
    status: "synced",
    businessAction: businessAction.action,
    chartRefreshStatus: chartRefresh.status,
    chartRefreshUpdatedCharts: chartRefresh.updatedCharts || 0,
    chartRefreshReason: chartRefresh.reason || "",
    chartRefreshError: chartRefresh.error || "",
  };
};

module.exports = {
  BUSINESS_SHEET,
  RESPONSE_SHEET,
  businessHeaders,
  findSheetRowMatch,
  getSubmissionTag,
  isSheetsConfigured,
  responseHeaders,
  syncBusinessToSheets,
  syncSurveyToSheets,
};
