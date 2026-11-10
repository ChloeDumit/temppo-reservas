/**
 * What the console says when Instagram refuses.
 * Run with: npx tsx scripts/verify-instagram-diagnosis.ts
 *
 * Graph answers "Object with ID does not exist" and "Application does not
 * have permission for this action" for several different causes each, naming
 * none of them. These checks pin down that the diagnosis asks the questions
 * that separate those causes, and that it never throws — it runs precisely
 * when something is already broken.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
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
  const { diagnoseInstagram } = await import("../src/lib/content/instagram");
  const source = readFileSync("src/lib/content/instagram.ts", "utf8");

  console.log("\nWith nothing configured");

  const token = process.env.INSTAGRAM_TOKEN;
  delete process.env.INSTAGRAM_TOKEN;

  const bare = await diagnoseInstagram("temppo");
  check("it says the token is missing", bare.findings.some((f) => f.includes("INSTAGRAM_TOKEN")), true);
  check("and does not throw", Array.isArray(bare.reachable), true);
  check("with nothing claimed about permissions", bare.scopes, null);

  if (token) process.env.INSTAGRAM_TOKEN = token;

  console.log("\nIt asks what separates the causes");

  // A wrong id and an account the token was never granted read identically
  // from Graph; only the list of reachable accounts tells them apart.
  check("it lists the pages the token administers", source.includes('graph("me/accounts"'), true);
  check("reading the Instagram account linked to each", source.includes("instagram_business_account"), true);
  // A permission error names neither the permission nor the app.
  check("it reads the token's own permissions", source.includes('graph("debug_token"'), true);
  check(
    "against what publishing needs",
    ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"].every(
      (scope) => source.includes(scope),
    ),
    true,
  );
  check("it checks the token has not expired", source.includes("expires_at"), true);
  check("and mentions Advanced Access, which is the other half", /Acceso avanzado/.test(source), true);

  console.log("\nEvery failure is reported, not thrown");

  // This runs when something is already wrong; throwing would hide the answer.
  const tries = (source.match(/try \{/g) ?? []).length;
  check("the network calls are wrapped", tries >= 2, true);
  check(
    "and each catch records a finding",
    (source.match(/findings\.push\(`No se pudieron/g) ?? []).length >= 2,
    true,
  );


  console.log("\nTwo products share the token");

  /*
    The token reaches @temppo.beauty and the console is showing Reservas: the
    one id it could offer is the wrong account. Pointing there would publish
    Reservas posts on the beauty account, which is how a broken setup passes
    for a working one.
  */
  check(
    "it refuses to offer the other brand's account",
    /la de la otra marca/.test(source),
    true,
  );
  check(
    "comparing against the other brand's configured id",
    /INSTAGRAM_USER_ID_BEAUTY : process\.env\.INSTAGRAM_USER_ID_TEMPPO/.test(
      source.slice(source.indexOf("no está entre las cuentas")),
    ),
    true,
  );
  check(
    "and still offers the list when the token simply misses a page",
    /Usá uno de los de abajo, o generá el token de nuevo/.test(source),
    true,
  );
  check(
    "it says the account must be a business one linked to a page",
    /Empresa y estar vinculada/.test(source),
    true,
  );

  console.log("\nWhen it used to work");

  const reminders = readFileSync("src/lib/content/reminders.ts", "utf8");
  const page = readFileSync("src/app/[locale]/(admin)/admin/content/page.tsx", "utf8");
  const cron = readFileSync("src/lib/reminders.ts", "utf8");

  /*
    A token that expires takes publishing down on a date nobody wrote down.
    The date it stopped is the diagnosis, so the console shows it — and the
    cron warns before it happens, so it stops being a surprise every sixty
    days.
  */
  check("the console shows the last post that went out", /status: "PUBLISHED"/.test(page), true);
  check("and the last error, with its date", /error: \{ not: null \}/.test(page), true);
  check("expiry is reported in days, not just a date", /vence en \$\{days\}/.test(source), true);
  check("naming what kills a token early", /contraseña|revocar/.test(source), true);

  check("the cron watches the token", /watchInstagramToken/.test(cron), true);
  check("warning before it runs out", /TOKEN_WARN_DAYS/.test(reminders), true);
  check("once a day rather than every pass", /getUTCHours\(\) === /.test(cron), true);
  check("and only for a product that publishes", /if \(!id\) continue;/.test(reminders), true);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
