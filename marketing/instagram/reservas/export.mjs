// Renders each piece in feed.html to a PNG for Instagram (TEMPPO Reservas).
// Usage, from the repo root: node marketing/instagram/reservas/export.mjs
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(dir, "feed.html")).href;

const ids = [
  "post-whatsapp",
  "carrusel-lista-1",
  "carrusel-lista-2",
  "carrusel-lista-3",
  "carrusel-lista-4",
  "carrusel-lista-5",
  "post-recuperaciones",
  "intro-hola",
  "intro-que-hace",
  "intro-para-quien",
  "perfil-temppo-reservas",
  "perfil-temppo-uy",
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() =>
  Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r))))),
);

for (const id of ids) {
  const out = path.join(dir, `${id}.png`);
  await page.locator(`#${id}`).screenshot({ path: out });
  console.log(out);
}
await browser.close();
