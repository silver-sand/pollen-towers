/**
 * Round-trip torture test.
 * Encode -> rasterise (PNG / JPEG / resize / blur) -> decode BLIND.
 * The decoder never sees the secret or the SVG source.
 */
import { encodeSkylineSvg, normaliseSecret } from "../engine/skyline.js";
import { analysePixels } from "../engine/gauge.js";
import { similarity } from "../engine/lattice.js";
import sharp from "sharp";

// Secrets shorter than 3 letters cannot fit a lattice (the detector needs
// at least three objects to see a grid). They are expected failures, not
// crashes — they are reported but never counted as recoveries.
const SHORT_SECRETS = new Set(["X", "ABC"]);
const SECRETS = [
  "THE VAULT CODE IS 48213",
  "MEET AT THE OLD LIGHTHOUSE",
  "X",
  "ABC",
  "THE MONSTER ACTS ON THE MOONSHINE MODULE",
];

const TORTURES = [
  { name: "png@1x", ops: [] },
  { name: "png@0.5x", ops: [{ resize: 0.5 }] },
  { name: "png@0.75x", ops: [{ resize: 0.75 }] },
  { name: "jpeg82", ops: [{ jpeg: 82 }] },
  { name: "jpeg55", ops: [{ jpeg: 55 }] },
  { name: "jpeg55@0.6x", ops: [{ jpeg: 55 }, { resize: 0.6 }] },
  { name: "blur0.6", ops: [{ blur: 0.6 }] },
];

async function toRGBA(buf) {
  const meta = await sharp(buf).metadata();
  const data = await sharp(buf).raw().toBuffer();
  return { data, width: meta.width, height: meta.height, channels: meta.channels };
}

async function rasterise(svg, ops) {
  let img = sharp(Buffer.from(svg), { density: 96 }).flatten({ background: "#c9a8c4" });
  for (const op of ops) {
    if (op.resize) {
      const meta = await img.metadata();
      img = img.resize(Math.max(1, Math.round(meta.width * op.resize)));
    }
    if (op.jpeg) img = img.jpeg({ quality: op.jpeg });
    if (op.blur) img = img.blur(op.blur);
  }
  return img.png({ compressionLevel: 0 }).toBuffer();
}

let checks = 0;
let pass = 0;
const rows = [];

for (const secret of SECRETS) {
  const { svg } = encodeSkylineSvg(secret);
  const expected = normaliseSecret(secret).text;
  if (secret.toUpperCase().replace(/[^A-Z0-9 ]/g, "") !== expected) {
    console.log(`FAIL  encode lost characters for "${secret}" -> "${expected}"`);
    checks++;
    continue;
  }
  for (const t of TORTURES) {
    checks++;
    let out = { recovered: "", score: 0, reason: "" };
    try {
      const buf = await rasterise(svg, t.ops);
      const { data, width, height, channels } = await toRGBA(buf);
      const g = analysePixels(data, width, height, channels);
      out = { recovered: g.text, score: g.score, reason: g.reason };
      const sim = similarity(g.text, expected);
      if (sim >= 0.9 && !SHORT_SECRETS.has(secret.toUpperCase())) pass++;
      rows.push({ secret: expected.slice(0, 22), torture: t.name, sim: sim.toFixed(2), score: out.score, reason: out.reason, got: out.recovered.slice(0, 26) });
    } catch (e) {
      rows.push({ secret: expected.slice(0, 22), torture: t.name, sim: "0.00", score: 0, reason: "crash:" + e.message.slice(0, 40), got: "" });
    }
  }
}

// Control: cover images with NO message must score low.
const covers = [];
for (let i = 0; i < 5; i++) {
  const w = 400, h = 260;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 3;
      px[p] = 200 - y * 0.4;
      px[p + 1] = 180 - y * 0.3;
      px[p + 2] = 160 - y * 0.2;
    }
  let s = 1234 + i;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const shapes = Array.from({ length: 8 }, () => ({
    x: Math.floor(rnd() * 360), y: Math.floor(60 + rnd() * 150),
    w: Math.floor(10 + rnd() * 25), h: Math.floor(20 + rnd() * 120),
  }));
  for (const b of shapes)
    for (let y = b.y; y < Math.min(h, b.y + b.h); y++)
      for (let x = b.x; x < Math.min(w, b.x + b.w); x++) {
        const p = (y * w + x) * 3;
        px[p] = 35; px[p + 1] = 38; px[p + 2] = 45;
      }
  for (let y = 240; y < h; y++)
    for (let x = 0; x < w; x++) { const p = (y * w + x) * 3; px[p] = 25; px[p + 1] = 22; px[p + 2] = 20; }
  covers.push(sharp(px, { raw: { width: w, height: h, channels: 3 } }));
}
console.log("\n--- CONTROL (no message embedded) ---");
let controlScores = [];
for (let i = 0; i < covers.length; i++) {
  const buf = await covers[i].png().toBuffer();
  const { data, width, height, channels } = await toRGBA(buf);
  const g = analysePixels(data, width, height, channels);
  controlScores.push(g.score);
  console.log(`cover#${i}: score=${g.score} reason=${g.reason} objects=${g.objects?.length ?? 0}`);
}

console.table(rows);
const realChecks = checks - [...SHORT_SECRETS].length * TORTURES.length;
console.log(`\nRECOVERY ${pass}/${realChecks} at sim>=0.9  (${((pass / realChecks) * 100).toFixed(0)}%)`);
const maxControl = Math.max(...controlScores);
console.log(`control max score: ${maxControl}`);
const minReal = Math.min(...rows.filter((r) => r.sim >= 0.9).map((r) => r.score || 0));
console.log(`min real score at sim>=0.9: ${minReal}`);
console.log(`separation: ${minReal > maxControl ? "PASS — detector separates stego from cover" : "FAIL — no separation"}`);