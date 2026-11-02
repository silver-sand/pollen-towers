/**
 * Deterministic height-encoding skyline.
 * Each letter becomes one building; building height = letterIndex * step.
 * Space = a wide gap with no building. The result reads as an ordinary
 * dusk cityscape, the family the paper found in 33 of 50 model images.
 */

import { charToIndex } from "./lattice.js";

export const DEFAULTS = {
  step: 6, // px per alphabet position (A=6 … 9=216). Kept small enough that
           // the tallest symbol (index 36) still clears the ground line.
  minRoofWidth: 20,
  maxRoofWidth: 34,
  gap: 12, // px between buildings (letter boundary)
  wordGap: 34, // px of empty ground where a space falls
  ground: 26, // px tall ground strip
  sky: 260, // canvas height
};

const TONES = ["#2b313d", "#332a22", "#232b38", "#3a2b34"];

/** Keep only A–Z and spaces; report what was dropped. */
export function normaliseSecret(secret) {
  let dropped = 0;
  let out = "";
  for (const ch of String(secret).toUpperCase()) {
    if (ch === " ") out += " ";
    else if (charToIndex(ch) !== null) out += ch;
    else dropped++;
  }
  out = out.replace(/\s+/g, " ").trim();
  return { text: out, dropped };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Encode `secret` as building heights. Decoration (widths, windows, birds,
 * clouds) is seeded from the text so output is stable, and deliberately
 * carries no signal — it exists to be ignored by the decoder.
 */
export function encodeSkylineSvg(secret, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const { text } = normaliseSecret(secret);
  if (!text) throw new Error("secret has no encodable characters");

  let seed = 2166136261;
  for (const ch of text) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rng = mulberry32(seed);

  const plan = [];
  let x = 28;
  for (const ch of text) {
    if (ch === " ") {
      x += cfg.wordGap;
      continue;
    }
    const height = charToIndex(ch) * cfg.step;
    const w = Math.round(cfg.minRoofWidth + rng() * (cfg.maxRoofWidth - cfg.minRoofWidth));
    plan.push({ x, w, height });
    x += w + cfg.gap;
  }
  const width = x + 28;
  const groundY = cfg.sky - cfg.ground;

  const p = [];
  p.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${cfg.sky}" viewBox="0 0 ${width} ${cfg.sky}">`
  );
  p.push(`<defs><linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">`);
  p.push(`<stop offset="0" stop-color="#f6d8ae"/><stop offset="1" stop-color="#c9a8c4"/>`);
  p.push(`</linearGradient></defs>`);
  p.push(`<rect width="${width}" height="${cfg.sky}" fill="url(#dusk)"/>`);

  // Sun and clouds: light marks above the skyline. The decoder only follows
  // dark columns rooted at the ground, so these are free decoys.
  p.push(`<circle cx="${(width * 0.82).toFixed(0)}" cy="${(cfg.sky * 0.18).toFixed(0)}" r="16" fill="#fff4d6"/>`);
  for (let i = 0; i < 5; i++) {
    const cx = (rng() * width).toFixed(1);
    const cy = (10 + rng() * (groundY - 90)).toFixed(1);
    const rx = (10 + rng() * 22).toFixed(1);
    p.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${(Number(rx) * 0.35).toFixed(1)}" fill="#fff" opacity="${(0.25 + rng() * 0.3).toFixed(2)}"/>`);
  }

  for (const b of plan) {
    const y = groundY - b.height;
    p.push(`<rect x="${b.x}" y="${y}" width="${b.w}" height="${b.height}" fill="${TONES[Math.floor(rng() * TONES.length)]}"/>`);
    // Lit windows. Bright specks inside a dark body — the decoder tolerates
    // short bright runs, so these cost nothing and add realism.
    const rows = Math.max(1, Math.floor(b.height / 16));
    const cols = Math.max(1, Math.floor(b.w / 9));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng() > 0.32) continue;
        const wx = b.x + 3 + c * 9;
        const wy = y + 4 + r * 16;
        if (wx + 4 > b.x + b.w || wy + 6 > groundY - 2) continue;
        p.push(`<rect x="${wx}" y="${wy}" width="4" height="6" fill="#f5c451" opacity="0.9"/>`);
      }
    }
    // Roof fittings are deliberately omitted: anything drawn above the roof
    // extends the dark silhouette and corrupts the measured building height.
    // Windows are bright specks and are tolerated by the decoder.
  }

  p.push(`<rect x="0" y="${groundY}" width="${width}" height="${cfg.ground}" fill="#1d1712"/>`);
  p.push("</svg>");
  return { svg: p.join(""), text, width, height: cfg.sky, groundY, plan };
}
