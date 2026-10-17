// Renders every story in stories.html to a 1080×1920 PNG.
// Usage: node marketing/instagram/historias/export.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2000 } });
await page.goto(pathToFileURL(path.join(dir, "stories.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const ids = await page.evaluate(() => window.STORY_IDS);
for (const id of ids) {
  await page.locator(`#${id}`).screenshot({ path: path.join(dir, `${id}.png`) });
}
console.log(`${ids.length} historias`);
await browser.close();
