# ai-usage.biz

Basic static site for AI Usage.

## Local Files

- `index.html`
- `styles.css`
- `survey.html`
- `business.html`
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
- Catch-all redirect: `*@ai-usage.biz` forwards to `louieleolarry@gmail.com`
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
