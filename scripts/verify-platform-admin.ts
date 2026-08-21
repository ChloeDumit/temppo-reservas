/**
 * Platform console access control.
 * Run with: npx tsx scripts/verify-platform-admin.ts
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

/** Mirrors assertPlatformAdmin without dragging in Next's request context. */
function gate(user: { isPlatformAdmin?: boolean; role?: string } | null) {
  if (!user) return "UNAUTHENTICATED";
  if (!user.isPlatformAdmin) return "FORBIDDEN";
  return "OK";
}

async function main() {
  console.log("\nConsole access");

  check("signed-out is rejected", gate(null), "UNAUTHENTICATED");
  check("a STUDENT is rejected", gate({ role: "STUDENT" }), "FORBIDDEN");
  check("an INSTRUCTOR is rejected", gate({ role: "INSTRUCTOR" }), "FORBIDDEN");
  check("a studio ADMIN is rejected", gate({ role: "ADMIN" }), "FORBIDDEN");
  // The important one: owning a studio must not grant platform access.
  check("a studio OWNER is rejected", gate({ role: "OWNER" }), "FORBIDDEN");
  check(
    "an OWNER without the flag is rejected",
    gate({ role: "OWNER", isPlatformAdmin: false }),
    "FORBIDDEN",
  );
  check(
    "only the platform flag grants access",
    gate({ role: "STUDENT", isPlatformAdmin: true }),
    "OK",
  );

  console.log("\nEvery console action re-checks the flag");

  const fs = await import("node:fs");
  const source = fs.readFileSync("src/app/[locale]/(admin)/admin/actions.ts", "utf8");
  const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  const guarded = exported.filter((name) => {
    const body = source.slice(source.indexOf(`export async function ${name}`));
    const end = body.indexOf("\nexport async function", 1);
    return (end === -1 ? body : body.slice(0, end)).includes("assertPlatformAdmin");
  });

  check("actions found", exported.length > 0, true);
  check("all of them assert the flag", guarded.length, exported.length);

  console.log("\nFoot-guns");

  check(
    "suspending revokes the studio's sessions",
    source.includes("session.deleteMany"),
    true,
  );
  check(
    "an admin cannot disable their own account",
    source.includes("user.id === admin.id"),
    true,
  );
  /*
    Every console action leaves a trail. The one exception is deliberate:
    AuditLog rows belong to a studio, and a plan price belongs to none of them,
    so PlanPrice carries its own updatedAt/updatedById instead. Listing it here
    rather than loosening the count keeps the guard honest — a new action with
    no audit row still fails this.
  */
  const AUDITED_ELSEWHERE = ["setPlanPricesAction"];
  const shouldAudit = exported.filter((name) => !AUDITED_ELSEWHERE.includes(name));

  check(
    "the audit exemptions still exist",
    AUDITED_ELSEWHERE.filter((name) => !exported.includes(name)),
    [],
  );

  // Count call sites only — the import line mentions it too.
  const auditCalls = (source.match(/await recordAudit\(/g) ?? []).length;
  check("every other action writes an audit row", auditCalls, shouldAudit.length);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
