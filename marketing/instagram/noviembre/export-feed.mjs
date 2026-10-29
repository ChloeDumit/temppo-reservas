// Renders each November feed slide in feed.html to a 1080×1350 PNG for Instagram.
// Usage: node marketing/instagram/noviembre/export-feed.mjs ["Nombre de la marca"]
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const brand = process.argv[2];
const url = pathToFileURL(path.join(dir, "feed.html")).href + (brand ? `?brand=${encodeURIComponent(brand)}` : "");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1500 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

const ids = await page.$$eval("section.post", (els) => els.map((el) => el.id));
for (const id of ids) {
  const out = path.join(dir, `${id}.png`);
  await page.locator(`#${id}`).screenshot({ path: out });
  console.log(out);
}
await browser.close();
