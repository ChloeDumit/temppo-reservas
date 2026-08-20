/**
 * Grants or revokes platform-console access.
 *
 *   npm run grant:admin -- owner@soco.uy
 *   npm run grant:admin -- owner@soco.uy --revoke
 *
 * Platform access spans every studio, so this is deliberately a command you
 * run against the database rather than something the app can hand out.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const revoke = args.includes("--revoke");

  if (!email) {
    console.error("Usage: npm run grant:admin -- <email> [--revoke]");
    process.exit(1);
  }

  const matches = await db.user.findMany({
    where: { email },
    include: { studio: { select: { name: true } } },
  });

  if (matches.length === 0) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }

  // One email can exist in several studios; platform access is about the
  // person, so every account they hold gets the flag.
  await db.user.updateMany({
    where: { email },
    data: { isPlatformAdmin: !revoke },
  });

  console.log(`
  ${revoke ? "Revoked" : "Granted"} platform access for ${email}

${matches.map((m) => `    ${m.name} — ${m.studio.name}`).join("\n")}

  Console: /admin
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
