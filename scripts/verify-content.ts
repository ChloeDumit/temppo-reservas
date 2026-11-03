/**
 * The content calendar: files, Instagram publishing and the sweep, with
 * Instagram's API stubbed so nothing is posted anywhere.
 * Run with: npx tsx scripts/verify-content.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never;

// Read when the module loads: set before importing it.
process.env.INSTAGRAM_TOKEN = "test-token";
process.env.INSTAGRAM_USER_ID_BEAUTY = "ig-beauty";
process.env.APP_URL = "https://beauty.example.test";
process.env.INSTAGRAM_WAIT_MS = "0";
process.env.INSTAGRAM_POLL_MS = "0";
delete process.env.NETLIFY;
// No real pushes to anyone's phone from a test, and no real email either.
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.EMAIL_SEND_IN_DEV;
delete process.env.NETLIFY_BLOBS_CONTEXT;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

type Call = { method: string; path: string; params: Record<string, string> };

async function main() {
  const { publishDueContent, publishToInstagram, publishProblem, mediaUrl, resetPost } = await import("../src/lib/content/instagram");
  const { parseCollaborators } = await import("../src/lib/content/collaborators");
  const { remindManualContent } = await import("../src/lib/content/reminders");
  const { processUpload } = await import("../src/lib/content/media");
  const { putMedia, getMedia, deletePrefix } = await import("../src/lib/content/storage");
  const { GET: serveMedia } = await import("../src/app/api/content-media/[...key]/route");
  const sharp = (await import("sharp")).default;
  const { contentPush } = await import("../src/lib/content/notify");
  const pushed: { userId: string; title: string; url?: string }[] = [];
  contentPush.send = async (userId, message) => {
    pushed.push({ userId, title: message.title, url: message.url });
    return { sent: 1, failed: 0 };
  };

  /* ---------------------------------------------------- a stubbed Instagram */
  const calls: Call[] = [];
  let nextId = 1;
  const status = new Map<string, string[]>(); // container → status codes to return, in turn
  let failCreate: string | null = null;
  let refuseCollaborators = false;
  let hangStatus = false; // a request cut off while Instagram processes
  let onInstagram: { id: string; caption: string; permalink: string; timestamp: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.hostname !== "graph.facebook.com") return realFetch(url, init);
    const path = u.pathname.split("/").slice(2).join("/");
    const params = Object.fromEntries(init?.method === "POST" ? new URLSearchParams(String(init.body)) : u.searchParams);
    calls.push({ method: init?.method ?? "GET", path, params });
    const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code });
    if (path.endsWith("/media") && init?.method === "POST") {
      if (failCreate) return json({ error: { code: 9004, message: failCreate } }, 400);
      if (refuseCollaborators && params.collaborators) return json({ error: { code: 100, message: "Invalid collaborator" } }, 400);
      const id = `c${nextId++}`;
      status.set(id, params.video_url && !params.is_carousel_item ? ["IN_PROGRESS", "FINISHED"] : ["FINISHED"]);
      return json({ id });
    }
    if (path.endsWith("/media_publish")) return json({ id: `m-${params.creation_id}` });
    if (path.endsWith("/media") && params.fields?.startsWith("id,caption")) return json({ data: onInstagram });
    if (params.fields === "status_code,status") {
      if (hangStatus) return new Promise<Response>(() => {});
      const queue = status.get(path) ?? ["FINISHED"];
      const code = queue.length > 1 ? queue.shift()! : queue[0];
      return json({ status_code: code });
    }
    if (params.fields === "permalink") return json({ permalink: `https://www.instagram.com/p/${path}/` });
    return json({});
  }) as typeof fetch;
  const created = () => calls.filter((c) => c.method === "POST" && c.path.endsWith("/media"));
  const published = () => calls.filter((c) => c.path.endsWith("/media_publish"));

  const keys: string[] = [];
  const post = async (data: Record<string, unknown>, files: { video?: boolean }[] = [{}]) => {
    const p = await db.contentPost.create({ data: { brand: "beauty", title: "verify-content", caption: "Hola #uñas", channel: "INSTAGRAM", ...data } });
    for (const [i, f] of files.entries()) {
      const key = `media/verify/${p.id}-${i}.${f.video ? "mp4" : "jpg"}`;
      keys.push(key);
      await db.contentMedia.create({ data: { postId: p.id, position: i, isVideo: Boolean(f.video), key, mimeType: f.video ? "video/mp4" : "image/jpeg", size: 10, filename: `f${i}` } });
    }
    return p;
  };
  const reload = (id: string) => db.contentPost.findUniqueOrThrow({ where: { id }, include: { media: true } });
  const past = new Date(Date.now() - 60_000);

  try {
    await db.contentPost.deleteMany({ where: { title: "verify-content" } });

    console.log("\nArchivos");
    const png = await sharp({ create: { width: 20, height: 25, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const done = await processUpload(new Uint8Array(png), "image/png");
    check("a PNG becomes a JPEG for Instagram", "error" in done ? done.error : [done.mimeType, done.ext, done.bytes[0] === 0xff && done.bytes[1] === 0xd8], ["image/jpeg", "jpg", true]);
    check("other types are refused", "error" in (await processUpload(new Uint8Array([1, 2]), "application/pdf")), true);
    await putMedia("media/verify/served.jpg", new Uint8Array([0xff, 0xd8, 1]), "image/jpeg");
    const res = await serveMedia(new Request("http://x/") as never, { params: Promise.resolve({ key: ["media", "verify", "served.jpg"] }) });
    check("finished media is served publicly", [res.status, res.headers.get("content-type")], [200, "image/jpeg"]);
    const parts = await serveMedia(new Request("http://x/") as never, { params: Promise.resolve({ key: ["uploads", "x", "0000"] }) });
    check("an upload's parts are not", parts.status, 404);
    check("Instagram gets a public URL", mediaUrl("media/a/b.jpg"), "https://beauty.example.test/api/content-media/media/a/b.jpg");

    console.log("\nAntes de publicar");
    const empty = await post({ status: "READY" }, []);
    check("no file, no post", publishProblem(await reload(empty.id)), "Falta subir la imagen o el video");
    const shortCarousel = await post({ kind: "CAROUSEL" }, [{}]);
    check("a carousel needs two to ten", publishProblem(await reload(shortCarousel.id)), "Un carrusel lleva entre 2 y 10 archivos");
    const photoReel = await post({ kind: "REEL" }, [{}]);
    check("a reel needs a video", publishProblem(await reload(photoReel.id)), "Un reel tiene que ser un video");
    const manual = await post({ channel: "MANUAL" });
    check("a manual post is not for the API", publishProblem(await reload(manual.id))?.startsWith("Se publica a mano"), true);
    await db.contentPost.deleteMany({ where: { id: { in: [empty.id, shortCarousel.id, photoReel.id, manual.id] } } });

    console.log("\nUna imagen");
    const photo = await post({ kind: "POST", status: "SCHEDULED", scheduledAt: past });
    const future = await post({ kind: "POST", status: "SCHEDULED", scheduledAt: new Date(Date.now() + 3_600_000) });
    const r1 = await publishDueContent();
    const p1 = await reload(photo.id);
    check("its time came: published", [r1.published, p1.status], [1, "PUBLISHED"]);
    check("from the file's public URL, with the caption", [created()[0].params.image_url.endsWith(`${photo.id}-0.jpg`), created()[0].params.caption], [true, "Hola #uñas"]);
    check("with its link kept", p1.permalink?.startsWith("https://www.instagram.com/p/"), true);
    check("and @temppo.uy invited as collaborator, by default", created()[0].params.collaborators, '["temppo.uy"]');
    check("the one for later waits", (await reload(future.id)).status, "SCHEDULED");
    const adminCount = await db.user.count({ where: { isPlatformAdmin: true, isActive: true } });
    const upPushes = pushed.filter((p) => p.title === "Publicado en Instagram" && p.url === `/admin/content/${photo.id}`);
    check("every platform admin gets a push that it went up", [adminCount > 0, upPushes.length], [true, adminCount]);
    check("and no email", await db.notificationLog.count({ where: { relatedId: photo.id } }), 0);

    console.log("\nUn reel que Instagram tarda en procesar");
    calls.length = 0;
    const reel = await post({ kind: "REEL", status: "SCHEDULED", scheduledAt: past }, [{ video: true }]);
    const r2 = await publishDueContent();
    const p2 = await reload(reel.id);
    check("first sweep: still processing, container kept", [r2.processing, p2.status, Boolean(p2.igContainerId)], [1, "PUBLISHING", true]);
    check("sent as a reel, shared to the feed", [created()[0].params.media_type, created()[0].params.share_to_feed], ["REELS", "true"]);
    await publishDueContent();
    check("next sweep: published, without uploading it again", [(await reload(reel.id)).status, created().length, published().length], ["PUBLISHED", 1, 1]);

    console.log("\nUn carrusel");
    calls.length = 0;
    const carousel = await post({ kind: "CAROUSEL", status: "SCHEDULED", scheduledAt: past }, [{}, {}, { video: true }]);
    await publishDueContent();
    const items = created().filter((c) => c.params.is_carousel_item === "true");
    const parent = created().find((c) => c.params.media_type === "CAROUSEL");
    check("one container per file, in order", items.map((c) => c.params.video_url ? "video" : "image"), ["image", "image", "video"]);
    check("then the carousel with its items and caption", [parent?.params.children.split(",").length, parent?.params.caption], [3, "Hola #uñas"]);
    check("published", (await reload(carousel.id)).status, "PUBLISHED");
    check("collaborators on the carousel, not on its items", [parent?.params.collaborators, items.some((c) => c.params.collaborators)], ['["temppo.uy"]', false]);

    console.log("\nColaboradores");
    calls.length = 0;
    const story = await post({ kind: "STORY", status: "SCHEDULED", scheduledAt: past });
    await publishDueContent();
    check("a story goes without them (Instagram does not take them there)", [(await reload(story.id)).status, created()[0].params.collaborators], ["PUBLISHED", undefined]);
    calls.length = 0;
    const solo = await post({ kind: "POST", status: "SCHEDULED", scheduledAt: past, collaborators: [] });
    await publishDueContent();
    check("none set: none sent", [(await reload(solo.id)).status, created()[0].params.collaborators], ["PUBLISHED", undefined]);
    calls.length = 0;
    refuseCollaborators = true;
    const refused = await post({ kind: "POST", status: "SCHEDULED", scheduledAt: past, collaborators: ["no.existe"] });
    await publishDueContent();
    refuseCollaborators = false;
    check("Instagram refuses the collaborator: the post goes up without it", [(await reload(refused.id)).status, created().map((c) => c.params.collaborators)], ["PUBLISHED", ['["no.existe"]', undefined]]);
    check(
      "the console reads «@Temppo.uy, otra» as two usernames",
      [parseCollaborators("@Temppo.uy, otra  @otra"), "error" in parseCollaborators("a b c d"), "error" in parseCollaborators("con espacio!")],
      [{ usernames: ["temppo.uy", "otra"] }, true, true],
    );

    console.log("\nErrores y dobles");
    calls.length = 0;
    failCreate = "Only photo or video can be accepted as media type.";
    const bad = await post({ kind: "POST", status: "SCHEDULED", scheduledAt: past });
    await publishDueContent();
    const pb = await reload(bad.id);
    check("Instagram's refusal is kept on the post", [pb.status, pb.error?.includes("Only photo or video")], ["FAILED", true]);
    check("and the admins get a push saying it failed", pushed.filter((p) => p.title.startsWith("No se pudo") && p.url === `/admin/content/${bad.id}`).length, adminCount);
    failCreate = null;
    calls.length = 0;
    const twice = await post({ kind: "POST", status: "SCHEDULED", scheduledAt: past });
    const both = await Promise.all([publishToInstagram(twice.id), publishToInstagram(twice.id)]);
    check("two at once: one publishes, the other stands back", [both.sort(), created().length], [["published", "skipped"], 1]);

    console.log("\nCortado a mitad de camino");
    calls.length = 0;
    hangStatus = true;
    const cut = await post({ kind: "REEL", status: "SCHEDULED", scheduledAt: past }, [{ video: true }]);
    void publishToInstagram(cut.id);
    await new Promise((r) => setTimeout(r, 400));
    hangStatus = false;
    const pc = await reload(cut.id);
    check("the container is kept before waiting, so a cut-off request is not started over", [pc.status, Boolean(pc.igContainerId)], ["PUBLISHING", true]);
    await publishDueContent();
    await publishDueContent();
    check("and the next sweeps finish it with the same container", [(await reload(cut.id)).status, created().length], ["PUBLISHED", 1]);

    console.log("\nDestrabar");
    const old = new Date(Date.now() - 3_600_000);
    const stuck = await post({ kind: "REEL", status: "PUBLISHING", caption: "Trabada #uñas" }, [{ video: true }]);
    await db.contentPost.update({ where: { id: stuck.id }, data: { updatedAt: old, attempts: 4 } });
    onInstagram = [];
    check("not on Instagram: back to ready", [await resetPost(stuck.id), (await reload(stuck.id)).attempts], [{ status: "READY" }, 0]);
    const landed = await post({ kind: "REEL", status: "PUBLISHING", caption: "Llegó #uñas" }, [{ video: true }]);
    await db.contentPost.update({ where: { id: landed.id }, data: { updatedAt: old } });
    onInstagram = [{ id: "m-99", caption: "Llegó #uñas", permalink: "https://www.instagram.com/reel/x/", timestamp: new Date().toISOString() }];
    await resetPost(landed.id);
    const pl = await reload(landed.id);
    check("it did reach Instagram: marked published with its link, not sent twice", [pl.status, pl.permalink], ["PUBLISHED", "https://www.instagram.com/reel/x/"]);
    const busy = await post({ kind: "REEL", status: "PUBLISHING" }, [{ video: true }]);
    check("one being published right now is left alone", "error" in (await resetPost(busy.id)), true);
    onInstagram = [];

    console.log("\nRecordatorios de lo que va a mano");
    const hours = (h: number) => new Date(Date.now() + h * 3_600_000);
    pushed.length = 0;
    const tomorrow = await post({ channel: "MANUAL", kind: "REEL", status: "SCHEDULED", scheduledAt: hours(20), notes: "Grabá la voz en off.\nGUION: «Nueve y cincuenta…»" }, [{ video: true }]);
    const far = await post({ channel: "MANUAL", status: "SCHEDULED", scheduledAt: hours(30) });
    const auto = await post({ kind: "POST", status: "SCHEDULED", scheduledAt: hours(20) });
    check("the day before: one reminder, for the manual one only", await remindManualContent(), 1);
    const reminders = pushed.filter((p) => p.url === `/admin/content/${tomorrow.id}`);
    check("a push to every admin, starting with «Mañana»", [reminders.length, reminders[0]?.title.startsWith("Mañana subís a mano")], [adminCount, true]);
    const mails = await db.notificationLog.count({ where: { relatedId: tomorrow.id, template: "content-reminder" } });
    check("and an email to each admin with an address", mails > 0, true);
    check("not sent twice", await remindManualContent(), 0);
    await db.contentPost.update({ where: { id: tomorrow.id }, data: { scheduledAt: hours(1.5) } });
    check("a couple of hours before: the second one", [await remindManualContent(), (await reload(tomorrow.id)).reminderStage], [1, 2]);
    check("and then nothing more", await remindManualContent(), 0);
    check("nothing for one two days off or one that publishes itself", [(await reload(far.id)).reminderStage, (await reload(auto.id)).reminderStage], [0, 0]);
    const { schedulePost } = await import("../src/lib/content/schedule");
    await schedulePost(tomorrow.id, hours(40));
    check("moving its date starts the reminders over", (await reload(tomorrow.id)).reminderStage, 0);
    await db.notificationLog.deleteMany({ where: { template: "content-reminder", relatedId: tomorrow.id } });
  } finally {
    globalThis.fetch = realFetch;
    await db.contentPost.deleteMany({ where: { title: "verify-content" } });
    await deletePrefix("media/verify");
    void getMedia;
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
