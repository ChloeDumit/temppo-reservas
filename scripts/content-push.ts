/**
 * Pushes a content plan to the console in production: creates or updates each
 * post with its date and caption, uploads its files in order, and schedules
 * the ones whose time is still ahead. Safe to run twice: posts are matched by
 * title, files are only uploaded to posts that have none (unless --replace),
 * and published posts are never touched.
 *
 *   npx tsx scripts/content-push.ts --plan noviembre-2 [--schedule] [--replace] [--dry-run]
 *
 * Needs CONTENT_API_TOKEN in .env (the same value as in Netlify) and the files
 * under marketing/ (or --root). The server is CONTENT_API_BASE, by default
 * https://beauty.temppo.uy.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { CONTENT_PLANS } from "../src/lib/content/plan-noviembre";
import { wallTimeToUtc } from "../src/lib/dates";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const BASE = (option("base") ?? process.env.CONTENT_API_BASE ?? "https://beauty.temppo.uy").replace(/\/$/, "");
const ROOT = path.resolve(option("root") ?? "marketing");
const TOKEN = process.env.CONTENT_API_TOKEN ?? "";
const TZ = "America/Montevideo";
const PART = 4 * 1024 * 1024;

/** Which files go with each post, relative to marketing/, in order. */
const FILES: Record<string, string[]> = {
  "Reel · Le llega solo por WhatsApp": ["video/out/temppo-beauty-whatsapp-musica.mp4"],
  "Carrusel · Lo que recibe tu clienta": [1, 2, 3, 4, 5].map((i) => `instagram/noviembre/carrusel-recibe-${i}.png`),
  "Reel · ¿Tenés lugar?": ["video/out/temppo-beauty-tenes-lugar-musica.mp4"],
  "Reel · Mientras dormís": ["video/out/temppo-beauty-mientras-dormis-musica.mp4"],
  "Post · El recordatorio sale solo": ["instagram/noviembre/post-recordatorio.png"],
  "Reel · Un día con mi agenda": ["video/out/temppo-beauty-un-dia-musica.mp4"],
  "Carrusel · 3 cosas que tu agenda hace sola": [1, 2, 3, 4].map((i) => `instagram/noviembre/carrusel-sola-${i}.png`),
  "Reel · La seña": ["video/out/temppo-beauty-sena-musica.mp4"],
  "Reel · POV: te cancelan 10 minutos antes": ["video/out/temppo-beauty-pov-cancela-musica.mp4"],
  "Carrusel · 4 mensajes para copiar y pegar": [1, 2, 3, 4, 5, 6].map((i) => `instagram/noviembre-2/carrusel-mensajes-${i}.png`),
  "Reel · Antes / después": ["video/out/temppo-beauty-antes-despues-musica.mp4"],
  "Carrusel · ¿Cuánto te cuesta una clienta que no viene?": [1, 2, 3, 4, 5].map((i) => `instagram/noviembre-2/carrusel-cuenta-${i}.png`),
  "Reel · La seña, explicada en 15 segundos": ["video/out/temppo-beauty-sena-15-musica.mp4"],
  "Post · Diciembre se acerca": ["instagram/noviembre-2/post-diciembre.png"],
};

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime" };

async function api(method: string, route: string, body?: unknown, raw?: Uint8Array) {
  const res = await fetch(`${BASE}/api/content/v1${route}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(raw ? {} : { "Content-Type": "application/json" }) },
    body: raw ? new Blob([new Uint8Array(raw)]) : body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${method} ${route}: ${res.status} ${json.error ?? ""}`);
  return json;
}

async function upload(postId: string, file: string) {
  const bytes = new Uint8Array(readFileSync(file));
  const uploadId = randomUUID();
  const parts = Math.max(1, Math.ceil(bytes.byteLength / PART));
  for (let i = 0; i < parts; i++) await api("PUT", `/upload/${uploadId}?part=${i}`, undefined, bytes.subarray(i * PART, (i + 1) * PART));
  await api("POST", `/upload/${uploadId}`, { postId, filename: path.basename(file), mimeType: MIME[path.extname(file).toLowerCase()], parts });
}

async function main() {
  const plan = CONTENT_PLANS.find((p) => p.id === option("plan"));
  if (!plan) throw new Error(`Elegí un plan con --plan: ${CONTENT_PLANS.map((p) => p.id).join(", ")}`);
  if (TOKEN.length < 32 && !flag("dry-run")) throw new Error("Falta CONTENT_API_TOKEN en .env (el mismo valor que en Netlify).");

  // Every file must be there before anything is sent.
  for (const item of plan.items) {
    for (const f of FILES[item.title] ?? []) if (!existsSync(path.join(ROOT, f))) throw new Error(`No encuentro ${f} en ${ROOT}`);
    if (!FILES[item.title]) throw new Error(`Sin archivos definidos para «${item.title}»`);
  }
  console.log(`${plan.label} → ${BASE}${flag("dry-run") ? " (prueba: no se envía nada)" : ""}\n`);

  const now = Date.now();
  const existing = flag("dry-run") ? { posts: [] } : await api("GET", "/posts?brand=beauty");
  const byTitle = new Map((existing.posts as { id: string; title: string; media: number; status: string }[]).map((p) => [p.title, p]));

  for (const item of plan.items) {
    const at = item.date ? wallTimeToUtc(item.date, item.time, TZ) : null;
    const files = FILES[item.title].map((f) => path.join(ROOT, f));
    const size = files.reduce((n, f) => n + statSync(f).size, 0);
    const label = `${item.date ?? "sin fecha"} · ${item.title}`;
    if (flag("dry-run")) {
      console.log(`· ${label}: ${files.length} archivo(s), ${(size / 1024 / 1024).toFixed(1)} MB`);
      continue;
    }
    const known = byTitle.get(item.title);
    if (known && (known.status === "PUBLISHED" || known.status === "PUBLISHING")) {
      console.log(`= ${label}: ya publicada, no se toca`);
      continue;
    }
    const { post } = (await api("POST", "/posts", {
      brand: "beauty",
      title: item.title,
      kind: item.kind,
      caption: item.caption,
      notes: item.notes,
      scheduledAt: at ? at.toISOString() : null,
    })) as { post: { id: string } };

    let uploaded = 0;
    if (!known?.media || flag("replace")) {
      if (known?.media) await api("POST", `/posts/${post.id}/clear-media`);
      for (const f of files) {
        await upload(post.id, f);
        uploaded++;
      }
    }
    let scheduled = "lista, sin programar";
    if (flag("schedule") && at && at.getTime() > now + 10 * 60_000) {
      await api("POST", `/posts/${post.id}/schedule`, {});
      scheduled = "programada";
    } else if (at && at.getTime() <= now + 10 * 60_000) {
      scheduled = "la fecha ya pasó: elegí otra en la consola";
    }
    console.log(`✓ ${label}: ${uploaded ? `${uploaded} archivo(s) subidos` : "archivos ya estaban"} · ${scheduled}`);
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
