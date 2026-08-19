# Deploying TEMPPO Reservas to temppo.uy/reservas

## What I could and couldn't do

I could not reach `github.com/ChloeDumit/temppo.uy` — it needs authentication and
this machine has no `gh` CLI and no git credentials. So **nothing has been pushed
anywhere**. Everything below is prepared and building locally; the steps are
yours to run, or authenticate `gh` and I'll do them.

## The important finding

`temppo.uy` is served by **Netlify**, and **HTTPS is not working**:

```
curl https://temppo.uy
curl: (60) SSL: no alternative certificate subject name matches target host name
```

The certificate does not cover the domain. This blocks more than polish:

- **Service workers only run in a secure context**, so the PWA install and
  **Web Push will not work at all over plain HTTP.**
- Mercado Pago will not deliver webhooks to an `http://` endpoint.
- Browsers will warn users away from a login form on plain HTTP.

**Fix the certificate before anything else.** In Netlify: Domain settings →
HTTPS → *Verify DNS configuration* → *Provision certificate*. It usually means
the domain's DNS isn't fully pointed at Netlify yet.

## Architecture: why a proxy, not one deploy

This app is not a static site. It needs a Node server (React Server Components,
Server Actions) and a live PostgreSQL connection. The marketing site on Netlify
is a different kind of thing.

Trying to merge them into one Netlify deploy means running Prisma inside Netlify
Functions — possible, but it fights the tooling. The clean arrangement:

```
temppo.uy/            →  existing Netlify marketing site (unchanged)
temppo.uy/reservas/*  →  proxied to the Reservas app on Vercel
```

The app is already built for this: `NEXT_PUBLIC_BASE_PATH=/reservas` makes Next
prefix every route, asset, Server Action, the PWA manifest, the service worker
registration and the check-in QR URLs. A production build with that set compiles
clean.

## Steps

### 1. Database

Create a PostgreSQL database (Supabase or Railway are both fine) and keep the
connection string. Then, from this project:

```bash
DATABASE_URL="<production-url>" npx prisma migrate deploy
```

### 2. Deploy the app

Push this project to its own repository — I'd keep it separate from
`temppo.uy`, since the marketing site and the product have different build
pipelines and release cadences. Import it in Vercel and set:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | your production Postgres URL |
| `APP_URL` | `https://temppo.uy` |
| `NEXT_PUBLIC_BASE_PATH` | `/reservas` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | your Resend key |
| `EMAIL_FROM` | `TEMPPO Reservas <no-reply@temppo.uy>` once the domain is verified |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from `.env` |
| `VAPID_PRIVATE_KEY` | from `.env` |
| `VAPID_SUBJECT` | `mailto:hola@temppo.uy` |
| `MERCADOPAGO_ACCESS_TOKEN` | production token (see below) |
| `MERCADOPAGO_WEBHOOK_SECRET` | the secret Mercado Pago shows when you register the webhook |

`vercel.json` already registers the reminder cron.

### 3. Point /reservas at it

In the `temppo.uy` repository, add to `netlify.toml`:

```toml
[[redirects]]
  from = "/reservas/*"
  to = "https://<your-vercel-deployment>/reservas/:splat"
  status = 200      # 200, not 301 — this proxies rather than redirects
  force = true
```

`force = true` matters: without it Netlify serves its own 404 page first for
paths that don't exist as files.

### 4. Mercado Pago

1. mercadopago.com.uy → *Tus integraciones* → create an application.
2. Copy the **production** access token into `MERCADOPAGO_ACCESS_TOKEN`.
   Test credentials work too, and pair with the test buyer accounts Mercado
   Pago generates.
3. Register the webhook: `https://temppo.uy/reservas/api/payments/webhook`,
   event **Pagos**. Copy the signing secret into `MERCADOPAGO_WEBHOOK_SECRET`.

The integration turns itself on as soon as the access token is present — the
"Pagar con Mercado Pago" button appears on the buy screen, and hides again if
the token is missing.

**Webhooks can't reach localhost.** To exercise the flow before deploying, run
a tunnel and point `APP_URL` at it:

```bash
npx untun@latest tunnel http://localhost:3000
```

### 5. After the first deploy

- Register a studio at `https://temppo.uy/reservas/register`.
- In **Ajustes**, set the studio's WhatsApp number — the transfer-receipt flow
  needs it.
- Open the app on a phone, **Add to Home Screen**, then turn on notifications
  to confirm push works end to end.

## Notes

- `.env` holds real secrets and is gitignored. Never commit it; set the values
  in the Vercel dashboard instead.
- The Resend key currently in `.env` was pasted into a chat — rotate it.
- Remove the `NSAppTransportSecurity` block from `ios/App/App/Info.plist`
  before submitting the iOS app; it exists only so the LAN dev server loads.
