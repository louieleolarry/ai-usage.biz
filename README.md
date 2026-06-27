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
- Each save attempts an admin notification email to `AI_USAGE_ADMIN_EMAIL`.
- If local sendmail is unavailable, the notification is queued as an `.eml`
  file next to the database instead of blocking capture.

Minimum production environment:

```sh
PORT=8011
AI_USAGE_DB_PATH=/var/lib/ai-usage/local-db.json
AI_USAGE_ADMIN_EMAIL=hello@ai-usage.biz
AI_USAGE_ADMIN_API_TOKEN=replace-with-a-private-token
```

The starter systemd unit lives at `ops/ai-usage-api.service`; keep the private
`AI_USAGE_ADMIN_API_TOKEN` in `/etc/ai-usage-api.env`.
