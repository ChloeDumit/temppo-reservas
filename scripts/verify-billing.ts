/**
 * Subscription billing: period arithmetic, warning thresholds and the fact that
 * the two Mercado Pago accounts sign with different keys.
 *
 * Run with: npx tsx scripts/verify-billing.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";

const req = createRequire(import.meta.url);
const so = req.resolve("server-only");
req.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as never;

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
  );
  ok ? passed++ : failed++;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const { addMonths } = await import("../src/lib/dates");
  const { billingWarning } = await import("../src/lib/billing/index");
  const { PLAN_PRICE_CENTS, PAID_PLANS, isPaidPlan } = await import("../src/lib/billing/plans");
  const { resolveBillingTopic } = await import("../src/lib/billing/mercadopago");
  const { verifyMercadoPagoSignature } = await import("../src/lib/payments/mercadopago");

  console.log("\nBilling periods");

  check("a month on from mid-month", iso(addMonths(new Date("2026-01-15T00:00:00Z"), 1)), "2026-02-15");

  // The case that silently skips a month if you don't clamp: Jan 31 + 1 month
  // lands on March 3 with plain date arithmetic.
  check(
    "clamps to the end of a shorter month",
    iso(addMonths(new Date("2026-01-31T00:00:00Z"), 1)),
    "2026-02-28",
  );
  check(
    "clamps into a leap February",
    iso(addMonths(new Date("2028-01-31T00:00:00Z"), 1)),
    "2028-02-29",
  );
  check("several months at once", iso(addMonths(new Date("2026-08-21T00:00:00Z"), 3)), "2026-11-21");

  console.log("\nPlan catalogue");

  check("every paid plan carries a price", PAID_PLANS.every((p) => PLAN_PRICE_CENTS[p] > 0), true);
  check("TRIAL is not something you can buy", isPaidPlan("TRIAL"), false);

  console.log("\nWhat the owner gets told");

  const now = new Date("2026-08-21T12:00:00Z");
  const trial = (endsAt: string | null) => ({
    plan: "TRIAL" as const,
    trialEndsAt: endsAt ? new Date(endsAt) : null,
  });
  const sub = (status: string) => ({
    status: status as never,
    currentPeriodEnd: null,
  });

  check("a failed charge outranks everything else", billingWarning(trial(null), sub("PAST_DUE"), now), "pastDue");
  check("an active subscription says nothing", billingWarning(trial("2026-08-25"), sub("ACTIVE"), now), null);
  check("a trial with a week left warns", billingWarning(trial("2026-08-25"), null, now), "trialEnding");
  check("a trial with a month left is quiet", billingWarning(trial("2026-09-30"), null, now), null);
  check("a lapsed trial warns harder", billingWarning(trial("2026-08-01"), null, now), "trialExpired");
  check("a cancelled subscription warns", billingWarning(trial(null), sub("CANCELLED"), now), "cancelled");
  check(
    "a paid studio with no subscription row is quiet",
    billingWarning({ plan: "STUDIO", trialEndsAt: null }, null, now),
    null,
  );

  console.log("\nWhat a webhook body is about");

  // The exact body Mercado Pago sends from the dashboard's "test" button. It
  // says subscription_preapproval, not the "preapproval" the docs list.
  check(
    "the real preapproval body, as sent on the wire",
    resolveBillingTopic({ action: "updated", entity: "preapproval", type: "subscription_preapproval" }),
    "preapproval",
  );
  check(
    "the topic name the docs use",
    resolveBillingTopic({ type: "preapproval" }),
    "preapproval",
  );
  check(
    "entity alone, with no type",
    resolveBillingTopic({ action: "updated", entity: "preapproval" }),
    "preapproval",
  );
  check(
    "a monthly charge",
    resolveBillingTopic({ type: "subscription_authorized_payment" }),
    "authorizedPayment",
  );
  // A student paying their studio arrives on the other endpoint; if one ever
  // lands here it must not be mistaken for subscription money.
  check("a plain payment is not ours", resolveBillingTopic({ type: "payment" }), null);
  check("an empty body is not ours", resolveBillingTopic({}), null);

  console.log("\nWebhook signatures are per-account");

  const dataId = "9876543210";
  const requestId = "req-xyz";
  const ts = "1704908010";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const platformSecret = "platform-secret";
  const studioSecret = "studio-secret";
  const signed = createHmac("sha256", platformSecret).update(manifest).digest("hex");

  check(
    "the platform key accepts the platform's webhook",
    verifyMercadoPagoSignature({
      signatureHeader: `ts=${ts},v1=${signed}`,
      requestIdHeader: requestId,
      dataId,
      secret: platformSecret,
    }),
    true,
  );

  // The whole reason the secret is a parameter: a studio's key must not vouch
  // for a message that claims to be about our money.
  check(
    "the studio key rejects it",
    verifyMercadoPagoSignature({
      signatureHeader: `ts=${ts},v1=${signed}`,
      requestIdHeader: requestId,
      dataId,
      secret: studioSecret,
    }),
    false,
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
