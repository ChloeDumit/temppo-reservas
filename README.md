# TEMPPO Reservas

Class booking and studio management for pilates, yoga, gyms and dance studios.
Built by TEMPPO SAS.

Spanish-first (LatAm), fully bilingual ES/EN, mobile-first, and installable as
an app on iOS and Android.

---

## Quick start

```bash
npm install
createdb temppo_reservas          # or point DATABASE_URL at any Postgres
cp .env.example .env              # then fill in DATABASE_URL
npx prisma migrate dev
npm run seed                      # demo studio with classes, students, payments
npm run dev
```

Open http://localhost:3000

**Demo logins** (after `npm run seed`):

| Role    | Email             | Password   |
| ------- | ----------------- | ---------- |
| Owner   | owner@anima.uy    | `demo1234` |
| Student | ana@example.com   | `demo1234` |

With no `RESEND_API_KEY` set, emails (including magic links and waitlist
offers) are printed to the server console instead of being sent — so the whole
product is usable locally with no third-party accounts.

## Scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Dev server                                            |
| `npm run build`     | Production build                                      |
| `npm run seed`      | Reset and load the demo studio                        |
| `npm run verify`    | Booking, waitlist, standing-spot, payment and reporting checks (89) |
| `npm run lan`       | Print the address to open on your phone               |
| `npm run native:sync` | Push the current config into the iOS/Android shells |
| `npm run db:studio` | Prisma Studio                                         |

## Architecture

Next.js App Router with React Server Components. Reads happen in server
components; writes go through Server Actions. There is no separate REST layer —
route handlers exist only where an external system needs a URL (payment
webhooks, magic links, QR check-in, CSV export, cron).

```
src/
  app/[locale]/
    (auth)/      login, studio registration
    (app)/       authenticated app — staff and student screens
    (public)/    public trial-class landing page, no account needed
  api/           webhooks, magic link, QR check-in, exports, cron
  lib/           domain logic (booking, waitlist, classes, reports, payments…)
  components/    UI primitives and app chrome
  messages/      es.json / en.json
```

**Key decisions**

- **Money is integer cents everywhere.** `src/lib/money.ts` is the only place
  that formats or parses it.
- **Times are stored as UTC instants; studios think in wall-clock.**
  `src/lib/dates.ts` converts between them using the studio's timezone, so a
  class at "19:00" stays at 19:00 across DST.
- **Recurring classes are templates that materialise into instances.**
  `ensureInstances()` runs lazily when a schedule is read, so no cron is needed
  for the calendar to stay filled.
- **Booking runs in a serializable transaction with retry**, so two students
  racing for the last spot cannot both win. This is covered by a test.
- **Payments go through a provider interface** (`src/lib/payments/types.ts`).
  Mercado Pago is the only implementation today; adding another means writing
  one more object of that shape.
- **Branding is available on every plan**, by design — studio accent colour and
  logo are applied through CSS variables in the app shell.

## Booking rules

All studio-configurable in Settings:

| Rule                  | Effect                                                        |
| --------------------- | ------------------------------------------------------------- |
| Cancellation cutoff   | Cancel inside the window → credit returned. Outside → spent.   |
| Booking opens         | How far ahead students may book. Staff bypass it.              |
| Reminder hours        | When the pre-class WhatsApp/email reminder goes out.           |
| Waitlist window       | How long an offered spot is held before passing to the next.   |
| No-show limit         | No-shows before booking is blocked (0 disables).               |

## The differentiators

- **Waitlist automation.** Full class → students queue. A cancellation offers
  the spot to the first in line with a time-limited claim link; if the window
  closes the spot passes down automatically. Only one live offer per class, so
  a seat can never be double-claimed.
- **Automated reminders + no-show tracking.** `/api/cron/reminders` sends due
  reminders and sweeps expired waitlist offers. Runs every 15 minutes on Vercel
  Cron (see `vercel.json`); protect it with `CRON_SECRET`.
- **QR check-in.** Every booking carries a check-in token rendered as a QR in
  the student's app. The front desk scans it from `/checkin` (camera or manual
  code). Scans are only accepted within two hours of class time.
- **Push notifications (Web Push).** Students opt in from *Mis clases*, staff
  from *Ajustes*. Reminders and waitlist offers go out over push first — instant
  and free — then WhatsApp, then email. Push is additive, never the only
  channel, since a notification can be dismissed unread. **Requires HTTPS**: it
  cannot work over plain HTTP, and on iPhone the app must be added to the home
  screen first.
- **Transfer receipts over WhatsApp.** Bank transfer is how most students
  actually pay, and they already send the screenshot on WhatsApp. Each pending
  transfer gets a short code (`TP-JC6FKR`) and a button that opens WhatsApp with
  the message pre-written — the student only attaches the photo. The same code
  sits on the admin's pending-payments list, so matching a message to a payment
  is a glance rather than a hunt. No file storage required.
- **Lead capture.** `/t/<studio-slug>` is a public trial-class page needing no
  account — the link to put in an Instagram bio. Leads land in the staff inbox
  and convert to students in one click, booking their chosen slot.
- **Flat-tier pricing.** Plans carry no per-student cost and no seat limits;
  unlimited admins and instructors on every tier.
- **Bilingual from the start.** All copy lives in `src/messages/`; both
  catalogues are kept at parity.

## Notifications

WhatsApp is tried first when a phone number exists, with email as the fallback,
and every attempt is recorded in `NotificationLog`. Configure either or both:

- Web Push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Email: `RESEND_API_KEY`, `EMAIL_FROM`
- WhatsApp (Meta Cloud API): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`

## Payments

- **Manual bank transfer** works out of the box: the student submits a proof
  link, staff approve it in Payments, and approval activates the pack and books
  the income in one transaction.
- **Mercado Pago** activates as soon as `MERCADOPAGO_ACCESS_TOKEN` is set.
  Webhooks are never trusted for amounts or status — the payment is re-fetched
  from the API, and the amount must match before anything is credited.

## Deploying

For **temppo.uy/reservas** specifically, see [DEPLOY.md](DEPLOY.md).

### Generic setup

1. Postgres on Supabase or Railway → set `DATABASE_URL`.
2. Deploy to Vercel. Set `APP_URL`, `AUTH_SECRET`, `CRON_SECRET`, and whichever
   notification/payment keys you use.
3. `npx prisma migrate deploy` against the production database.
4. `vercel.json` already registers the reminder cron.

## Testing on your phone

Your Mac and phone need to be on the same Wi-Fi.

```bash
npm run dev
npm run lan
```

`npm run lan` prints the address to open on the phone (currently
`http://192.168.2.86:3000`) and warns you if `APP_URL` still points at
localhost. Set `APP_URL` to the LAN address while testing, otherwise magic
links and check-in QR codes will encode `localhost` and the phone can't
follow them.

**Install it as an app:** open the address in Safari (iOS) or Chrome
(Android) → Share/menu → *Add to Home Screen*. It launches full-screen with no
browser chrome, its own icon, and the bottom tab bar — indistinguishable from a
native app for day-to-day use.

## Mobile and native apps

The interface is built mobile-first, not desktop-shrunk:

- **Bottom tab bar** with the four most-used destinations plus **More**, which
  opens a sheet holding everything else. Every admin section is reachable by
  thumb — nothing is stranded off-screen.
- **Bottom sheets** instead of modals for every create/edit form, with a drag
  handle and drag-to-dismiss.
- **44pt minimum touch targets** everywhere, with press feedback on tap.
- **Safe areas** respected via `viewport-fit=cover` and `env(safe-area-inset-*)`,
  so nothing hides under the notch or home indicator.
- **No sideways scrolling** — tables become row lists on phones.

### Native shells (App Store / Play Store)

iOS and Android projects are configured under `ios/` and `android/` via
Capacitor. Because the app is server-rendered (RSC + Server Actions against
Postgres), the native shell loads the deployed site rather than bundling a
static copy — so shipping an update means deploying, not resubmitting.

```bash
TEMPPO_APP_URL=https://your-deployment.vercel.app npx cap sync
npm run native:ios       # opens Xcode
npm run native:android   # opens Android Studio
```

**One-time setup on this Mac (needs your password):**

```bash
sudo xcodebuild -license accept
```

Until that runs, `xcodebuild` — and macOS's system `python3`, which shares the
Xcode toolchain — both refuse to start.

**Running on your own iPhone over Wi-Fi:**

1. `npm run dev` and `npm run lan` — note the address.
2. `TEMPPO_APP_URL=http://<that-address> npx cap sync ios`
3. `npm run native:ios` to open Xcode.
4. In Xcode: select the **App** target → **Signing & Capabilities** → tick
   *Automatically manage signing* and pick your Apple ID team. A free account
   works; the build lasts 7 days before it needs re-installing.
5. Plug the iPhone in, pick it as the run destination, press ▶.

The iOS project already carries what this app needs: a camera usage
description for QR check-in, a local-network description, and an App Transport
Security exception for `192.168.2.86` so the plain-HTTP dev server loads.
**Remove that ATS block before shipping** — production runs over https.

Android needs Android Studio and JDK 21; the manifest already declares the
camera permission.

Until then, the "Add to Home Screen" install above gives you the same UI on a
real device with no build step.

## What is not built yet

- Binary logo upload. Branding takes a logo **URL** today; file upload needs a
  storage bucket (Supabase Storage or S3) wired into Settings.
- Subscriptions (recurring billing). Packs are one-off purchases; the payment
  interface has room for it but Mercado Pago Preapproval is not implemented.
- Light/dark theming — the interface is committed to a single light palette.
- Native push notifications. The shells are in place but reminders still go out
  over WhatsApp/email; wiring `@capacitor/push-notifications` is the next step.
- Native app icons and splash screens use Capacitor's defaults so far.
