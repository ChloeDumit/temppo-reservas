# Deploying TEMPPO Reservas

Runs on **Netlify**, at **`reservas.temppo.uy`**, as its own site. The marketing
site at `temppo.uy` is a separate deploy and is not involved.

## Two connection strings, and they are not interchangeable

This is the single easiest thing to get wrong, and it fails in two different
ways depending on which one you get wrong.

| Variable | Which string | Used by |
| --- | --- | --- |
| `DATABASE_URL` | **Pooled** — Supabase *Transaction pooler* (6543), Neon `-pooler` host | the running app |
| `DIRECT_URL` | **Direct** — port 5432, no pooler | `prisma migrate` only |

The app runs on Lambdas that scale to many concurrent instances, so it needs
the pooler or it exhausts Postgres. Migrations need the opposite: they take a
session-level advisory lock that a transaction-mode pooler cannot hold, so
pointing them at the pooled url fails with:

```
P1002  Timed out trying to acquire a postgres advisory lock
```

`prisma.config.ts` prefers `DIRECT_URL` and falls back to `DATABASE_URL`, so
local development — where Postgres is reached directly — needs only the one.

## Steps

1. **Database.** Supabase or Neon, free tier. Copy both connection strings.

   ```bash
   DIRECT_URL="<direct-url>" npx prisma migrate deploy
   ```

2. **Push to GitHub.**

3. **New Netlify site** from that repo. It reads `netlify.toml`; leave the
   build command and publish directory alone. The build runs
   `prisma migrate deploy` before `next build`, so schema changes ship with the
   code that needs them.

4. **Custom domain.** Domain management → add `reservas.temppo.uy`, then add the
   `CNAME` it asks for (`reservas` → `<site>.netlify.app`). Netlify issues the
   certificate free once DNS resolves.

5. **Environment variables.** See `.env.production.template`. Set both database
   urls, and make sure `APP_URL` is `https://reservas.temppo.uy` — magic links,
   QR check-in codes, waitlist claim links and payment return urls are all built
   from it.

6. **Verify temppo.uy in Resend** before using an `@temppo.uy` sender, or the
   send is rejected and students get no email.

## Optional

- **Mercado Pago.** Set `MERCADOPAGO_ACCESS_TOKEN` and the button appears by
  itself. Register the webhook at `{APP_URL}/api/payments/webhook` (event
  *Pagos*) and put its signing secret in `MERCADOPAGO_WEBHOOK_SECRET`.
  Webhooks cannot reach localhost — tunnel with
  `npx untun@latest tunnel http://localhost:3000` to test first.
- **Entry point from the marketing site.** A plain redirect, never a proxy:

  ```toml
  [[redirects]]
    from = "/reservas/*"
    to = "https://reservas.temppo.uy/:splat"
    status = 301
    force = true
  ```

## Things that already went wrong, so they don't again

- **Serving from `temppo.uy/reservas` does not work.** Next's `basePath` root
  only resolves with a trailing slash, so bare `/reservas` 404s; and Netlify's
  proxy turned the app's redirects into 404s — measured against the live site,
  origin `200` came through as `200` but origin `307` came through as `404`.
  This app redirects constantly (locale prefixes, auth guards, role routing),
  so a proxy in front of it breaks sign-in itself.
- **Locale prefixes are always present** (`/es/dashboard`). `as-needed` served
  the default locale through an internal rewrite, which Netlify's edge adapter
  converts into a redirect — looping `/` to itself. Plain `next start` was
  unaffected, which is how it was pinned on the host rather than the app.
- **`NEXT_PUBLIC_*` values are inlined at build time.** Changing one in the
  dashboard does nothing until a rebuild. Sub-path support was removed from the
  code entirely for this reason, after a stale prefix survived an env change and
  404'd every route.
- **A missing migration surfaces as a bare number.** Next hides server errors
  behind a numeric digest, so "column does not exist" reaches the browser as
  something like `377963755`. The real message is in the Netlify function log.

## Notes

- `.env` holds real secrets and is gitignored. Set values in Netlify instead.
- The Resend key that was pasted into a chat should be rotated.
- Remove the `NSAppTransportSecurity` block from `ios/App/App/Info.plist`
  before submitting the iOS app; it exists only so the LAN dev server loads.
