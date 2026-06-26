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

- `LOCAL_DB_PATH=/var/lib/ai-usage/local-db.json` for the first production version.
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
- `GET /api/businesses`
- `POST /api/businesses`
- `GET /api/plazas`
- `GET /api/plazas/:id/businesses`

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
