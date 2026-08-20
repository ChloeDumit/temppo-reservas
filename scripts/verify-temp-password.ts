/**
 * Temporary password issuance.
 * Run with: npx tsx scripts/verify-temp-password.ts
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
  const { generateTempPassword } = await import("../src/lib/auth/temp-password");
  const { hashPassword, verifyPassword } = await import("../src/lib/auth/password");

  console.log("\nGenerated passwords");

  const codes = Array.from({ length: 3000 }, () => generateTempPassword());

  check("unique across 3000 draws", new Set(codes).size, 3000);
  check("shaped xxx-xxx-xxx", codes.every((c) => /^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$/.test(c)), true);
  /*
    Read aloud at a desk or typed from a screenshot, so lookalikes go. Only
    pairs matter: b and s stay because 6, 5 and 8 are absent, but 0/o and
    1/i/l would each be ambiguous against something still in the alphabet.
  */
  check("no ambiguous characters", codes.some((c) => /[01ilo]/.test(c)), false);
  check("long enough to survive the change form", codes[0].length >= 8, true);

  console.log("\nHashing");

  const plain = generateTempPassword();
  const hash = await hashPassword(plain);

  check("the plaintext is not recoverable from the hash", hash.includes(plain), false);
  check("it verifies", await verifyPassword(plain, hash), true);
  check("a different password does not", await verifyPassword(generateTempPassword(), hash), false);

  console.log("\nIssuance rules");

  const fs = await import("node:fs");
  const actions = fs.readFileSync("src/app/[locale]/(app)/students/actions.ts", "utf8");
  const guards = fs.readFileSync("src/lib/auth/guards.ts", "utf8");
  const setter = fs.readFileSync("src/app/[locale]/(gate)/password/actions.ts", "utf8");

  check("creation flags the account", actions.includes("mustChangePassword: true"), true);
  check("creation stores only a hash", actions.includes("passwordHash: await hashPassword"), true);
  check("the guard holds the account at the password screen", guards.includes("mustChangePassword"), true);
  check("setting a password clears the flag", setter.includes("mustChangePassword: false"), true);
  // Whoever was handed the temporary password should not keep access.
  check("setting a password revokes existing sessions", setter.includes("session.deleteMany"), true);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
