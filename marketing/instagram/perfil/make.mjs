// Instagram profile picture and highlight covers for Temppo Beauty.
// Usage: node marketing/instagram/perfil/make.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const mascotSvg = readFileSync(path.join(dir, "../../mascot/mascota-b-calendario.svg"), "utf8");
// The drawing inside the mascot file, without its outer <svg>.
const mascot = mascotSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

/*
  Instagram shows the profile picture as a small circle, so the mascot sits
  well inside it: about 64% of the width, nudged left because the calendar it
  holds makes the drawing heavier on the right.
*/
const S = 1080;
const profile = (bg, ring) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${bg}"/>
  ${ring ? `<circle cx="${S / 2}" cy="${S / 2}" r="${S * 0.44}" fill="${ring}"/>` : ""}
  <g transform="translate(${S * 0.19} ${S * 0.17}) scale(${(S * 0.68) / 240})">${mascot}</g>
</svg>`;

await sharp(Buffer.from(profile("#F7ECEF"))).png().toFile(path.join(dir, "foto-perfil.png"));
await sharp(Buffer.from(profile("#B5536F", "#F7ECEF"))).png().toFile(path.join(dir, "foto-perfil-alternativa.png"));

// How it looks where people actually see it: a small circle.
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360" viewBox="0 0 900 360">
  <rect width="900" height="360" fill="#ffffff"/>
  <defs><clipPath id="c1"><circle cx="160" cy="180" r="110"/></clipPath><clipPath id="c2"><circle cx="420" cy="180" r="56"/></clipPath><clipPath id="c3"><circle cx="560" cy="180" r="22"/></clipPath></defs>
  <g clip-path="url(#c1)"><g transform="translate(50 70) scale(${220 / S})">${profile("#F7ECEF").replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g></g>
  <g clip-path="url(#c2)"><g transform="translate(364 124) scale(${112 / S})">${profile("#F7ECEF").replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g></g>
  <g clip-path="url(#c3)"><g transform="translate(538 158) scale(${44 / S})">${profile("#F7ECEF").replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g></g>
  <text x="640" y="172" font-family="Helvetica, Arial" font-size="26" font-weight="700" fill="#262626">temppobeauty</text>
  <text x="640" y="206" font-family="Helvetica, Arial" font-size="22" fill="#8e8e8e">Temppo Beauty</text>
</svg>`;
await sharp(Buffer.from(preview)).png().toFile(path.join(dir, "vista-previa.png"));

// Highlight covers: story-sized, the icon centred where the circle crops.
const ICONS = {
  "como-funciona": "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3",
  senas: "M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7a2 2 0 0 1 2-2h11M17 13h.01",
  "te-toca-volver": "M4 9V7a3 3 0 0 1 3-3h10l-3-3m3 11v2a3 3 0 0 1-3 3H4l3 3",
  preguntas: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
};
for (const [name, d] of Object.entries(ICONS)) {
  const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <rect width="1080" height="1920" fill="#B5536F"/>
    <circle cx="540" cy="960" r="300" fill="#F7ECEF"/>
    <g transform="translate(372 792) scale(14)"><path d="${d}" fill="none" stroke="#B5536F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>
  </svg>`;
  await sharp(Buffer.from(cover)).png().toFile(path.join(dir, `destacada-${name}.png`));
}
console.log("ok");
