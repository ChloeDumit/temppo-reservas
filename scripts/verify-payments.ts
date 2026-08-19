/**
 * Payment plumbing: webhook signature verification and payment codes.
 * Run with: npx tsx scripts/verify-payments.ts
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

async function main() {
  const { verifyMercadoPagoSignature } = await import("../src/lib/payments/mercadopago");
  const { generatePaymentCode, whatsappDigits, whatsappLink } = await import(
    "../src/lib/payment-code"
  );

  console.log("\nWebhook signature");

  const SECRET = "test-webhook-secret";
  const previous = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;

  const dataId = "1234567890";
  const requestId = "req-abc";
  const ts = "1704908010";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const good = createHmac("sha256", SECRET).update(manifest).digest("hex");

  check(
    "accepts a correctly signed webhook",
    verifyMercadoPagoSignature({
      signatureHeader: `ts=${ts},v1=${good}`,
      requestIdHeader: requestId,
      dataId,
    }),
    true,
  );

  check(
    "rejects a tampered signature",
    verifyMercadoPagoSignature({
      signatureHeader: `ts=${ts},v1=${"0".repeat(64)}`,
      requestIdHeader: requestId,
      dataId,
    }),
    false,
  );

  check(
    "rejects a replayed signature under a different payment id",
    verifyMercadoPagoSignature({
      signatureHeader: `ts=${ts},v1=${good}`,
      requestIdHeader: requestId,
      dataId: "9999999999",
    }),
    false,
  );

  check(
    "rejects a missing signature header",
    verifyMercadoPagoSignature({ signatureHeader: null, requestIdHeader: requestId, dataId }),
    false,
  );

  check(
    "rejects a malformed header",
    verifyMercadoPagoSignature({
      signatureHeader: "garbage",
      requestIdHeader: requestId,
      dataId,
    }),
    false,
  );

  // Uppercase ids are normalised before hashing.
  const upperManifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const upperSig = createHmac("sha256", SECRET).update(upperManifest).digest("hex");
  check(
    "normalises the payment id case",
    verifyMercadoPagoSignature({
      signatureHeader: `ts=${ts},v1=${upperSig}`,
      requestIdHeader: requestId,
      dataId: dataId.toUpperCase(),
    }),
    true,
  );

  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  check(
    "passes through when no secret is configured",
    verifyMercadoPagoSignature({ signatureHeader: null, requestIdHeader: null, dataId: null }),
    true,
  );
  if (previous) process.env.MERCADOPAGO_WEBHOOK_SECRET = previous;

  console.log("\nPayment codes");

  const codes = new Set(Array.from({ length: 2000 }, () => generatePaymentCode()));
  check("codes are unique across 2000 draws", codes.size, 2000);

  const sample = generatePaymentCode();
  check("code is prefixed", sample.startsWith("TP-"), true);
  check("code has a fixed length", sample.length, 9);
  check(
    "code avoids ambiguous characters",
    /[01OI]/.test(sample.slice(3)),
    false,
  );

  console.log("\nWhatsApp links");

  check("strips formatting from numbers", whatsappDigits("+598 99 111-222"), "59899111222");
  const link = whatsappLink("+59899111222", "Hola! Código: TP-ABC123");
  check("builds a wa.me link", link.startsWith("https://wa.me/59899111222?text="), true);
  check("encodes the message", link.includes("TP-ABC123"), true);
  check("escapes spaces", link.includes(" "), false);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
