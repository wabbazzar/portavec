/**
 * Spatial-saliency seed detection for k-means++.
 *
 * Vanilla k-means++ picks initial centers proportional to squared distance
 * from already-picked centers — which works when cluster colors are roughly
 * equally frequent, but fails when a scene has many pixels of a dominant
 * color (bark, sky) and a few pixels of a distinctive color (painted
 * doors, small objects). The distinctive colors get absorbed.
 *
 * This module finds distinctive colors by histogramming Lab hue bins,
 * then ranking bins by (chroma / log(frequency)) — preferring bins that
 * are chromatic but rare. The top-N bin-means become "reserved seeds"
 * that k-means++ must start from, guaranteeing those colors survive
 * into the final palette.
 */

const HUE_BINS = 36; // 10° per bin
const MIN_BIN_COUNT = 10; // reject bins with fewer pixels (noise specks)
const MIN_CHROMA = 15; // reject bins with low saturation (not distinctive)

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function labF(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r / 255);
  const G = srgbToLinear(g / 255);
  const B = srgbToLinear(b / 255);
  const x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const fx = labF(x / Xn);
  const fy = labF(y / Yn);
  const fz = labF(z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function sqDist(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dL * dL + da * da + db * db;
}

/**
 * Find up to `budget` salient colors (Lab triples) in the image. Returned
 * colors are deduplicated so no two picks are closer than ΔE=`minDeltaE`.
 * Deterministic for a given image.
 */
export function findSalientSeeds(
  imageData: ImageData,
  budget: number,
  minDeltaE: number = 8,
): Array<[number, number, number]> {
  if (budget <= 0) return [];

  const sumL = new Float64Array(HUE_BINS);
  const sumA = new Float64Array(HUE_BINS);
  const sumB = new Float64Array(HUE_BINS);
  const counts = new Uint32Array(HUE_BINS);
  const N = imageData.width * imageData.height;

  for (let i = 0; i < N; i++) {
    const lab = rgbToLab(
      imageData.data[i * 4]!,
      imageData.data[i * 4 + 1]!,
      imageData.data[i * 4 + 2]!,
    );
    const h = Math.atan2(lab[2], lab[1]);
    const bin = Math.floor(((h + Math.PI) / (2 * Math.PI)) * HUE_BINS) % HUE_BINS;
    sumL[bin]! += lab[0];
    sumA[bin]! += lab[1];
    sumB[bin]! += lab[2];
    counts[bin]!++;
  }

  interface Scored {
    lab: [number, number, number];
    score: number;
    count: number;
  }
  const scored: Scored[] = [];
  for (let b = 0; b < HUE_BINS; b++) {
    const c = counts[b]!;
    if (c < MIN_BIN_COUNT) continue;
    const L = sumL[b]! / c;
    const A = sumA[b]! / c;
    const B = sumB[b]! / c;
    const chroma = Math.sqrt(A * A + B * B);
    if (chroma < MIN_CHROMA) continue;
    // Chroma divided by inv-log-frequency: rewards chromatic rarity.
    const score = chroma / Math.log(c + 2);
    scored.push({ lab: [L, A, B], score, count: c });
  }

  scored.sort((a, b) => b.score - a.score);

  const thresholdSq = minDeltaE * minDeltaE;
  const selected: Array<[number, number, number]> = [];
  for (const s of scored) {
    if (selected.length >= budget) break;
    let tooClose = false;
    for (const ex of selected) {
      if (sqDist(s.lab, ex) < thresholdSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) selected.push(s.lab);
  }
  return selected;
}
