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

## Temppo Beauty at beauty.temppo.uy

Temppo Beauty — appointments for beauty professionals — is **the same Netlify
site**, not a second one. The app reads the host of each request to decide
which brand to show, and a studio signing up on `beauty.temppo.uy` becomes an
appointment business.

1. Netlify → this site → **Domain management** → *Add a domain alias* →
   `beauty.temppo.uy`.
2. DNS for `temppo.uy`: a `CNAME` from `beauty` to `<site>.netlify.app`, the
   same target as `reservas`. Netlify issues the certificate once it resolves.
3. Nothing else is required: the name and domain default to Temppo Beauty and
   `beauty.temppo.uy`. Links in a beauty studio's emails and payment returns are
   built on that domain, whatever `APP_URL` says.
4. The first deploy runs a migration that creates the `btree_gist` extension
   (it stops one professional from being double-booked). Supabase and Neon allow
   it; on another host, check the database user may create extensions.

Sessions are per host, so someone signed in on one brand is signed out on the
other — intended, since an account belongs to one studio and one brand.

## Optional

- **Mercado Pago.** Set `MERCADOPAGO_ACCESS_TOKEN` and the button appears by
  itself. Register the webhook at `{APP_URL}/api/payments/webhook` (event
  *Pagos*) and put its signing secret in `MERCADOPAGO_WEBHOOK_SECRET`.
  Webhooks cannot reach localhost — tunnel with
  `npx untun@latest tunnel http://localhost:3000` to test first.
- **Each studio's own Mercado Pago.** Studios connect their account from
  *Ajustes → Mercado Pago*, and online deposits then land with them directly
  instead of in the platform's account. Until a studio connects, deposits keep
  going through `MERCADOPAGO_ACCESS_TOKEN` and the *Señas* payouts.
  1. In Mercado Pago → *Tus integraciones* → the application → *Editar*, add
     the redirect URL `https://reservas.temppo.uy/api/mercadopago/callback`
     (exactly, it must match `{APP_URL}/api/mercadopago/callback`).
  2. Copy *Client ID* and *Client Secret* from its production credentials
     into `MERCADOPAGO_CLIENT_ID` and `MERCADOPAGO_CLIENT_SECRET`. The card in
     Ajustes only appears once both are set.
  3. Set `SECRETS_KEY` (`openssl rand -base64 32`) before the first studio
     connects, and never change it: it encrypts their tokens.
  4. Optional: `MERCADOPAGO_MARKETPLACE_FEE_PERCENT` takes a cut of each
     deposit into the platform's account. Unset means none.
  Tokens last 180 days and the 15-minute cron renews them in their last month.
- **Automatic WhatsApp (Temppo Beauty).** Every studio sends from one
  platform number through Meta's Cloud API; each message costs about US$0.011
  to Uruguay and counts against the studio's monthly quota.
  1. A Meta Business account, verified, and an app at developers.facebook.com
     with the WhatsApp product added.
  2. A number of our own that is not in use on the WhatsApp app. Its *Phone
     number ID* goes in `WHATSAPP_PHONE_NUMBER_ID`.
  3. A System User with the `whatsapp_business_messaging` permission; its
     permanent token goes in `WHATSAPP_TOKEN`. The app secret goes in
     `WHATSAPP_APP_SECRET`. Add a payment method in WhatsApp Manager.
  4. A *Utility* template named `appointment_reminder`, in Spanish (`es`), and
     in English (`en`) if any studio uses it. Four variables, in this order:

     > Hola {{1}}, te recordamos tu turno de {{2}} en {{3}}: {{4}}. ¡Te
     > esperamos! Si no querés recibir más estos mensajes, respondé BAJA.

  5. Webhook: callback `{APP_URL}/api/whatsapp/webhook`, verify token the same
     string as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, subscribed to `messages`. It
     marks failed deliveries and handles BAJA / ALTA replies.
  6. Turn a studio on from the platform console (studio → WhatsApp →
     Automático, with its monthly messages). Once it sends for real, set
     `WA_AUTO_LIVE` in `src/lib/brand/pricing.ts` so the landing stops saying
     "coming soon" and new trials start with their 50 messages.
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
