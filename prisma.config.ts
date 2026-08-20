import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration — migrate, studio, db pull.
 *
 * This file is read by the CLI only; the running app connects through the
 * driver adapter in src/lib/db.ts using DATABASE_URL.
 *
 * That split matters. The app runs on serverless functions and needs a
 * connection *pooler* to survive many concurrent instances. Migrations need
 * the opposite: they take a session-level Postgres advisory lock, which a
 * transaction-mode pooler does not support — the lock never lands and the
 * command fails with P1002 after timing out.
 *
 * So the CLI prefers DIRECT_URL when one is set, and falls back to
 * DATABASE_URL for local development, where Postgres is reached directly and
 * the two are the same thing.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
