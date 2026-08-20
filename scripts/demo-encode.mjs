/**
 * Builds the finished demo video from the captured stills.
 *
 *   npm run demo:encode
 *
 * The stills are captured at 3× device scale (1170×2532), so downscaling them
 * to a 1080×1920 frame keeps everything crisp. Each shot gets a slow push-in
 * and the shots cross-fade, which reads as filmed rather than as a slideshow.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import sharp from "sharp";
import { join } from "node:path";

const OUT = "demo";
const STILLS = join(OUT, "stills");
const WORK = join(OUT, "work");
const W = 1080;
const H = 1920;
const FPS = 30;

if (!existsSync(STILLS)) {
  console.error("No stills found. Run `npm run demo:video` first.");
  process.exit(1);
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(join(OUT, "cards"), { recursive: true });

const MASCOT = `
  <ellipse cx="50" cy="90" rx="22" ry="5" fill="#C85C35" opacity="0.3"/>
  <circle cx="50" cy="50" r="36" fill="#E07A5F"/>
  <path d="M22 60 Q50 85 78 60 Q75 78 50 82 Q25 78 22 60Z" fill="#C85C35"/>
  <ellipse cx="37" cy="84" rx="8" ry="5" fill="#E07A5F"/>
  <ellipse cx="63" cy="84" rx="8" ry="5" fill="#E07A5F"/>
  <circle cx="55" cy="42" r="12" fill="#FFFFFF"/>
  <circle cx="58" cy="43" r="6" fill="#3D2010"/>
  <circle cx="60" cy="40" r="2.5" fill="#FFFFFF"/>
  <path d="M40 58 Q50 66 60 58" stroke="#3D2010" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M80 50 Q90 42 88 32 Q86 24 78 28" stroke="#C85C35" stroke-width="5" stroke-linecap="round" fill="none"/>
  <circle cx="38" cy="56" r="4" fill="#C85C35" opacity="0.35"/>
`;

/** Opening and closing cards. Centred by anchor so no font metrics are needed. */
function card({ eyebrow, title, subtitle, cta }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#FAF7F4"/>
    <g transform="translate(${W / 2 - 110} 620) scale(2.2)">${MASCOT}</g>
    ${eyebrow ? `<text x="${W / 2}" y="960" text-anchor="middle" font-family="Helvetica,Arial" font-size="34" letter-spacing="8" fill="#8A827A">${eyebrow}</text>` : ""}
    <text x="${W / 2}" y="1070" text-anchor="middle" font-family="Helvetica,Arial" font-size="90" font-weight="bold" fill="#1C1917">${title}</text>
    ${subtitle ? `<text x="${W / 2}" y="1150" text-anchor="middle" font-family="Helvetica,Arial" font-size="42" fill="#57534E">${subtitle}</text>` : ""}
    ${cta ? `<rect x="${W / 2 - 290}" y="1270" width="580" height="112" rx="56" fill="#E07A5F"/>
       <text x="${W / 2}" y="1344" text-anchor="middle" font-family="Helvetica,Arial" font-size="46" font-weight="bold" fill="#FFFFFF">${cta}</text>` : ""}
  </svg>`;
}

/**
 * The story. Each beat is one captured screen plus the line that explains it.
 * `hold` is seconds on screen, before the cross-fade into the next beat.
 */
const beats = [
  { still: "01-dashboard", caption: "Tu estudio, de un vistazo", hold: 3.4 },
  { still: "02-schedule", caption: "La agenda de la semana", hold: 3.4 },
  { still: "03-standing-spots", caption: "Cupos fijos, sin planillas", hold: 3.6 },
  { still: "04-standing-spots-open", caption: "Quién viene siempre, y qué queda libre", hold: 3.8 },
  { still: "05-checkin", caption: "Ingreso con código QR", hold: 3.2 },
  { still: "07-payments", caption: "Pagos y comprobantes al día", hold: 3.4 },
  { still: "08-student-classes", caption: "Tus alumnos, desde el celular", hold: 3.4 },
  { still: "09-student-book", caption: "Reservan solos. Y hay lista de espera", hold: 3.6 },
  { still: "10-student-buy", caption: "Compran packs sin que muevas un dedo", hold: 3.4 },
];

const FADE = 0.6;

/** Caption pill, drawn as an image because this ffmpeg has no drawtext. */
async function captionPng(text, index) {
  const file = join(WORK, `cap-${index}.png`);
  const fontSize = 50;
  // Approximate advance width; only sizes the pill, text centres on its own.
  const boxW = Math.min(W - 60, text.length * fontSize * 0.54 + 96);
  const boxH = 108;

  await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${boxH}">
      <rect x="${(W - boxW) / 2}" y="0" width="${boxW}" height="${boxH}" rx="${boxH / 2}"
        fill="#1C1917" fill-opacity="0.88"/>
      <text x="${W / 2}" y="${boxH / 2 + 17}" text-anchor="middle" font-family="Helvetica,Arial"
        font-size="${fontSize}" font-weight="bold" fill="#FFFFFF">${text}</text>
    </svg>`),
  )
    .png()
    .toFile(file);

  return file;
}

console.log("Preparing frames…");

const intro = join(OUT, "cards", "intro.png");
const outro = join(OUT, "cards", "outro.png");

await sharp(Buffer.from(card({
  eyebrow: "TEMPPO",
  title: "Reservas",
  subtitle: "Gestión para estudios de pilates y yoga",
}))).png().toFile(intro);

await sharp(Buffer.from(card({
  title: "Probalo gratis",
  subtitle: "Un mes sin costo. Sin tarjeta.",
  cta: "temppo.uy",
}))).png().toFile(outro);

/**
 * Renders one beat as its own clip: the screen on a brand-coloured field,
 * slowly pushed in, with the caption composited near the bottom.
 */
async function renderBeat(beat, i) {
  const src = join(STILLS, `${beat.still}.png`);
  if (!existsSync(src)) {
    console.warn(`  ! missing ${beat.still}, skipping`);
    return null;
  }

  const cap = await captionPng(beat.caption, i);
  const clip = join(WORK, `beat-${String(i).padStart(2, "0")}.mp4`);
  const frames = Math.round(beat.hold * FPS);

  // zoompan needs its own frame clock; 1.0 → 1.06 over the hold is a gentle push.
  const zoom = `zoompan=z='min(1.0+0.06*on/${frames},1.06)':d=${frames}:s=${W}x${H}:fps=${FPS}`;

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loop", "1", "-t", String(beat.hold), "-i", src,
      "-i", cap,
      "-filter_complex",
      [
        // Fit the tall screenshot inside the frame, padding with paper colour.
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xFAF7F4,setsar=1,${zoom}[bg]`,
        `[bg][1:v]overlay=x=0:y=H-268[v]`,
      ].join(";"),
      "-map", "[v]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-pix_fmt", "yuv420p",
      clip,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  return clip;
}

const clips = [];
for (const [i, beat] of beats.entries()) {
  const clip = await renderBeat(beat, i);
  if (clip) {
    clips.push({ path: clip, hold: beat.hold });
    console.log(`  · ${beat.still}`);
  }
}

if (clips.length === 0) {
  console.error("No clips rendered.");
  process.exit(1);
}

// Cards become clips too, so everything cross-fades uniformly.
function cardClip(src, seconds, name) {
  const clip = join(WORK, `${name}.mp4`);
  execFileSync(
    "ffmpeg",
    [
      "-y", "-loop", "1", "-t", String(seconds), "-i", src,
      "-vf", `scale=${W}:${H},setsar=1,fps=${FPS}`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-pix_fmt", "yuv420p", clip,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  return { path: clip, hold: seconds };
}

const timeline = [
  cardClip(intro, 2.6, "intro"),
  ...clips,
  cardClip(outro, 3.4, "outro"),
];

console.log("Encoding…");

/*
  Chain the cross-fades. Each xfade offset is the running length so far minus
  the fade, because a fade overlaps the two clips it joins.
*/
const inputs = timeline.flatMap((c) => ["-i", c.path]);
let filter = "";
let label = "0:v";
let elapsed = timeline[0].hold;

for (let i = 1; i < timeline.length; i++) {
  const next = `x${i}`;
  const offset = (elapsed - FADE).toFixed(3);
  filter += `[${label}][${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset}[${next}];`;
  label = next;
  elapsed += timeline[i].hold - FADE;
}

const master = join(OUT, "temppo-reservas-demo.mp4");

execFileSync(
  "ffmpeg",
  [
    "-y",
    ...inputs,
    "-filter_complex", filter.slice(0, -1),
    "-map", `[${label}]`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "20",
    "-pix_fmt", "yuv420p",
    // Lets a browser start playing before the whole file has arrived.
    "-movflags", "+faststart",
    master,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

// A lighter copy for embedding, and a poster frame for the <video> element.
execFileSync("ffmpeg", [
  "-y", "-i", master, "-vf", "scale=720:-2",
  "-c:v", "libx264", "-preset", "slow", "-crf", "26",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  join(OUT, "temppo-reservas-demo-web.mp4"),
], { stdio: ["ignore", "ignore", "pipe"] });

execFileSync("ffmpeg", [
  "-y", "-i", master, "-ss", "4.5", "-frames:v", "1",
  join(OUT, "temppo-reservas-poster.jpg"),
], { stdio: ["ignore", "ignore", "pipe"] });

console.log(`
  demo/temppo-reservas-demo.mp4       1080x1920, ~${elapsed.toFixed(0)}s
  demo/temppo-reservas-demo-web.mp4   720x1280, lighter for embedding
  demo/temppo-reservas-poster.jpg     poster frame
  demo/stills/*.png                   individual screens
`);
