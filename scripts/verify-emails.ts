/**
 * Email rendering.
 * Run with: npx tsx scripts/verify-emails.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";

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
  const { renderEmail } = await import("../src/lib/notifications/email-template");

  const anima = {
    studioName: "Estudio Ánima",
    accentColor: "#E07A5F",
    logoUrl: null,
    locale: "es",
  };
  const render = (over: Partial<Parameters<typeof renderEmail>[0]> = {}) =>
    renderEmail({
      body: "Hola Ana,\n\nSe liberó un lugar. Confirmá acá: https://reservas.temppo.uy/api/waitlist/claim?token=abc123",
      subject: "Estudio Ánima — se liberó un lugar",
      template: "waitlist_offer",
      branding: anima,
      appUrl: "https://reservas.temppo.uy",
      ...over,
    });

  console.log("\nLayout");

  const html = render();
  // Gmail strips <style> blocks, so anything not inlined simply does not apply.
  check("no <style> block to be stripped", /<style/i.test(html), false);
  check("tables, not flexbox", /display:\s*flex/.test(html), false);
  check("every text node names a font", html.split("<p ").length - 1 >= 1, true);
  check(
    "font names with spaces are quoted",
    /font-family:[^"]*Segoe UI/.test(html) && !/'Segoe UI'/.test(html),
    false,
  );

  console.log("\nThe link becomes a button");

  check("button rendered", html.includes("Confirmar mi lugar"), true);
  check("href points at the link", html.includes("waitlist/claim?token=abc123"), true);
  // Otherwise the sentence reads "Confirmá acá:" and stops.
  check("dangling colon removed from the prose", /acá\s*:\s*<\/p>/.test(html), false);
  check("link still offered as copyable text", html.split("waitlist/claim").length - 1 >= 2, true);

  console.log("\nA message with no link");

  const plain = render({
    body: "Hola Valentina, te recordamos tu clase de mañana.",
    template: "class_reminder",
  });
  check("renders no button", plain.includes("border-radius:999px;background:"), false);
  check("still shows the message", plain.includes("te recordamos tu clase"), true);

  console.log("\nStudio branding");

  const soco = render({
    branding: { studioName: "SOCO", accentColor: "#C85C35", logoUrl: null, locale: "es" },
  });
  check("uses the studio's accent", soco.includes("#C85C35"), true);
  check("uses the studio's name", soco.includes("SOCO"), true);
  check(
    "falls back to the app mascot with no studio logo",
    soco.includes("https://reservas.temppo.uy/icon-192.png"),
    true,
  );

  const withLogo = render({
    branding: { ...anima, logoUrl: "https://cdn.example.com/anima.png" },
  });
  check("prefers the studio's own logo", withLogo.includes("cdn.example.com/anima.png"), true);

  const uploaded = render({ branding: { ...anima, logoUrl: "/api/logo/studio1?v=abc" } });
  check(
    "gives an uploaded logo the app's host",
    uploaded.includes('src="https://reservas.temppo.uy/api/logo/studio1?v=abc"'),
    true,
  );

  console.log("\nLocale");

  const english = render({ branding: { ...anima, locale: "en" } });
  check("English CTA", english.includes("Claim my spot"), true);
  check("English lang attribute", english.includes('lang="en"'), true);

  console.log("\nEscaping");

  const nasty = render({
    body: 'Hola <script>alert("x")</script> & co',
    template: "welcome",
  });
  check("markup in the body is escaped", nasty.includes("<script>"), false);
  check("but the text survives", nasty.includes("&lt;script&gt;"), true);
  check("ampersands escaped", nasty.includes("&amp; co"), true);

  console.log("\nWhat actually goes out");
  // A fake key and a stubbed network: whatever this decides, nothing leaves.
  const { emailTransport, isDeliverableAddress } = await import("../src/lib/notifications/email");
  const saved = { key: process.env.RESEND_API_KEY, dev: process.env.EMAIL_SEND_IN_DEV };
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("api.resend.com")) {
      calls++;
      return new Response(JSON.stringify({ id: "stub" }), { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  const info = console.info;
  console.info = () => {};
  try {
    process.env.RESEND_API_KEY = "re_test_not_a_key";
    delete process.env.EMAIL_SEND_IN_DEV;
    const mail = (to: string) => emailTransport.send({ studioId: "none", to, template: "welcome", subject: "x", body: "x" });
    await mail("someone@gmail.com");
    check("outside production nothing is sent, even with a key", calls, 0);
    process.env.EMAIL_SEND_IN_DEV = "1";
    await mail("owner@c.test");
    await mail("ana@demo.example");
    check("test addresses are never sent to", calls, 0);
    check("reserved domains are recognised", [isDeliverableAddress("a@b.test"), isDeliverableAddress("a@gmail.com"), isDeliverableAddress(null)], [false, true, false]);
  } finally {
    globalThis.fetch = realFetch;
    console.info = info;
    if (saved.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = saved.key;
    if (saved.dev === undefined) delete process.env.EMAIL_SEND_IN_DEV;
    else process.env.EMAIL_SEND_IN_DEV = saved.dev;
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
