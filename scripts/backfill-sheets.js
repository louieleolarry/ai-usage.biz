#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { syncBusinessToSheets, syncSurveyToSheets } = require("../api/google-sheets");

const DB_PATH = path.resolve(process.env.AI_USAGE_DB_PATH || "/var/lib/ai-usage/local-db.json");

const readDatabase = () => {
  const raw = fs.readFileSync(DB_PATH, "utf8");
  const database = JSON.parse(raw);

  return {
    surveyResponses: Array.isArray(database.surveyResponses) ? database.surveyResponses : [],
    businesses: Array.isArray(database.businesses) ? database.businesses : [],
  };
};

const main = async () => {
  const database = readDatabase();
  const syncedBusinessIds = new Set();
  let responsesSynced = 0;
  let businessesSynced = 0;
  let failed = 0;

  for (const responseRecord of database.surveyResponses) {
    const businessRecord = database.businesses.find((business) => business.id === responseRecord.businessId);

    if (!businessRecord) {
      failed += 1;
      console.error(`Missing business for response ${responseRecord.id}`);
      continue;
    }

    try {
      const result = await syncSurveyToSheets({ responseRecord, businessRecord });
      responsesSynced += 1;
      syncedBusinessIds.add(businessRecord.id);
      console.log(`${responseRecord.id}: ${result.status} (${result.responseAction || "response skipped"}, ${result.businessAction || "business skipped"})`);
    } catch (error) {
      failed += 1;
      console.error(`${responseRecord.id}: ${error.message}`);
    }
  }

  for (const businessRecord of database.businesses) {
    if (syncedBusinessIds.has(businessRecord.id)) {
      continue;
    }

    try {
      const result = await syncBusinessToSheets({ businessRecord });
      businessesSynced += 1;
      console.log(`${businessRecord.id}: ${result.status} (${result.businessAction || "business skipped"})`);
    } catch (error) {
      failed += 1;
      console.error(`${businessRecord.id}: ${error.message}`);
    }
  }

  console.log(JSON.stringify({
    dbPath: DB_PATH,
    responses: database.surveyResponses.length,
    businesses: database.businesses.length,
    responsesSynced,
    businessesSynced,
    failed,
  }));

  if (failed) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
