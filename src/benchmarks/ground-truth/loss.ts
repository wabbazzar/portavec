/**
 * Loss function for multi-color vectorization benchmark.
 *
 *   loss = 1 - (0.4*paletteMatch + 0.5*coverageIoU + 0.1*(1 - normCentroidErr))
 *
 * where all three components are in [0, 1] (higher = better). Coverage
 * and centroid error are computed after a bipartite match between the
 * truth palette and the algorithm's palette (greedy by ΔE ascending,
 * palettes are tiny so it's optimal).
 */

import { hexToRgb } from './palette';
import { rgbToLab, deltaE, type Rgb } from './color-lab';
import { rasterizeTruth } from './rasterize';
import type { Truth } from './schema';

export interface VectorOutput {
  /** Hex colors produced by the algorithm. */
  palette: string[];
  /** Algorithm output rasterized at Truth.width × Truth.height. */
  rasterized: ImageData;
}

export interface LossReport {
  paletteMatch: number;
  coverageIoU: number;
  centroidError: number;
  loss: number;
  /** Bipartite match: outputIdx = matches[truthIdx]. -1 = no match. */
  matches: number[];
  perShape: Array<{
    truthColor: string;
    matchedColor: string | null;
    iou: number;
    centroidDistPx: number;
  }>;
}

const LOSS_W_PALETTE = 0.4;
const LOSS_W_COVERAGE = 0.5;
const LOSS_W_CENTROID = 0.1;
/** Threshold ΔE above which a palette match is considered a miss. */
const PALETTE_MISS_THRESHOLD = 50;

export function computeLoss(truth: Truth, output: VectorOutput): LossReport {
  if (
    output.rasterized.width !== truth.width ||
    output.rasterized.height !== truth.height
  ) {
    throw new Error(
      `computeLoss: output raster size ${output.rasterized.width}x${output.rasterized.height} != truth ${truth.width}x${truth.height}`,
    );
  }

  const truthLab = truth.palette.map((hex) => rgbToLab(hexToRgb(hex)));
  const outLab = output.palette.map((hex) => rgbToLab(hexToRgb(hex)));
  const matches = greedyMatch(truthLab, outLab);

  // paletteMatch: 1 - avg(ΔE / PALETTE_MISS_THRESHOLD), clamped to [0, 1].
  let paletteErrSum = 0;
  for (let i = 0; i < truthLab.length; i++) {
    const j = matches[i]!;
    const d = j >= 0 ? deltaE(truthLab[i]!, outLab[j]!) : PALETTE_MISS_THRESHOLD;
    paletteErrSum += Math.min(d, PALETTE_MISS_THRESHOLD);
  }
  const paletteMatch = Math.max(
    0,
    1 - paletteErrSum / (truthLab.length * PALETTE_MISS_THRESHOLD),
  );

  // Build per-pixel color index map for truth shapes (from the rasterized
  // truth image, not the vector Truth) and for output.
  const truthIdx = buildColorIndex(
    rasterizeTruth(truth),
    truth.palette.map(hexToRgb),
  );
  const outIdx = buildColorIndex(output.rasterized, output.palette.map(hexToRgb));

  // coverage + centroid per truth color.
  const perShape: LossReport['perShape'] = [];
  let iouSum = 0;
  let centroidSumNorm = 0;
  const diag = Math.hypot(truth.width, truth.height);

  for (let i = 0; i < truth.palette.length; i++) {
    const truthMask = colorMask(truthIdx, i);
    const matchJ = matches[i]!;
    const outMask =
      matchJ >= 0 ? colorMask(outIdx, matchJ) : new Uint8Array(truthMask.length);
    const iou = maskIoU(truthMask, outMask);
    const tC = maskCentroid(truthMask, truth.width);
    const oC = maskCentroid(outMask, truth.width);
    const centroidDist =
      tC && oC ? Math.hypot(tC.x - oC.x, tC.y - oC.y) : diag;
    iouSum += iou;
    centroidSumNorm += Math.min(1, centroidDist / diag);
    perShape.push({
      truthColor: truth.palette[i]!,
      matchedColor: matchJ >= 0 ? output.palette[matchJ]! : null,
      iou,
      centroidDistPx: centroidDist,
    });
  }

  const coverageIoU = iouSum / truth.palette.length;
  const normCentroidErr = centroidSumNorm / truth.palette.length;

  const good =
    LOSS_W_PALETTE * paletteMatch +
    LOSS_W_COVERAGE * coverageIoU +
    LOSS_W_CENTROID * (1 - normCentroidErr);
  const loss = Math.max(0, Math.min(1, 1 - good));

  return {
    paletteMatch,
    coverageIoU,
    centroidError: normCentroidErr,
    loss,
    matches,
    perShape,
  };
}

/** Greedy bipartite matching of truth palette → output palette by ΔE. */
function greedyMatch(truth: ReturnType<typeof rgbToLab>[], out: ReturnType<typeof rgbToLab>[]): number[] {
  const matches = new Array<number>(truth.length).fill(-1);
  const used = new Set<number>();
  // sort truth indices by their best available distance (unused)
  const order = truth
    .map((_, i) => i)
    .sort((a, b) => minDist(truth[a]!, out) - minDist(truth[b]!, out));
  for (const i of order) {
    let bestJ = -1;
    let bestD = Infinity;
    for (let j = 0; j < out.length; j++) {
      if (used.has(j)) continue;
      const d = deltaE(truth[i]!, out[j]!);
      if (d < bestD) {
        bestD = d;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      matches[i] = bestJ;
      used.add(bestJ);
    }
  }
  return matches;
}

function minDist(t: ReturnType<typeof rgbToLab>, out: ReturnType<typeof rgbToLab>[]): number {
  let m = Infinity;
  for (const o of out) m = Math.min(m, deltaE(t, o));
  return m;
}

/**
 * Build a palette-index image: for each pixel, the index of the palette
 * color that best matches it (Lab ΔE). Pixels farther than a threshold
 * from any palette color get 0xff (= background / unmatched).
 */
function buildColorIndex(img: ImageData, palette: Rgb[]): Uint8Array {
  const labs = palette.map(rgbToLab);
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0; i < img.width * img.height; i++) {
    const r = img.data[i * 4]!;
    const g = img.data[i * 4 + 1]!;
    const b = img.data[i * 4 + 2]!;
    const pxLab = rgbToLab([r, g, b]);
    let best = 0xff;
    let bestD = 20; // only claim this pixel if within ΔE 20 of a palette color
    for (let p = 0; p < labs.length; p++) {
      const d = deltaE(pxLab, labs[p]!);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    out[i] = best;
  }
  return out;
}

function colorMask(idx: Uint8Array, color: number): Uint8Array {
  const out = new Uint8Array(idx.length);
  for (let i = 0; i < idx.length; i++) out[i] = idx[i] === color ? 1 : 0;
  return out;
}

function maskIoU(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai && bi) inter++;
    if (ai || bi) uni++;
  }
  return uni === 0 ? 1 : inter / uni;
}

function maskCentroid(mask: Uint8Array, width: number): { x: number; y: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    sx += i % width;
    sy += Math.floor(i / width);
    n++;
  }
  if (n === 0) return null;
  return { x: sx / n, y: sy / n };
}
