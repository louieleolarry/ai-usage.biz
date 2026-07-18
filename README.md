# ai-usage.biz

Basic static site for AI Usage.

Includes a small Node API for survey persistence and admin notifications.

## Local Files

- `index.html`
- `styles.css`
- `survey.html`
- `business.html`
- `autonomous-business-bot.html`
- `api/server.js`
- `ops/ai-usage-api.service`
- `nginx/ai-usage.biz.conf`

Private prospecting notes and marketing working files are intentionally excluded
from this repo.

## Remote Target

- Host: `ubuntu@44.228.191.227`
- Web root: `/var/www/ai-usage.biz/html`
- Nginx config: `/etc/nginx/sites-available/ai-usage.biz`
- Enabled symlink: `/etc/nginx/sites-enabled/ai-usage.biz`
- HTTPS: enabled with Certbot for `ai-usage.biz` and `www.ai-usage.biz`
- Certificate expiry: 2026-09-24

## Email Forwarding

- Registrar/DNS: Namecheap BasicDNS
- Mail Settings: Email Forwarding
- Catch-all redirect: `*@ai-usage.biz` forwards to the private operator inbox
- Added: 2026-06-26
- Namecheap note: forwarding changes may take up to 60 minutes to take effect.

Current public mail DNS:

```sh
dig ai-usage.biz MX
dig ai-usage.biz TXT
```

Renewal should be handled by the host's existing Certbot renewal setup. To inspect the certificate:

```sh
sudo certbot certificates
```

## Survey API

Local dev:

```sh
npm run dev
curl http://127.0.0.1:8011/api/health
```

Production route:

- Nginx proxies `/api/` to `http://127.0.0.1:8011/api/`.
- Survey responses save to `AI_USAGE_DB_PATH`, defaulting to
  `/var/lib/ai-usage/local-db.json`.
- Each accepted survey payload is also appended to `survey-capture-log.jsonl`
  next to the database, or to `AI_USAGE_CAPTURE_LOG_PATH` when set.
- Each save attempts an admin notification email to `AI_USAGE_ADMIN_EMAIL`.
- If local sendmail is unavailable, the notification is queued as an `.eml`
  file next to the database instead of blocking capture.
- Empty database files are treated as a fresh database. Invalid JSON database
  files are copied aside with an `.invalid-*` suffix before a new database is
  written, so new survey capture is not blocked by a damaged JSON file.
- `POST /api/businesses/do-not-solicit` upserts a business-only record with
  `solicitationStatus: "do_not_solicit"` when an owner declines the survey, so
  the business can be skipped on future visits without creating a survey
  response.

Minimum production environment:

```sh
PORT=8011
AI_USAGE_DB_PATH=/var/lib/ai-usage/local-db.json
AI_USAGE_ADMIN_EMAIL=hello@ai-usage.biz
AI_USAGE_ADMIN_API_TOKEN=replace-with-a-private-token
AI_USAGE_GOOGLE_MAPS_BROWSER_KEY=replace-with-restricted-google-maps-browser-key
AI_USAGE_CAPTURE_LOG_PATH=/var/lib/ai-usage/survey-capture-log.jsonl
AI_USAGE_GOOGLE_SHEET_ID=1xl6LGpQ5sP3q5U8bMk36uwyR84AJUftyrBTJfp-aZio
AI_USAGE_GOOGLE_CREDENTIALS_PATH=/etc/ai-usage-google-credentials.json
```

The starter systemd unit lives at `ops/ai-usage-api.service`; keep the private
`AI_USAGE_ADMIN_API_TOKEN` in `/etc/ai-usage-api.env`.

## Google Sheets Sync

Each saved survey response is synced to Google Sheets after the local JSON
database write and notification queue step. Sheets failures are recorded in
`sheetSyncs[]` but do not block survey capture.
After each row sync, embedded chart ranges anywhere in the workbook, including
dashboard/chart tabs, are expanded when their source ranges point at the
`Survey Responses` or `Businesses` tabs.

Target spreadsheet:

```sh
AI_USAGE_GOOGLE_SHEET_ID=1xl6LGpQ5sP3q5U8bMk36uwyR84AJUftyrBTJfp-aZio
```

The sync supports either service-account credentials or Google application
default credentials from `AI_USAGE_GOOGLE_CREDENTIALS_PATH`,
`AI_USAGE_GOOGLE_CREDENTIALS_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`, or
`AI_USAGE_GOOGLE_SERVICE_ACCOUNT_EMAIL` plus `AI_USAGE_GOOGLE_PRIVATE_KEY`.
Keep credential files server-local and out of Git.

To backfill saved production responses:

```sh
AI_USAGE_DB_PATH=/var/lib/ai-usage/local-db.json npm run backfill:sheets
```

The backfill also syncs standalone business records, including businesses marked
do not solicit without a survey response.

## Google Maps Business Lookup

The survey page can identify the business closest to the user before the survey
starts. Configure a browser-restricted Google Maps Platform key with Maps
JavaScript API and Places API (New) enabled:

```sh
AI_USAGE_GOOGLE_MAPS_BROWSER_KEY=replace-with-restricted-google-maps-browser-key
```

Restrict the key to local testing and production origins, for example
`http://127.0.0.1:8011/*`, `http://localhost:8011/*`, and
`https://ai-usage.biz/*`.
