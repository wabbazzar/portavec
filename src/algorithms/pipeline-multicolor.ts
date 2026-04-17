/**
 * Multi-color vectorization pipeline.
 *
 * Per-color-layer variant of the existing single-color pipeline:
 *
 *   1. Quantize input to K colors (manual or auto via elbow).
 *   2. For each palette color, build a binary mask of pixels assigned
 *      to that color, then run the existing contour trace + curve fit.
 *   3. Emit one SVG <path> per traced contour, each filled with its
 *      layer's color. Layers stack in palette order.
 *
 * Blind barrier: this module imports only from ./quantize, ./contour-tracing,
 * ./curve-fitting, and ../utils. MUST NOT import ../benchmarks/ground-truth/*.
 */

import {
  autoQuantize,
  quantize,
  medianDenoise,
  mergeNearClusters,
  mergeGradientCoupled,
} from './quantize';
import type { QuantizeResult } from './quantize';
import { traceContours } from './contour-tracing';
import { fitCurves, pathToSvgData } from './curve-fitting';
import type { Point } from '../utils/svg';

export interface MultiColorOptions {
  /**
   * If provided, use this k directly. Otherwise auto-pick via elbow.
   */
  k?: number;
  /**
   * Seed for k-means. Independent of any truth-side randomness.
   */
  seed?: number;
  maxK?: number;
  sampleStride?: number;
  /**
   * Median-denoise radius applied before quantize. 0 disables.
   * Default 1 (3x3 median) — no-op on clean images, tightens clusters
   * on noisy/JPEGed inputs.
   */
  denoiseRadius?: number;
  /**
   * Number of median-filter passes. More passes = stronger denoise
   * with better edge preservation than one large-radius pass.
   */
  denoisePasses?: number;
  /**
   * k-means restart count. Each restart uses a different seed; the
   * result with the lowest WCSS is kept. Default 3 — ~3× CPU for a
   * significant tightening of cluster centers on noisy inputs.
   */
  restarts?: number;
  /**
   * Auto-k strategy:
   *   'silhouette' — elbow + silhouette plateau edge (default for
   *       clean-ish images where silhouette saturates cleanly)
   *   'merge'      — over-cluster at maxK then merge near-duplicate
   *       centers (robust on noisy data where silhouette is ambiguous)
   */
  autoKStrategy?: 'silhouette' | 'merge';
  /**
   * ΔE below which two cluster centers are merged in 'merge' mode.
   * Lower = more aggressive cluster preservation.
   */
  mergeThreshold?: number;
  /**
   * Clusters smaller than this fraction of total pixels are dissolved
   * into their nearest surviving neighbor. Kills noise-artifact
   * clusters without affecting real shape regions.
   */
  minClusterFraction?: number;
  /**
   * After ΔE-merge, detect spatially-coupled cluster pairs (two colors
   * that share most of their perimeter) and merge them as a single
   * gradient region. Dramatically improves coverage on gradient-filled
   * shapes; no effect on flat-color regions.
   */
  gradientCoupleThreshold?: number;
  /** ΔE upper bound for the coupling merge. */
  gradientCoupleDeMax?: number;
  minContourLength?: number;
  simplifyTolerance?: number;
  curveTolerance?: number;
  /**
   * k-means++ saliency bias. When > 0, high-chroma pixels are more
   * likely to be picked as initial cluster centers, preserving rare
   * saturated colors (e.g., painted details) that would otherwise be
   * absorbed by dominant muted surroundings. 0 = vanilla k-means++.
   */
  saliencyWeight?: number;
}

export interface ColorLayer {
  color: string;
  paletteIndex: number;
  pathData: string[];
  pixelCount: number;
}

export interface MultiColorResult {
  svg: string;
  palette: string[];
  /** Per-pixel palette index, length = width * height. */
  indices: Uint8Array;
  /** Elbow-chosen k (equals `opts.k` when provided manually). */
  k: number;
  /** WCSS curve from elbow scan; [] when k was manual. */
  wcssByK: number[];
  layers: ColorLayer[];
  width: number;
  height: number;
}

const DEFAULT_OPTS: Required<Pick<MultiColorOptions,
  'seed' | 'maxK' | 'denoiseRadius' | 'denoisePasses' | 'restarts' | 'autoKStrategy' | 'mergeThreshold' | 'minClusterFraction' | 'gradientCoupleThreshold' | 'gradientCoupleDeMax' | 'minContourLength' | 'simplifyTolerance' | 'curveTolerance' | 'saliencyWeight'
>> = {
  seed: 17,
  maxK: 32,
  denoiseRadius: 1,
  denoisePasses: 2,
  restarts: 5,
  autoKStrategy: 'merge',
  mergeThreshold: 4,
  minClusterFraction: 0,
  // Gradient-couple pass disabled by default: on the current loss it
  // trades coverage IoU for SVG aesthetics. Enable per-call with a
  // positive threshold when rendering output that will be viewed.
  gradientCoupleThreshold: 0,
  gradientCoupleDeMax: 20,
  minContourLength: 3,
  simplifyTolerance: 0.3,
  curveTolerance: 1.2,
  saliencyWeight: 0,
};

export function runMultiColorPipeline(
  imageData: ImageData,
  options: MultiColorOptions = {},
): MultiColorResult {
  const opts = { ...DEFAULT_OPTS, ...options };
  const { width, height } = imageData;

  // Pre-filter: edge-preserving denoise. Tightens color clusters on
  // noisy input; effectively a no-op on clean synthetic images.
  const forQuantize =
    opts.denoiseRadius > 0 && opts.denoisePasses > 0
      ? medianDenoise(imageData, {
          radius: opts.denoiseRadius,
          passes: opts.denoisePasses,
        })
      : imageData;

  // Quantize.
  let quant: QuantizeResult;
  let k: number;
  let wcssByK: number[] = [];
  if (options.k != null) {
    k = options.k;
    quant = quantize(forQuantize, {
      k,
      seed: opts.seed,
      sampleStride: opts.sampleStride,
      restarts: opts.restarts,
      saliencyWeight: opts.saliencyWeight,
    });
  } else if (opts.autoKStrategy === 'merge') {
    // Over-cluster then merge close centers in Lab. Robust on noisy
    // input where silhouette plateaus hide the true cluster count.
    const initial = quantize(forQuantize, {
      k: opts.maxK,
      seed: opts.seed,
      sampleStride: opts.sampleStride,
      restarts: opts.restarts,
      saliencyWeight: opts.saliencyWeight,
    });
    const merged = mergeNearClusters(initial, {
      mergeThreshold: opts.mergeThreshold,
      minClusterFraction: opts.minClusterFraction,
      sourceImage: forQuantize,
    });
    // Optional second pass: collapse gradient-coupled cluster pairs
    // based on spatial adjacency. Off by default because it trades
    // coverage IoU for SVG aesthetics on the current loss function.
    const final = opts.gradientCoupleThreshold > 0
      ? mergeGradientCoupled(merged, {
          width,
          height,
          couplingThreshold: opts.gradientCoupleThreshold,
          deThreshold: opts.gradientCoupleDeMax,
        })
      : merged;
    k = final.palette.length;
    quant = final;
  } else {
    const auto = autoQuantize(forQuantize, {
      seed: opts.seed,
      maxK: opts.maxK,
      sampleStride: opts.sampleStride,
      restarts: opts.restarts,
      saliencyWeight: opts.saliencyWeight,
    });
    k = auto.k;
    wcssByK = auto.wcssByK;
    quant = auto;
  }

  // Trace each layer.
  const layers: ColorLayer[] = [];

  for (let p = 0; p < quant.palette.length; p++) {
    const color = quant.palette[p]!;
    const mask = new Uint8ClampedArray(width * height);
    let pixelCount = 0;
    for (let i = 0; i < width * height; i++) {
      if (quant.indices[i] === p) {
        mask[i] = 255;
        pixelCount++;
      }
    }

    const pathData: string[] = [];
    if (pixelCount > 0) {
      const contourResult = traceContours(mask, width, height, {
        minLength: opts.minContourLength,
        simplifyTolerance: opts.simplifyTolerance,
      });

      for (const contour of contourResult.contours) {
        if (contour.points.length < 3) continue;
        const fit = fitCurves(contour.points, {
          method: 'bezier',
          tolerance: opts.curveTolerance,
          closed: contour.closed,
        });
        fit.path.isHole = contour.isHole;
        const start: Point = contour.points[0] ?? { x: 0, y: 0 };
        const d = pathToSvgData(fit.path, start);
        if (d) pathData.push(d);
      }
    }

    layers.push({ color, paletteIndex: p, pathData, pixelCount });
  }

  // Z-order: paint large regions first, small ones on top. Prevents
  // big layers from occluding fine details (cat face, fish, door
  // ornaments) that ended up in smaller clusters.
  const allPathStrings: Array<{ d: string; fill: string }> = [];
  const orderedLayers = [...layers].sort((a, b) => b.pixelCount - a.pixelCount);
  for (const layer of orderedLayers) {
    for (const d of layer.pathData) {
      allPathStrings.push({ d, fill: layer.color });
    }
  }

  const svg = buildMultiColorSvg(width, height, allPathStrings);

  return {
    svg,
    palette: quant.palette,
    indices: quant.indices,
    k,
    wcssByK,
    layers,
    width,
    height,
  };
}

function buildMultiColorSvg(
  width: number,
  height: number,
  entries: Array<{ d: string; fill: string }>,
): string {
  // Each path is stroked in its own fill color. This 0.75px same-color
  // stroke is invisible inside a region but closes the 1-2px seams
  // between adjacent color layers — marching-squares + Douglas-Peucker
  // simplification leaves each layer's boundary slightly inside its
  // region, and the SVG background (white) bleeds through without this.
  const paths = entries
    .map(
      (e) =>
        `  <path d="${e.d}" fill="${e.fill}" stroke="${e.fill}" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" fill-rule="evenodd" />`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${paths}
</svg>`;
}

/**
 * Helper: rasterize a MultiColorResult back to ImageData using its own
 * per-pixel indices + palette. Lets the benchmark compute loss without
 * a canvas / SVG round-trip.
 */
export function multicolorToImageData(result: MultiColorResult): ImageData {
  const { width, height, palette, indices } = result;
  const data = new Uint8ClampedArray(width * height * 4);
  const rgb = palette.map((hex) => parseHex(hex));
  for (let i = 0; i < width * height; i++) {
    const p = indices[i]!;
    const c = rgb[p] ?? [0, 0, 0];
    data[i * 4] = c[0]!;
    data[i * 4 + 1] = c[1]!;
    data[i * 4 + 2] = c[2]!;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
