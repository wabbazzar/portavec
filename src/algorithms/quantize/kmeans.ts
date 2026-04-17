/**
 * Seeded k-means++ color quantization in CIE Lab space.
 *
 * Pure algorithm module — MUST NOT import from src/benchmarks/ground-truth/*.
 * Accepts only ImageData. The elbow-method `k` selector in ./elbow
 * consumes this module's output to pick an auto-k.
 */

export interface QuantizeResult {
  /** `k` palette colors as hex strings, in the same order as indices reference. */
  palette: string[];
  /** Per-pixel palette index (length = width * height). */
  indices: Uint8Array;
  /** Within-cluster sum of squared ΔE for the final assignment. */
  wcss: number;
}

export interface QuantizeOptions {
  k: number;
  seed: number;
  /** Hard cap; usually converges much earlier. */
  maxIters?: number;
  /**
   * Optional stride for Lloyd's iteration sampling. Default 1 (use every
   * pixel). Use >1 to speed up large images.
   */
  sampleStride?: number;
  /**
   * Number of random restarts. Each uses a different seed derivative;
   * the result with the lowest WCSS is returned. Default 1. Use 3-5 to
   * mitigate bad k-means++ initializations on noisy data.
   */
  restarts?: number;
  /**
   * Saliency bias for k-means++ initialization. When > 0, high-chroma
   * (saturated) pixels get a proportionally higher probability of being
   * picked as initial cluster centers. 0 = vanilla k-means++ (distance
   * only). 1 = pure chroma doubles pick probability for max-saturation
   * pixels. Helps preserve rare salient colors that would otherwise be
   * absorbed by frequent muted surroundings (e.g., painted doors in a
   * photo dominated by bark tones). Default 0.
   */
  saliencyWeight?: number;
}

// Simple seeded PRNG here so kmeans.ts has no ground-truth dependency.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- sRGB <-> Lab (duplicated from benchmarks/color-lab to avoid imports) ---

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
function labToRgb([L, a, b]: [number, number, number]): [number, number, number] {
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const d = 6 / 29;
  const finv = (t: number) => (t > d ? t * t * t : 3 * d * d * (t - 4 / 29));
  const X = Xn * finv(fx);
  const Y = Yn * finv(fy);
  const Z = Zn * finv(fz);
  const R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  const G = X * -0.969266 + Y * 1.8760108 + Z * 0.041556;
  const B = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252;
  const linearToSrgb = (v: number) =>
    v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return [
    Math.max(0, Math.min(255, Math.round(linearToSrgb(R) * 255))),
    Math.max(0, Math.min(255, Math.round(linearToSrgb(G) * 255))),
    Math.max(0, Math.min(255, Math.round(linearToSrgb(B) * 255))),
  ];
}

function toHex(v: number): string {
  return v.toString(16).padStart(2, '0');
}
function labToHex(lab: [number, number, number]): string {
  const [r, g, b] = labToRgb(lab);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function sqDist(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dL * dL + da * da + db * db;
}

/**
 * Run seeded k-means++ on the image's Lab pixels. Deterministic for a
 * given (imageData, k, seed, sampleStride, restarts). Runs `restarts`
 * fresh initializations and returns the one with the lowest WCSS.
 */
export function quantize(imageData: ImageData, opts: QuantizeOptions): QuantizeResult {
  const { k, seed, restarts = 1 } = opts;
  if (k < 1 || k > 64) throw new Error(`quantize: k must be in [1, 64], got ${k}`);
  if (restarts <= 1) return quantizeOnce(imageData, opts);

  let best: QuantizeResult | null = null;
  for (let r = 0; r < restarts; r++) {
    const candidate = quantizeOnce(imageData, {
      ...opts,
      seed: seed + r * 9973, // large prime offset so restarts are diverse
      restarts: 1,
    });
    if (best == null || candidate.wcss < best.wcss) best = candidate;
  }
  return best!;
}

function quantizeOnce(imageData: ImageData, opts: QuantizeOptions): QuantizeResult {
  const { k, seed, maxIters = 25, sampleStride = 1, saliencyWeight = 0 } = opts;
  const N = imageData.width * imageData.height;
  const rand = mulberry32(seed);

  // Convert all pixels to Lab.
  const labs: Array<[number, number, number]> = new Array(N);
  for (let i = 0; i < N; i++) {
    labs[i] = rgbToLab(
      imageData.data[i * 4]!,
      imageData.data[i * 4 + 1]!,
      imageData.data[i * 4 + 2]!,
    );
  }

  // Seed pixels (subset used for initialization + iteration if stride > 1).
  const sampleIdx: number[] = [];
  for (let i = 0; i < N; i += sampleStride) sampleIdx.push(i);

  // Precompute per-sample chroma (Lab a/b magnitude) if saliency bias is on.
  // Normalized by 128 — typical max |a|, |b| is ~100–128 for saturated colors.
  const chroma = saliencyWeight > 0 ? new Float64Array(sampleIdx.length) : null;
  if (chroma != null) {
    for (let si = 0; si < sampleIdx.length; si++) {
      const lab = labs[sampleIdx[si]!]!;
      const c = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]) / 128;
      chroma[si] = Math.min(1, c);
    }
  }

  // --- k-means++ initialization ---
  const centroids: Array<[number, number, number]> = [];
  const first = sampleIdx[Math.floor(rand() * sampleIdx.length)]!;
  centroids.push([...labs[first]!]);

  const dist = new Float64Array(sampleIdx.length);
  while (centroids.length < k) {
    let total = 0;
    for (let si = 0; si < sampleIdx.length; si++) {
      const lab = labs[sampleIdx[si]!]!;
      let best = Infinity;
      for (const c of centroids) {
        const d = sqDist(lab, c);
        if (d < best) best = d;
      }
      // Saliency bias: scale selection weight by (1 + w * chroma), so rare
      // high-chroma pixels are more likely to be seeded as centers even
      // when dominant muted colors are geometrically farther.
      const w = chroma != null ? best * (1 + saliencyWeight * chroma[si]!) : best;
      dist[si] = w;
      total += w;
    }
    if (total === 0) {
      // All remaining points coincide with existing centroid — duplicate last.
      centroids.push([...centroids[centroids.length - 1]!]);
      continue;
    }
    const r = rand() * total;
    let acc = 0;
    let chosen = sampleIdx.length - 1;
    for (let si = 0; si < sampleIdx.length; si++) {
      acc += dist[si]!;
      if (acc >= r) {
        chosen = si;
        break;
      }
    }
    centroids.push([...labs[sampleIdx[chosen]!]!]);
  }

  // --- Lloyd's iterations ---
  const assign = new Uint8Array(N);
  for (let iter = 0; iter < maxIters; iter++) {
    let changed = 0;
    // Assign
    for (let i = 0; i < N; i++) {
      let bestJ = 0;
      let bestD = Infinity;
      for (let j = 0; j < centroids.length; j++) {
        const d = sqDist(labs[i]!, centroids[j]!);
        if (d < bestD) {
          bestD = d;
          bestJ = j;
        }
      }
      if (assign[i] !== bestJ) {
        assign[i] = bestJ;
        changed++;
      }
    }
    // Update
    const sumL = new Float64Array(centroids.length);
    const sumA = new Float64Array(centroids.length);
    const sumB = new Float64Array(centroids.length);
    const counts = new Uint32Array(centroids.length);
    for (let i = 0; i < N; i++) {
      const j = assign[i]!;
      const lab = labs[i]!;
      sumL[j] = (sumL[j] ?? 0) + lab[0];
      sumA[j] = (sumA[j] ?? 0) + lab[1];
      sumB[j] = (sumB[j] ?? 0) + lab[2];
      counts[j] = (counts[j] ?? 0) + 1;
    }
    for (let j = 0; j < centroids.length; j++) {
      const c = counts[j]!;
      if (c > 0) {
        centroids[j] = [sumL[j]! / c, sumA[j]! / c, sumB[j]! / c];
      }
    }
    if (changed === 0) break;
  }

  // Final WCSS.
  let wcss = 0;
  for (let i = 0; i < N; i++) wcss += sqDist(labs[i]!, centroids[assign[i]!]!);

  const palette = centroids.map(labToHex);
  return { palette, indices: assign, wcss };
}
