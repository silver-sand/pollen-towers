/**
 * Blind height-lattice detector — the Gauge.
 *
 * Works on RAW PIXELS ONLY. It is never given the secret, the SVG source,
 * or any hint about the encoding. This mirrors what the paper's decoder
 * faced: a rendered picture and nothing else.
 *
 * Pipeline
 *   1. luminance
 *   2. find the ground line (row with the most dark pixels)
 *   3. per column, measure the height of the dark run rooted at the ground
 *   4. group contiguous non-ground columns into objects (buildings)
 *   5. take each object's median column height
 *   6. fit a lattice (step) to those heights
 *   7. report snap rate + residual as the detection score
 */

import { fitLattice, heightsToText, MAX_INDEX } from "./lattice.js";

/**
 * @param {Uint8Array|Uint8ClampedArray} data RGB(A), row-major
 * @param {number} width
 * @param {number} height
 * @param {number} [channels] bytes per pixel in `data` (3 or 4). Defaults to 4.
 */
export function analysePixels(data, width, height, channels = 4) {
  if (!(width > 0) || !(height > 0)) {
    return { objects: [], score: 0, reason: "bad-dimensions", text: "" };
  }
  const stride = channels >= 3 ? channels : 4;
  if (data.length < width * height * stride) {
    return { objects: [], score: 0, reason: "buffer-too-small", text: "", need: width * height * stride, have: data.length };
  }
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < width * height; i++, p += stride) {
    lum[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  }

  let sum = 0;
  for (let i = 0; i < lum.length; i++) sum += lum[i];
  const mean = sum / lum.length;
  if (!Number.isFinite(mean)) {
    return { objects: [], score: 0, reason: "non-finite-luminance", text: "" };
  }
  // Objects are darker than the sky in a dusk scene. Use a threshold with
  // margin so mild JPEG ringing does not flip pixels.
  const thresh = mean * 0.72;

  const dark = new Uint8Array(width * height);
  for (let i = 0; i < lum.length; i++) dark[i] = lum[i] < thresh ? 1 : 0;

  // Ground detection: the ground is a solid dark band near the bottom.
  // We want the TOP EDGE of that band (where buildings stand), not its
  // bottom — using the bottom row makes every column run to the canvas top
  // and merges all buildings into one object.
  let groundRow = -1;
  let bestCoverage = 0;
  const searchFrom = Math.floor(height * 0.5);
  for (let y = searchFrom; y < height; y++) {
    let c = 0;
    for (let x = 0; x < width; x++) c += dark[y * width + x];
    const cov = c / width;
    if (cov >= bestCoverage) {
      bestCoverage = cov;
      groundRow = y;
    }
  }
  // Walk up to the first row of the ground band (coverage stays high).
  while (groundRow > searchFrom) {
    let c = 0;
    for (let x = 0; x < width; x++) c += dark[(groundRow - 1) * width + x];
    if (c / width >= bestCoverage * 0.9) groundRow--;
    else break;
  }
  if (groundRow < 0 || bestCoverage < 0.5) {
    return { objects: [], score: 0, reason: "no-ground-line", text: "" };
  }

  // column heights: walk up from the row just above the ground, allowing a
  // few bright pixels (lit windows) so windows do not truncate buildings.
  const colHeight = new Int32Array(width);
  const brightRunTolerance = 3;
  for (let x = 0; x < width; x++) {
    let h = 0;
    let run = 0;
    for (let y = groundRow - 1; y >= 0; y--) {
      if (dark[y * width + x]) {
        h = groundRow - y;
        run = 0;
      } else if (++run > brightRunTolerance) break;
    }
    colHeight[x] = h;
  }

  // group contiguous columns with height > 0 into objects
  const objects = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const on = x < width && colHeight[x] > 0;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      const slice = [...colHeight.slice(start, x)];
      objects.push({
        x0: start,
        x1: x,
        width: x - start,
        height: median(slice),
        spread: max(slice) - min(slice),
      });
      start = -1;
    }
  }

  // A building is a contiguous run of dark columns rooted at the ground.
  // Lit windows are bright specks inside a dark body — they truncate a
  // column, so a building's columns can disagree. That is fine: take the
  // MAXIMUM column height in the run (the un-truncated silhouette), which is
  // the true signal. Drop only truly empty slivers.
  const solid = objects
    .map((o) => {
      const slice = [...colHeight.slice(o.x0, o.x1)];
      const h = slice.length ? Math.max(...slice) : 0;
      return { ...o, height: h, spread: 0 };
    })
    .filter((o) => o.width >= 5 && o.height >= 3);

  if (solid.length < 3) {
    return { objects: solid, score: 0, reason: "too-few-objects", groundRow, text: "" };
  }

  const heights = solid.map((o) => o.height);
  const fit = fitLattice(heights);
  const rawText = fit.step > 0 ? heightsToText(heights, fit.step) : "";

  // Spaces are encoded as a WIDE GAP between buildings (no building at all),
  // not as a building. Re-insert them: a gap between consecutive objects that
  // is much wider than the typical inter-building gap is a word boundary.
  // The ratio is scale-invariant, so it survives resize and JPEG.
  let text = "";
  if (rawText) {
    const gaps = [];
    for (let i = 1; i < solid.length; i++) gaps.push(solid[i].x0 - solid[i - 1].x1);
    const sorted = [...gaps].sort((a, b) => a - b);
    const medianGap = sorted.length ? sorted[sorted.length >> 1] : 0;
    const spaceThreshold = medianGap * 1.8;
    for (let i = 0; i < solid.length; i++) {
      if (i > 0) {
        const gap = solid[i].x0 - solid[i - 1].x1;
        if (gap > spaceThreshold && medianGap > 0) text += " ";
      }
      text += rawText[i];
    }
  }

  // Score has three gates, all blind:
  //   snapRate   — heights lie on a regular grid (not random rooftops)
  //   tightness  — the grid is hit precisely, not approximately
  //   validRate  — every grid position maps to a real symbol (A–Z, 0–9).
  //                Random skylines land some columns outside the vocabulary;
  //                this is what separates a message-bearing lattice from a
  //                coincidental one.
  const tightness = Math.max(0, 1 - fit.residual / (fit.step || 1));
  const score = fit.snapRate * tightness * (fit.validRate ?? 0);

  return {
    objects: solid,
    heights,
    groundRow,
    fit,
    text,
    score: Number(score.toFixed(3)),
    reason: score >= 0.85 ? "lattice-detected" : score >= 0.5 ? "lattice-weak" : "no-lattice",
  };
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const max = (a) => a.reduce((x, y) => (y > x ? y : x), -Infinity);
const min = (a) => a.reduce((x, y) => (y < x ? y : x), Infinity);
