# AI Usage Backend Roadmap

## Routing Pattern

Use the Workflow Shortcuts shape:

- nginx serves the public frontend.
- nginx proxies `/api/` to a local Node/Express service on loopback.
- Express owns API routes, JSON parsing, validation, and persistence.
- A systemd service keeps the API running.

Planned nginx route:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8011/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Storage Pattern

Start like Workflow Shortcuts:

- `AI_USAGE_DB_PATH=/var/lib/ai-usage/local-db.json` for the first production version.
- Optional `MONGODB_URI` later for real concurrent editing and search.
- Atomic writes for local JSON so survey submissions do not corrupt the file.

Core collections:

- `surveyResponses`
- `businesses`
- `plazas`
- `businessNotes`
- `ownerProfiles`

## API Routes

- `GET /api/health`
- `POST /api/survey-responses`
- `GET /api/survey-responses` with `Authorization: Bearer $AI_USAGE_ADMIN_API_TOKEN`
- `GET /api/businesses`
- `POST /api/businesses`
- `GET /api/plazas`
- `GET /api/plazas/:id/businesses`

## Implemented First Pass

`api/server.js` now implements:

- `GET /api/health`
- `POST /api/survey-responses`
- `GET /api/survey-responses` behind `AI_USAGE_ADMIN_API_TOKEN`

The first pass stores:

- `surveyResponses`
- `businesses`
- `notifications`

Each survey submit upserts a business by existing business id, website, email,
or business name. The frontend keeps a local response id only for the same
business fingerprint, so back-to-back field surveys create separate records.

Admin notification behavior:

- Sends through `/usr/sbin/sendmail` by default when available.
- If sendmail is unavailable or fails, writes a `.eml` file under
  `notification-outbox` next to the configured database file.
- Either path still returns a successful save as long as the database write
  succeeds.

Useful production environment variables:

```sh
PORT=8011
AI_USAGE_API_HOST=127.0.0.1
AI_USAGE_DB_PATH=/var/lib/ai-usage/local-db.json
AI_USAGE_ADMIN_EMAIL=hello@ai-usage.biz
AI_USAGE_FROM_EMAIL="AI Usage <hello@ai-usage.biz>"
AI_USAGE_SENDMAIL_PATH=/usr/sbin/sendmail
AI_USAGE_ADMIN_API_TOKEN=change-this-before-admin-read-access
```

## Business Record Shape

Public-safe fields:

- business name
- category
- plaza
- address
- public phone
- public email
- website
- Google Place ID
- latitude and longitude
- public description
- business value estimate or offer fit

Private fields:

- owner name
- owner direct phone or email
- survey responses
- kids names
- hobbies
- personal notes
- follow-up status
- pricing notes

Private fields should never appear on the public map unless explicitly marked public. Use a separate admin view or passphrase-gated route for owner intelligence.

## Map Direction

The public RSM page should eventually render:

- Google Map centered on Rancho Santa Margarita.
- Plaza polygons or markers.
- Clickable business markers.
- Modal with verified public contact details and offer-relevant notes.
- Admin-only overlay for survey responses and owner context.
