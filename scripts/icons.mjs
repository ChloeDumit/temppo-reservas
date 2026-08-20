/**
 * Rasterises the TEMPPO mascot into the PWA icon set.
 * Run after changing the mark: npm run icons
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const MASCOT = `
  <ellipse cx="50" cy="90" rx="22" ry="5" fill="#C85C35" opacity="0.3"/>
  <circle cx="50" cy="50" r="36" fill="#E07A5F"/>
  <path d="M22 60 Q50 85 78 60 Q75 78 50 82 Q25 78 22 60Z" fill="#C85C35"/>
  <ellipse cx="37" cy="84" rx="8" ry="5" fill="#E07A5F"/>
  <ellipse cx="37" cy="84" rx="8" ry="5" fill="#C85C35" opacity="0.3"/>
  <ellipse cx="63" cy="84" rx="8" ry="5" fill="#E07A5F"/>
  <ellipse cx="63" cy="84" rx="8" ry="5" fill="#C85C35" opacity="0.3"/>
  <circle cx="55" cy="42" r="12" fill="#FFFFFF"/>
  <circle cx="58" cy="43" r="6" fill="#3D2010"/>
  <circle cx="60" cy="40" r="2.5" fill="#FFFFFF"/>
  <path d="M40 58 Q50 66 60 58" stroke="#3D2010" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M80 50 Q90 42 88 32 Q86 24 78 28" stroke="#C85C35" stroke-width="5" stroke-linecap="round" fill="none"/>
  <circle cx="38" cy="56" r="4" fill="#C85C35" opacity="0.35"/>
`;

/**
 * `pad` insets the mark. Maskable icons get a wide margin because Android
 * crops them to whatever shape the launcher uses.
 */
function svg({ bg, pad = 0 }) {
  const scale = (100 - pad * 2) / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${bg}"/>
    <g transform="translate(${pad} ${pad}) scale(${scale})">${MASCOT}</g>
  </svg>`;
}

const targets = [
  { file: "public/icon-192.png", size: 192, bg: "#FAF7F4", pad: 8 },
  { file: "public/icon-512.png", size: 512, bg: "#FAF7F4", pad: 8 },
  // Safe zone: Android may crop up to 20% from each edge.
  { file: "public/icon-maskable.png", size: 512, bg: "#FDF1EB", pad: 20 },
  { file: "public/apple-icon.png", size: 180, bg: "#FAF7F4", pad: 8 },
];

for (const { file, size, bg, pad } of targets) {
  const png = await sharp(Buffer.from(svg({ bg, pad })))
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(file, png);
  console.log(`${file}  ${size}×${size}`);
}

// A crisp favicon for browser tabs.
writeFileSync(
  "public/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${MASCOT}</svg>`,
);
console.log("public/favicon.svg");
