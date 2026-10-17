/**
 * Rasterises the mascots into the PWA icon sets: TEMPPO's at the root of
 * public/, Temppo Beauty's under public/beauty/.
 * Run after changing either mark: npm run icons
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

import { mkdirSync } from "node:fs";

const MASCOT = `
  <g transform="translate(-9,-4)">
    <path d="M170 62 A34 34 0 1 1 174 114" fill="none" stroke="#D2694A" stroke-width="15" stroke-linecap="round"/>
    <circle cx="110" cy="112" r="88" fill="#DD7C63"/>
    <path d="M35 158 Q110 136 185 158 A88 88 0 0 1 35 158 Z" fill="#C75F43"/>
    <ellipse cx="78" cy="192" rx="26" ry="14" fill="#DD7C63"/>
    <ellipse cx="146" cy="192" rx="26" ry="14" fill="#DD7C63"/>
    <circle cx="74" cy="104" r="10" fill="#CE6349" opacity="0.55"/>
    <ellipse cx="130" cy="86" rx="29" ry="32" fill="#FFFFFF"/>
    <circle cx="134" cy="90" r="18" fill="#4E2317"/>
    <circle cx="141" cy="81" r="6" fill="#FFFFFF"/>
    <path d="M78 120 Q104 142 130 124" fill="none" stroke="#4E2317" stroke-width="9" stroke-linecap="round"/>
    <g transform="rotate(-7 168 176)">
      <rect x="128" y="139" width="88" height="84" rx="13" fill="#A64A2C" opacity="0.22"/>
      <rect x="146" y="126" width="8" height="14" rx="4" fill="#B0512F"/>
      <rect x="182" y="126" width="8" height="14" rx="4" fill="#B0512F"/>
      <rect x="124" y="134" width="88" height="84" rx="13" fill="#C75F43"/>
      <path d="M124 154 h88 v51 a13 13 0 0 1 -13 13 h-62 a13 13 0 0 1 -13 -13 z" fill="#FFF8F5"/>
      <text x="168" y="201" text-anchor="middle" font-family="Trebuchet MS, Verdana, sans-serif" font-size="44" font-weight="800" fill="#4E2317">17</text>
    </g>
  </g>
`;

/*
  Temppo Beauty: the same character in the beauty palette, with lashes,
  eyeliner and painted toenails, holding TEMPPO's calendar. Keep in step with
  BeautyMascot in src/components/brand.tsx.
*/
const BEAUTY_MASCOT = `
  <g transform="translate(-9,-4)">
    <path d="M170 62 A34 34 0 1 1 174 114" fill="none" stroke="#C76A86" stroke-width="15" stroke-linecap="round"/>
    <circle cx="110" cy="112" r="88" fill="#DE8BA3"/>
    <path d="M35 158 Q110 136 185 158 A88 88 0 0 1 35 158 Z" fill="#C46A86"/>
    <ellipse cx="78" cy="192" rx="26" ry="14" fill="#DE8BA3"/>
    <ellipse cx="146" cy="192" rx="26" ry="14" fill="#DE8BA3"/>
    <g fill="#9E2F52">
      <ellipse cx="66" cy="197" rx="5" ry="4"/><ellipse cx="78" cy="199" rx="5.5" ry="4.2"/><ellipse cx="90" cy="197" rx="5" ry="4"/>
      <ellipse cx="134" cy="197" rx="5" ry="4"/><ellipse cx="146" cy="199" rx="5.5" ry="4.2"/><ellipse cx="158" cy="197" rx="5" ry="4"/>
    </g>
    <circle cx="74" cy="104" r="11" fill="#E8657F" opacity="0.45"/>
    <g stroke="#3B1622" stroke-width="6.5" stroke-linecap="round" fill="none">
      <path d="M108 66 Q101 58 97 50"/><path d="M121 57 Q118 47 117 38"/><path d="M137 55 Q139 45 142 37"/><path d="M151 62 Q158 54 164 48"/>
    </g>
    <ellipse cx="130" cy="86" rx="29" ry="32" fill="#FFFFFF"/>
    <path d="M101 80 Q130 50 159 80" fill="none" stroke="#3B1622" stroke-width="5" stroke-linecap="round"/>
    <circle cx="134" cy="91" r="18" fill="#3B1622"/>
    <circle cx="141" cy="82" r="6" fill="#FFFFFF"/>
    <path d="M78 120 Q104 142 130 124" fill="none" stroke="#3B1622" stroke-width="9" stroke-linecap="round"/>
    <g transform="rotate(-7 168 176)">
      <rect x="128" y="139" width="88" height="84" rx="13" fill="#3B1622" opacity="0.2"/>
      <rect x="146" y="126" width="8" height="14" rx="4" fill="#3B1622"/>
      <rect x="182" y="126" width="8" height="14" rx="4" fill="#3B1622"/>
      <rect x="124" y="134" width="88" height="84" rx="13" fill="#B5536F"/>
      <path d="M124 154 h88 v51 a13 13 0 0 1 -13 13 h-62 a13 13 0 0 1 -13 -13 z" fill="#FFF8FA"/>
      <text x="168" y="201" text-anchor="middle" font-family="Trebuchet MS, Verdana, sans-serif" font-size="44" font-weight="800" fill="#3B1622">17</text>
    </g>
  </g>
`;

/**
 * `pad` insets the mark. Maskable icons get a wide margin because Android
 * crops them to whatever shape the launcher uses.
 */
const BOX = 240;

function svg({ bg, pad = 0, mark = MASCOT }) {
  const scale = (100 - pad * 2) / 100;
  // `pad` stays a percentage so the targets below read the same as before.
  const offset = (BOX * pad) / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX}" height="${BOX}" viewBox="0 0 ${BOX} ${BOX}">
    <rect width="${BOX}" height="${BOX}" fill="${bg}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${mark}</g>
  </svg>`;
}

const BLUSH = "#F7ECEF";

const targets = [
  { file: "public/icon-192.png", size: 192, bg: "#FAE5DD", pad: 8 },
  { file: "public/icon-512.png", size: 512, bg: "#FAE5DD", pad: 8 },
  // Safe zone: Android may crop up to 20% from each edge.
  { file: "public/icon-maskable.png", size: 512, bg: "#FAE5DD", pad: 20 },
  { file: "public/apple-icon.png", size: 180, bg: "#FAE5DD", pad: 8 },
  { file: "public/beauty/icon-192.png", size: 192, bg: BLUSH, pad: 8, mark: BEAUTY_MASCOT },
  { file: "public/beauty/icon-512.png", size: 512, bg: BLUSH, pad: 8, mark: BEAUTY_MASCOT },
  { file: "public/beauty/icon-maskable.png", size: 512, bg: BLUSH, pad: 20, mark: BEAUTY_MASCOT },
  { file: "public/beauty/apple-icon.png", size: 180, bg: BLUSH, pad: 8, mark: BEAUTY_MASCOT },
];

mkdirSync("public/beauty", { recursive: true });

for (const { file, size, bg, pad, mark } of targets) {
  const png = await sharp(Buffer.from(svg({ bg, pad, mark })))
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(file, png);
  console.log(`${file}  ${size}×${size}`);
}

// A crisp favicon for browser tabs.
writeFileSync(
  "public/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">${MASCOT}</svg>`,
);
console.log("public/favicon.svg");

writeFileSync(
  "public/beauty/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">${BEAUTY_MASCOT}</svg>`,
);
console.log("public/beauty/favicon.svg");
