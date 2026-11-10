/**
 * Pushes a content plan to the console in production: creates or updates each
 * post with its date and caption, uploads its files in order, and schedules
 * the ones whose time is still ahead. Safe to run twice: posts are matched by
 * title, files are only uploaded to posts that have none (unless --replace),
 * and published posts are never touched.
 *
 *   npx tsx scripts/content-push.ts --plan noviembre-2 [--schedule] [--replace] [--dry-run]
 *     [--only "<título>"]   just that post
 *     [--reset]             first free a post stuck «publicando» or failed
 *     [--now]               schedule it for a few minutes from now instead of its date
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
/*
  Each brand keeps its files somewhere else: the beauty plans under marketing/,
  the Reservas ones under demo/, beside the stills the app's own capture wrote.
  Resolved once the plan is known, so neither has to pass --root by hand.
*/
const ROOTS: Record<string, string> = { beauty: "marketing", temppo: "demo" };
const TOKEN = process.env.CONTENT_API_TOKEN ?? "";
const TZ = "America/Montevideo";
const PART = 4 * 1024 * 1024;

/**
 * Which files go with each post, by brand and then by title, in order.
 *
 * Keyed by brand because the two products name posts alike — each plan has a
 * «Mientras dormís» and a «La seña» — and one flat map let the Reservas files
 * quietly take the beauty ones' place.
 */
const FILES: Record<string, Record<string, string[]>> = {
  beauty: {
    "Reel · Le llega solo por WhatsApp": ["video/out/temppo-beauty-whatsapp-musica.mp4"],
    "Carrusel · Lo que recibe tu clienta": [1, 2, 3, 4, 5].map((i) => `instagram/noviembre/carrusel-recibe-${i}.png`),
    "Reel · ¿Tenés lugar?": ["video/out/temppo-beauty-tenes-lugar-musica.mp4"],
    "Reel · Mientras dormís": ["video/out/temppo-beauty-mientras-dormis-musica.mp4"],
    "Post · El recordatorio sale solo": ["instagram/noviembre/post-recordatorio.png"],
    "Reel · Un día con mi agenda": ["video/out/temppo-beauty-un-dia-musica.mp4"],
    "Carrusel · 3 cosas que tu agenda hace sola": [1, 2, 3, 4].map((i) => `instagram/noviembre/carrusel-sola-${i}.png`),
    "Reel · La seña": ["video/out/temppo-beauty-sena-musica.mp4"],
    // Up by hand with a voice-over or an in-app audio: the version without music.
    "Reel · POV: te cancelan 10 minutos antes": ["video/out/temppo-beauty-pov-cancela.mp4"],
    "Carrusel · 4 mensajes para copiar y pegar": [1, 2, 3, 4, 5, 6].map((i) => `instagram/noviembre-2/carrusel-mensajes-${i}.png`),
    "Reel · Antes / después": ["video/out/temppo-beauty-antes-despues.mp4"],
    "Carrusel · ¿Cuánto te cuesta una clienta que no viene?": [1, 2, 3, 4, 5].map((i) => `instagram/noviembre-2/carrusel-cuenta-${i}.png`),
    "Reel · La seña, explicada en 15 segundos": ["video/out/temppo-beauty-sena-15-musica.mp4"],
    "Post · Diciembre se acerca": ["instagram/noviembre-2/post-diciembre.png"],
  },

  temppo: {
    /*
      TEMPPO Reservas, under demo/. The screens come from the app's own capture
      (`npm run padel:video`, `npm run demo:video`), the dark cards from
      `npm run temppo:cards`, and the reels from `npm run reel:*`. An empty list
      is allowed on purpose: a post whose cut does not exist yet is created
      without files and shows as «sin archivos», rather than the script
      inventing something to upload.
    */
    "Reel · ¿Cuántas canchas perdés por semana?": ["temppo-canchas.mp4"],
    "Carrusel · Lo que ve tu cliente al reservar": [
      "padel-stills/01-what.png",
      "padel-stills/02-duration.png",
      "padel-stills/03-day.png",
      "padel-stills/04-time.png",
      "padel-stills/05-confirm.png",
    ],
    "Post · El cupo fijo, sin planilla": ["stills/03-standing-spots.png"],
    "Reel · Mientras dormís": ["temppo-mientras-dormis.mp4"],
    "Post · Se liberó un lugar y se llenó solo": ["stills/09-student-book.png"],
    "Story · ¿Cuántas veces por día respondés 'hay lugar'?": ["temppo-cards/story-hay-lugar.png"],
    "Carrusel · Cuánto sale": [0, 1, 2, 3, 4].map((i) => `temppo-cards/precios-${i}.png`),
    "Post · Tu noche, cancha por cancha": ["padel-stills/10-agenda-evening.png"],
    "Reel · La seña": ["temppo-sena.mp4"],
    "Post · Elegís tu rubro al crear la cuenta": ["temppo-cards/rubros.png"],
    "Carrusel · Lo que deja de ser tarea tuya": [0, 1, 2, 3, 4, 5, 6].map((i) => `temppo-cards/tareas-${i}.png`),
    "Reel · De Instagram a tu agenda": ["temppo-de-instagram.mp4"],
  },
};

/** The files for one post, or undefined when the plan never named any. */
function files(brand: string, title: string) {
  return FILES[brand]?.[title];
}

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
  const ROOT = path.resolve(option("root") ?? ROOTS[plan.brand] ?? "marketing");

  const only = option("only");
  const items = only ? plan.items.filter((i) => i.title === only) : plan.items;
  if (!items.length) throw new Error(`No hay ninguna publicación «${only}» en ${plan.id}`);

  // Every file must be there before anything is sent.
  for (const item of items) {
    if (!files(plan.brand, item.title)) throw new Error(`Sin archivos definidos para «${item.title}»`);
    for (const f of files(plan.brand, item.title)!) if (!existsSync(path.join(ROOT, f))) throw new Error(`No encuentro ${f} en ${ROOT}`);
  }
  console.log(`${plan.label} → ${BASE}${flag("dry-run") ? " (prueba: no se envía nada)" : ""}\n`);

  const now = Date.now();
  const existing = flag("dry-run") ? { posts: [] } : await api("GET", `/posts?brand=${plan.brand}`);
  const byTitle = new Map((existing.posts as { id: string; title: string; media: number; status: string }[]).map((p) => [p.title, p]));

  for (const item of items) {
    const at = flag("now") ? new Date(now + 7 * 60_000) : item.date ? wallTimeToUtc(item.date, item.time, TZ) : null;
    const chosen = files(plan.brand, item.title)!.map((f) => path.join(ROOT, f));
    const size = chosen.reduce((n, f) => n + statSync(f).size, 0);
    const label = `${item.date ?? "sin fecha"} · ${item.title}`;
    if (flag("dry-run")) {
      console.log(`· ${label}: ${chosen.length} archivo(s), ${(size / 1024 / 1024).toFixed(1)} MB`);
      continue;
    }
    const known = byTitle.get(item.title);
    if (known && flag("reset") && (known.status === "PUBLISHING" || known.status === "FAILED")) {
      const reset = (await api("POST", `/posts/${known.id}/reset`)) as { status: string; permalink?: string };
      if (reset.status === "PUBLISHED") {
        console.log(`= ${label}: ya estaba en Instagram (${reset.permalink ?? "sin link"}), quedó como publicada`);
        continue;
      }
      known.status = "READY";
      console.log(`↺ ${label}: destrabada, vuelve a «Lista»`);
    }
    if (known && (known.status === "PUBLISHED" || known.status === "PUBLISHING")) {
      console.log(`= ${label}: ya publicada, no se toca`);
      continue;
    }
    const { post } = (await api("POST", "/posts", {
      brand: plan.brand,
      title: item.title,
      kind: item.kind,
      caption: item.caption,
      notes: item.notes,
      ...(item.channel ? { channel: item.channel } : {}),
      scheduledAt: at ? at.toISOString() : null,
    })) as { post: { id: string } };

    let uploaded = 0;
    if (chosen.length === 0) {
      console.log(`· ${label}: creada sin archivos (falta el corte o la placa)`);
      continue;
    }
    if (!known?.media || flag("replace")) {
      if (known?.media) await api("POST", `/posts/${post.id}/clear-media`);
      for (const f of chosen) {
        await upload(post.id, f);
        uploaded++;
      }
    }
    let scheduled = "lista, sin programar";
    if (flag("schedule") && at && at.getTime() > now + (flag("now") ? 5 : 10) * 60_000) {
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
