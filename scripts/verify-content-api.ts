/**
 * The content API: its key, creating and updating posts by title, uploading
 * files and scheduling — with the route handlers called directly and the
 * files kept in the local media folder.
 * Run with: npx tsx scripts/verify-content-api.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never;

const KEY = "k".repeat(48);
process.env.CONTENT_API_TOKEN = KEY;
process.env.INSTAGRAM_TOKEN = "test-token";
process.env.INSTAGRAM_USER_ID_BEAUTY = "ig-beauty";
process.env.APP_URL = "https://beauty.example.test";
delete process.env.NETLIFY;
delete process.env.NETLIFY_BLOBS_CONTEXT;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

const TITLE = "verify-content-api";

async function main() {
  const posts = await import("../src/app/api/content/v1/posts/route");
  const upload = await import("../src/app/api/content/v1/upload/[uploadId]/route");
  const schedule = await import("../src/app/api/content/v1/posts/[id]/schedule/route");
  const clear = await import("../src/app/api/content/v1/posts/[id]/clear-media/route");
  const { NextRequest } = await import("next/server");
  const sharp = (await import("sharp")).default;

  const call = (url: string, init: { method?: string; body?: BodyInit; json?: unknown; key?: string | null } = {}) =>
    new NextRequest(`http://local${url}`, {
      method: init.method ?? (init.json || init.body ? "POST" : "GET"),
      headers: {
        ...(init.key === null ? {} : { Authorization: `Bearer ${init.key ?? KEY}` }),
        ...(init.json ? { "Content-Type": "application/json" } : {}),
      },
      body: init.json ? JSON.stringify(init.json) : init.body,
    });
  const params = <T>(p: T) => ({ params: Promise.resolve(p) });

  try {
    await db.contentPost.deleteMany({ where: { title: TITLE } });

    console.log("\nLa llave");
    check("without a key: refused", (await posts.GET(call("/api/content/v1/posts", { key: null }))).status, 401);
    check("with the wrong key: refused", (await posts.GET(call("/api/content/v1/posts", { key: "x".repeat(48) }))).status, 401);
    check("with the key: allowed", (await posts.GET(call("/api/content/v1/posts"))).status, 200);
    process.env.CONTENT_API_TOKEN = "short";
    check("a short key in the server is not accepted at all", (await posts.GET(call("/api/content/v1/posts", { key: "short" }))).status, 503);
    process.env.CONTENT_API_TOKEN = KEY;

    console.log("\nCrear y actualizar por título");
    const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const body = { brand: "beauty", title: TITLE, kind: "CAROUSEL", caption: "Hola", scheduledAt: at };
    const first = await posts.POST(call("/api/content/v1/posts", { json: body }));
    const created = (await first.json()) as { post: { id: string }; created: boolean };
    check("a new title creates a post", [first.status, created.created], [201, true]);
    const again = (await (await posts.POST(call("/api/content/v1/posts", { json: { ...body, caption: "Hola otra vez" } }))).json()) as { post: { id: string }; created: boolean };
    check("the same title updates it, no duplicate", [again.post.id === created.post.id, again.created], [true, false]);
    check("with the new caption", (await db.contentPost.findUniqueOrThrow({ where: { id: created.post.id } })).caption, "Hola otra vez");
    const id = created.post.id;

    console.log("\nProgramar");
    const early = await schedule.POST(call(`/api/content/v1/posts/${id}/schedule`, { json: {} }), params({ id }));
    check("no files yet: not scheduled", [early.status, ((await early.json()) as { error: string }).error], [400, "Falta subir la imagen o el video"]);

    console.log("\nSubir archivos");
    const png = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#b5536f" } }).png().toBuffer();
    for (let i = 0; i < 2; i++) {
      const uploadId = randomUUID();
      const put = await upload.PUT(call(`/api/content/v1/upload/${uploadId}?part=0`, { method: "PUT", body: new Uint8Array(png) }), params({ uploadId }));
      const done = await upload.POST(call(`/api/content/v1/upload/${uploadId}`, { json: { postId: id, filename: `${i}.png`, mimeType: "image/png", parts: 1 } }), params({ uploadId }));
      check(`file ${i + 1} uploaded and attached`, [put.status, done.status], [200, 200]);
    }
    const media = await db.contentMedia.findMany({ where: { postId: id }, orderBy: { position: "asc" } });
    check("in order, as JPEG", media.map((m) => [m.position, m.mimeType]), [[0, "image/jpeg"], [1, "image/jpeg"]]);
    const unkeyed = await upload.PUT(call(`/api/content/v1/upload/${randomUUID()}?part=0`, { method: "PUT", body: new Uint8Array(png), key: null }), params({ uploadId: randomUUID() }));
    check("uploading without the key: refused", unkeyed.status, 401);

    const ok = await schedule.POST(call(`/api/content/v1/posts/${id}/schedule`, { json: {} }), params({ id }));
    const row = await db.contentPost.findUniqueOrThrow({ where: { id } });
    check("with its files: scheduled at its time", [ok.status, row.status, row.scheduledAt?.toISOString()], [200, "SCHEDULED", at]);

    console.log("\nVolver a empezar y lo ya publicado");
    const cleared = await clear.POST(call(`/api/content/v1/posts/${id}/clear-media`, { json: {} }), params({ id }));
    check("its files can be cleared to upload again", [cleared.status, await db.contentMedia.count({ where: { postId: id } })], [200, 0]);
    await db.contentPost.update({ where: { id }, data: { status: "PUBLISHED" } });
    const touched = (await (await posts.POST(call("/api/content/v1/posts", { json: { ...body, caption: "cambio" } }))).json()) as { unchanged?: boolean };
    check("a published post is never changed", [touched.unchanged, (await db.contentPost.findUniqueOrThrow({ where: { id } })).caption], [true, "Hola otra vez"]);
  } finally {
    const left = await db.contentPost.findMany({ where: { title: TITLE }, select: { id: true } });
    await db.contentPost.deleteMany({ where: { title: TITLE } });
    const { deletePrefix } = await import("../src/lib/content/storage");
    for (const p of left) await deletePrefix(`media/${p.id}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
