/**
 * Checks payroll maths and CSV safety.
 * Run with: npx tsx scripts/verify-reports.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const p = req.resolve("server-only");
req.cache[p] = { id: p, filename: p, loaded: true, exports: {} } as never;

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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
  const { instructorPayroll, toCsv, csvCell, financialSummary } = await import("../src/lib/reports");

  console.log("\nCSV safety");
  check("escapes embedded quotes", csvCell('He said "hi"'), '"He said ""hi"""');
  check("quotes values containing commas", csvCell("Pilates, Reformer"), '"Pilates, Reformer"');
  check("neutralises formula injection", csvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  check("neutralises leading minus", csvCell("-1+1"), "'-1+1");
  check("empty for null", csvCell(null), "");
  const csv = toCsv(["a", "b"], [[1, "x,y"]]);
  check("rows use CRLF", csv.includes("\r\n"), true);
  check("starts with a UTF-8 BOM", csv.charCodeAt(0), 0xfeff);

  console.log("\nPayroll");
  await db.studio.deleteMany({ where: { slug: "payroll-scratch" } });
  const studio = await db.studio.create({
    data: { name: "Payroll Scratch", slug: "payroll-scratch", timezone: "America/Montevideo" },
  });

  const mkInstructor = async (
    email: string,
    rates: { payPerClassCents?: number; payPerHourCents?: number },
  ) => {
    const user = await db.user.create({
      data: {
        studioId: studio.id,
        email,
        name: email.split("@")[0],
        role: "INSTRUCTOR",
        instructorProfile: { create: rates },
      },
      include: { instructorProfile: true },
    });
    return user.instructorProfile!;
  };

  const perClass = await mkInstructor("perclass@p.test", { payPerClassCents: 90000 });
  const perHour = await mkInstructor("perhour@p.test", { payPerHourCents: 60000 });
  const unset = await mkInstructor("unset@p.test", {});

  const base = new Date("2026-03-10T12:00:00Z");
  const mkClass = (instructorId: string, minutes: number, offsetDays: number, cancelled = false) =>
    db.classInstance.create({
      data: {
        studioId: studio.id,
        instructorId,
        name: "Class",
        startsAt: new Date(base.getTime() + offsetDays * 86_400_000),
        endsAt: new Date(base.getTime() + offsetDays * 86_400_000 + minutes * 60_000),
        capacity: 10,
        status: cancelled ? "CANCELLED" : "SCHEDULED",
      },
    });

  await mkClass(perClass.id, 55, 0);
  await mkClass(perClass.id, 55, 1);
  await mkClass(perClass.id, 55, 2, true); // cancelled — must not be paid
  await mkClass(perHour.id, 90, 0); // 1.5h
  await mkClass(perHour.id, 30, 1); // 0.5h
  await mkClass(unset.id, 60, 0);
  await mkClass(perClass.id, 55, 40); // outside the range

  const range = {
    from: new Date("2026-03-01T00:00:00Z"),
    to: new Date("2026-04-01T00:00:00Z"),
  };
  const rows = await instructorPayroll(studio.id, range);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

  check("per-class: cancelled class excluded", byName.perclass.classes, 2);
  check("per-class: pay is rate × classes", byName.perclass.payCents, 180000);
  check("per-class: basis reported", byName.perclass.basis, "per_class");
  check("per-hour: minutes summed", byName.perhour.minutes, 120);
  check("per-hour: pay prorated by time", byName.perhour.payCents, 120000);
  check("no rate set: pays zero", byName.unset.payCents, 0);
  check("no rate set: basis flagged", byName.unset.basis, "unset");
  check("out-of-range class excluded", rows.reduce((s, r) => s + r.classes, 0), 5);

  console.log("\nFinance");
  await db.transaction.createMany({
    data: [
      { studioId: studio.id, type: "INCOME", category: "Packs", amountCents: 500000, occurredAt: base },
      { studioId: studio.id, type: "INCOME", category: "Packs", amountCents: 250000, occurredAt: base },
      { studioId: studio.id, type: "EXPENSE", category: "Rent", amountCents: 300000, occurredAt: base },
      // Outside the range — must not count.
      { studioId: studio.id, type: "INCOME", category: "Packs", amountCents: 999999, occurredAt: new Date("2026-06-01T12:00:00Z") },
    ],
  });
  const finance = await financialSummary(studio.id, range);
  check("income summed in range", finance.income, 750000);
  check("expenses summed in range", finance.expenses, 300000);
  check("net is income minus expenses", finance.net, 450000);

  await db.studio.delete({ where: { id: studio.id } });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
