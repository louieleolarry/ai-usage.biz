# AI Usage City Subdomain Routing Plan

## Current State

- Production host: `ubuntu@44.228.191.227`
- Production web root: `/var/www/ai-usage.biz/html`
- Current live DNS:
  - `ai-usage.biz` -> `44.228.191.227`
  - `www.ai-usage.biz` -> `44.228.191.227`
  - `rsm.ai-usage.biz` -> `44.228.191.227`
  - `mission-viejo.ai-usage.biz` -> `44.228.191.227`
  - `lake-forest.ai-usage.biz` -> `44.228.191.227`
- Current nginx server names:
  - `ai-usage.biz`
  - `www.ai-usage.biz`
- Current certificate only covers:
  - `ai-usage.biz`
  - `www.ai-usage.biz`

## Goal

Create city subdomains that serve the same core AI Usage site while adding a city-specific primary navigation item.

Initial city:

- `rsm.ai-usage.biz` with primary nav link `RSM`
- `mission-viejo.ai-usage.biz` with primary nav link `MV`
- `lake-forest.ai-usage.biz` with primary nav link `LF`
- `san-clemente.ai-usage.biz` with primary nav link `SC`
- `laguna-hills.ai-usage.biz` with primary nav link `LH`
- `dana-point.ai-usage.biz` with primary nav link `DP`
- `laguna-woods.ai-usage.biz` with primary nav link `LW`
- `sjc.ai-usage.biz` with primary nav link `SJC`
- `laguna-beach.ai-usage.biz` with primary nav link `LB`
- `ladera.ai-usage.biz` with primary nav link `LR`
- `foothill.ai-usage.biz` with primary nav link `FR`
- `rmv.ai-usage.biz` with primary nav link `RMV`
- `rancho-cucamonga.ai-usage.biz` with primary nav link `RC`

Confirmed: `lake-gorest.ai-usage.biz` was a typo. Use `lake-forest.ai-usage.biz`.

## DNS Changes In Namecheap

Use Namecheap Advanced DNS for `ai-usage.biz`.

Recommended first records:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A Record | `rsm` | `44.228.191.227` | Automatic |
| A Record | `mission-viejo` | `44.228.191.227` | Automatic |
| A Record | `lake-forest` | `44.228.191.227` | Automatic |
| A Record | `san-clemente` | `44.228.191.227` | Automatic |
| A Record | `laguna-hills` | `44.228.191.227` | Automatic |
| A Record | `dana-point` | `44.228.191.227` | Automatic |
| A Record | `laguna-woods` | `44.228.191.227` | Automatic |
| A Record | `sjc` | `44.228.191.227` | Automatic |
| A Record | `laguna-beach` | `44.228.191.227` | Automatic |
| A Record | `ladera` | `44.228.191.227` | Automatic |
| A Record | `foothill` | `44.228.191.227` | Automatic |
| A Record | `rmv` | `44.228.191.227` | Automatic |
| A Record | `rancho-cucamonga` | `44.228.191.227` | Automatic |

Alternative: use `CNAME` records pointed at `ai-usage.biz` for subdomains. The `A` record is more explicit and matches the current apex setup.

## Nginx Changes

Update `/etc/nginx/sites-available/ai-usage.biz` and the checked-in `nginx/ai-usage.biz.conf`.

Add the city subdomains to both HTTP and HTTPS `server_name` declarations:

```nginx
server_name ai-usage.biz www.ai-usage.biz rsm.ai-usage.biz mission-viejo.ai-usage.biz lake-forest.ai-usage.biz san-clemente.ai-usage.biz laguna-hills.ai-usage.biz dana-point.ai-usage.biz laguna-woods.ai-usage.biz sjc.ai-usage.biz laguna-beach.ai-usage.biz ladera.ai-usage.biz foothill.ai-usage.biz rmv.ai-usage.biz rancho-cucamonga.ai-usage.biz;
```

Then test and reload:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS / Certbot

After DNS resolves, expand the Let`s Encrypt certificate:

```sh
sudo certbot --nginx \
  -d ai-usage.biz \
  -d www.ai-usage.biz \
  -d rsm.ai-usage.biz \
  -d mission-viejo.ai-usage.biz \
  -d lake-forest.ai-usage.biz \
  -d san-clemente.ai-usage.biz \
  -d laguna-hills.ai-usage.biz \
  -d dana-point.ai-usage.biz \
  -d laguna-woods.ai-usage.biz \
  -d sjc.ai-usage.biz \
  -d laguna-beach.ai-usage.biz \
  -d ladera.ai-usage.biz \
  -d foothill.ai-usage.biz \
  -d rmv.ai-usage.biz \
  -d rancho-cucamonga.ai-usage.biz
```

Future expansion:

```sh
sudo certbot --nginx \
  -d ai-usage.biz \
  -d www.ai-usage.biz \
  -d rsm.ai-usage.biz \
  -d mission-viejo.ai-usage.biz \
  -d lake-forest.ai-usage.biz
```

## Frontend Routing Pattern

Keep one shared static site, but make the nav host-aware.

Implemented local pattern:

- `city-config.js` maps hostname to city metadata.
- Pages render business/city nav links from `[data-city-nav]` placeholders.
- The apex domain renders `Business` and links to `/business`.
- The apex `/business` page includes all collected listings to date.
- City subdomains render the city label and can filter `/business` by hostname.
- Use `/business` as the city business route:
  - `https://rsm.ai-usage.biz/business`
  - `https://mission-viejo.ai-usage.biz/business`
  - `https://lake-forest.ai-usage.biz/business`
  - `https://san-clemente.ai-usage.biz/business`
  - `https://laguna-hills.ai-usage.biz/business`
  - `https://dana-point.ai-usage.biz/business`
  - `https://laguna-woods.ai-usage.biz/business`
  - `https://sjc.ai-usage.biz/business`
  - `https://laguna-beach.ai-usage.biz/business`
  - `https://ladera.ai-usage.biz/business`
  - `https://foothill.ai-usage.biz/business`
  - `https://rmv.ai-usage.biz/business`
  - `https://rancho-cucamonga.ai-usage.biz/business`
- On `rsm.ai-usage.biz`, include `RSM` as the city nav item.
- On `mission-viejo.ai-usage.biz`, include `MV`.
- On `lake-forest.ai-usage.biz`, include `LF`.
- On `san-clemente.ai-usage.biz`, include `SC`.
- On `laguna-hills.ai-usage.biz`, include `LH`.
- On `dana-point.ai-usage.biz`, include `DP`.
- On `laguna-woods.ai-usage.biz`, include `LW`.
- On `sjc.ai-usage.biz`, include `SJC`.
- On `laguna-beach.ai-usage.biz`, include `LB`.
- On `ladera.ai-usage.biz`, include `LR`.
- On `foothill.ai-usage.biz`, include `FR`.
- On `rmv.ai-usage.biz`, include `RMV`.
- On `rancho-cucamonga.ai-usage.biz`, include `RC`.

Do not preserve `/rsm-businesses` as a city route. For now, `rsm.ai-usage.biz/` shows the normal homepage. Later, the homepage can inherit city-specific content and personalization from the same hostname config.

## Backend/API Pattern

When the Node/Express backend from `backend-roadmap.md` is added, read the city from `Host` or an explicit query parameter.

Example mapping:

```js
const cityByHost = {
  "rsm.ai-usage.biz": "rsm",
  "mission-viejo.ai-usage.biz": "mission-viejo",
  "lake-forest.ai-usage.biz": "lake-forest",
  "san-clemente.ai-usage.biz": "san-clemente",
  "laguna-hills.ai-usage.biz": "laguna-hills",
  "dana-point.ai-usage.biz": "dana-point",
  "laguna-woods.ai-usage.biz": "laguna-woods",
  "sjc.ai-usage.biz": "san-juan-capistrano",
  "laguna-beach.ai-usage.biz": "laguna-beach",
  "ladera.ai-usage.biz": "ladera-ranch",
  "foothill.ai-usage.biz": "foothill-ranch",
  "rmv.ai-usage.biz": "rancho-mission-viejo",
  "rancho-cucamonga.ai-usage.biz": "rancho-cucamonga",
};
```

API routes should filter public data by city:

- `GET /api/businesses?city=rsm`
- `GET /api/plazas?city=rsm`
- `POST /api/survey-responses` stores city from hostname plus submitted form data

Private lead and owner notes stay server-side only.

## Verification Checklist

1. Add Namecheap DNS record.
2. Confirm DNS:

```sh
dig +short rsm.ai-usage.biz A
dig +short mission-viejo.ai-usage.biz A
dig +short lake-forest.ai-usage.biz A
dig +short san-clemente.ai-usage.biz A
dig +short laguna-hills.ai-usage.biz A
dig +short dana-point.ai-usage.biz A
dig +short laguna-woods.ai-usage.biz A
dig +short sjc.ai-usage.biz A
dig +short laguna-beach.ai-usage.biz A
dig +short ladera.ai-usage.biz A
dig +short foothill.ai-usage.biz A
dig +short rmv.ai-usage.biz A
dig +short rancho-cucamonga.ai-usage.biz A
```

3. Update nginx `server_name`.
4. Run `sudo nginx -t`.
5. Reload nginx.
6. Expand Certbot certificate.
7. Verify:

```sh
curl -I https://rsm.ai-usage.biz/
curl -I https://rsm.ai-usage.biz/business
curl -I https://mission-viejo.ai-usage.biz/
curl -I https://lake-forest.ai-usage.biz/
curl -I https://san-clemente.ai-usage.biz/
curl -I https://laguna-hills.ai-usage.biz/
curl -I https://dana-point.ai-usage.biz/
curl -I https://laguna-woods.ai-usage.biz/
curl -I https://sjc.ai-usage.biz/
curl -I https://laguna-beach.ai-usage.biz/
curl -I https://ladera.ai-usage.biz/
curl -I https://foothill.ai-usage.biz/
curl -I https://rmv.ai-usage.biz/
curl -I https://rancho-cucamonga.ai-usage.biz/
```

8. Confirm nav shows `RSM` on the RSM subdomain.

## Decisions

1. `rsm.ai-usage.biz/` shows the normal homepage for now.
2. City business pages use `/business`, not `/rsm-businesses`.
3. Use `lake-forest.ai-usage.biz`; `lake-gorest` was a typo.
4. Use abbreviated labels in primary nav, but not as subdomains except `rsm.ai-usage.biz`.

## Status

- 2026-06-26: Namecheap `A Record` entries were created for `rsm`, `mission-viejo`, and `lake-forest`, all pointing to `44.228.191.227`.
- Authoritative Namecheap DNS confirmed all three records.
- Local resolver confirmed `rsm` and `mission-viejo` immediately; `lake-forest` may need propagation time.
- 2026-06-26: Static files were deployed to `/var/www/ai-usage.biz/html`.
- 2026-06-26: Nginx was updated and reloaded for `rsm.ai-usage.biz`, `mission-viejo.ai-usage.biz`, and `lake-forest.ai-usage.biz`.
- 2026-06-26: Let`s Encrypt certificate `ai-usage.biz` was renewed/expanded to cover all three city subdomains.
- 2026-06-26: Live checks returned HTTP 200 for `/` and `/business` on the apex and all three city subdomains.
- 2026-06-26: Added and deployed server support for `san-clemente`, `laguna-hills`, `dana-point`, `laguna-woods`, `sjc`, `laguna-beach`, `ladera`, `foothill`, `rmv`, and `rancho-cucamonga`.
- 2026-06-26: Let`s Encrypt certificate `ai-usage.biz` was renewed/expanded to cover all current subdomains through `rancho-cucamonga.ai-usage.biz`.
- 2026-06-26: Live checks returned HTTP 200 for `/` and `/business` on the added subdomains. `laguna-beach` required a forced-IP check from this Mac because the local resolver lagged, while public/authoritative DNS and the EC2 host resolved it correctly.
