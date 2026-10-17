// Temppo Beauty mascot: the TEMPPO character in the beauty palette, with
// lashes and painted nails. Two props to choose from. Renders previews.
// Usage: node marketing/mascot/mascots.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const C = {
  tail: "#C76A86",
  body: "#DE8BA3",
  shade: "#C46A86",
  blush: "#E8657F",
  ink: "#3B1622",
  nails: "#9E2F52",
  plum: "#3B1622",
  rose: "#B5536F",
  paper: "#FFF8FA",
};

// The shared character: TEMPPO's silhouette, recoloured, with lashes and nails.
const character = `
  <path d="M170 62 A34 34 0 1 1 174 114" fill="none" stroke="${C.tail}" stroke-width="15" stroke-linecap="round"/>
  <circle cx="110" cy="112" r="88" fill="${C.body}"/>
  <path d="M35 158 Q110 136 185 158 A88 88 0 0 1 35 158 Z" fill="${C.shade}"/>
  <ellipse cx="78" cy="192" rx="26" ry="14" fill="${C.body}"/>
  <ellipse cx="146" cy="192" rx="26" ry="14" fill="${C.body}"/>
  <!-- painted toenails -->
  <g fill="${C.nails}">
    <ellipse cx="66" cy="197" rx="5" ry="4"/><ellipse cx="78" cy="199" rx="5.5" ry="4.2"/><ellipse cx="90" cy="197" rx="5" ry="4"/>
    <ellipse cx="134" cy="197" rx="5" ry="4"/><ellipse cx="146" cy="199" rx="5.5" ry="4.2"/><ellipse cx="158" cy="197" rx="5" ry="4"/>
  </g>
  <g fill="#FFFFFF" opacity=".55">
    <circle cx="64.5" cy="195.6" r="1.4"/><circle cx="76.5" cy="197.4" r="1.5"/><circle cx="88.5" cy="195.6" r="1.4"/>
    <circle cx="132.5" cy="195.6" r="1.4"/><circle cx="144.5" cy="197.4" r="1.5"/><circle cx="156.5" cy="195.6" r="1.4"/>
  </g>
  <circle cx="74" cy="104" r="11" fill="${C.blush}" opacity="0.45"/>
  <!-- eye with lashes -->
  <g stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round" fill="none">
    <path d="M108 66 Q101 58 97 50"/>
    <path d="M121 57 Q118 47 117 38"/>
    <path d="M137 55 Q139 45 142 37"/>
    <path d="M151 62 Q158 54 164 48"/>
  </g>
  <ellipse cx="130" cy="86" rx="29" ry="32" fill="#FFFFFF"/>
  <path d="M101 80 Q130 50 159 80" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="134" cy="91" r="18" fill="${C.ink}"/>
  <circle cx="141" cy="82" r="6" fill="#FFFFFF"/>
  <circle cx="128" cy="99" r="2.5" fill="#FFFFFF" opacity=".8"/>
  <path d="M78 120 Q104 142 130 124" fill="none" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/>
`;

// A: a bottle of nail polish.
const polish = `
  <g transform="translate(4 8) rotate(-9 168 176)">
    <ellipse cx="172" cy="226" rx="40" ry="6" fill="${C.plum}" opacity=".18"/>
    <rect x="153" y="104" width="30" height="40" rx="7" fill="${C.plum}"/>
    <rect x="158" y="108" width="6" height="30" rx="3" fill="#FFFFFF" opacity=".25"/>
    <rect x="149" y="140" width="38" height="10" rx="4" fill="${C.plum}"/>
    <rect x="126" y="146" width="84" height="78" rx="24" fill="${C.rose}"/>
    <rect x="126" y="146" width="84" height="78" rx="24" fill="url(#glass)"/>
    <path d="M139 160 Q137 190 145 210" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" opacity=".45" fill="none"/>
    <path d="M168 176 c-6 -8 -18 -3 -14 7 c3 7 14 13 14 13 c0 0 11 -6 14 -13 c4 -10 -8 -15 -14 -7z" fill="${C.paper}" opacity=".9"/>
  </g>
`;

// B: TEMPPO's calendar, in the beauty palette.
const calendar = `
  <g transform="rotate(-7 168 176)">
    <rect x="128" y="139" width="88" height="84" rx="13" fill="${C.plum}" opacity="0.2"/>
    <rect x="146" y="126" width="8" height="14" rx="4" fill="${C.plum}"/>
    <rect x="182" y="126" width="8" height="14" rx="4" fill="${C.plum}"/>
    <rect x="124" y="134" width="88" height="84" rx="13" fill="${C.rose}"/>
    <path d="M124 154 h88 v51 a13 13 0 0 1 -13 13 h-62 a13 13 0 0 1 -13 -13 z" fill="${C.paper}"/>
    <text x="168" y="201" text-anchor="middle" font-family="Trebuchet MS, Verdana, sans-serif" font-size="44" font-weight="800" fill="${C.ink}">17</text>
  </g>
`;

const defs = `<defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/><stop offset=".55" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#3B1622" stop-opacity=".18"/></linearGradient></defs>`;

export const mascot = (prop) => `<g transform="translate(-9,-4)">${character}${prop}</g>`;
const single = (prop, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">${defs}${bg ? `<rect width="240" height="240" fill="${bg}"/>` : ""}${mascot(prop)}</svg>`;

for (const [name, prop] of [["a-esmalte", polish], ["b-calendario", calendar]]) {
  const svg = single(prop);
  writeFileSync(path.join(dir, `mascota-${name}.svg`), svg);
  await sharp(Buffer.from(single(prop, "#F7ECEF"))).resize(800, 800).png().toFile(path.join(dir, `mascota-${name}.png`));
}

// Side by side, with the small sizes it has to survive at (app icon, avatar).
const W = 1600, H = 1000;
const cell = (prop, x, label) => `
  <g transform="translate(${x} 120) scale(2.6)">${mascot(prop)}</g>
  <text x="${x + 312}" y="820" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="${C.ink}">${label}</text>
  <g transform="translate(${x + 220} 860) scale(.27)"><rect width="240" height="240" rx="54" fill="#F7ECEF"/>${mascot(prop)}</g>
  <g transform="translate(${x + 310} 872) scale(.17)"><rect width="240" height="240" rx="54" fill="#F7ECEF"/>${mascot(prop)}</g>
  <g transform="translate(${x + 370} 880) scale(.1)"><rect width="240" height="240" rx="54" fill="#F7ECEF"/>${mascot(prop)}</g>`;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}
  <rect width="${W}" height="${H}" fill="#FBF7F8"/>
  ${cell(polish, 120, "A · esmalte")}
  ${cell(calendar, 860, "B · calendario")}
</svg>`;
await sharp(Buffer.from(sheet)).png().toFile(path.join(dir, "mascotas-comparacion.png"));
console.log("ok");
