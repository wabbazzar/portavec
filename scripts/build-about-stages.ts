/**
 * Generate the four intermediate-stage assets the About page walks
 * through. Run whenever the pipeline defaults or forest_cat tuned
 * config changes:
 *
 *   npx tsx scripts/build-about-stages.ts
 *
 * Outputs:
 *   public/about/step-1-original.png   — unchanged copy of forest_cat
 *   public/about/step-2-quantized.png  — after k-means, flat colors
 *   public/about/step-3-contours.svg   — Bézier outlines, stroke-only
 *   public/about/step-4-final.svg      — complete SVG output
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import {
  runMultiColorPipeline,
  multicolorToImageData,
} from '../src/algorithms/pipeline-multicolor';

const SRC = 'public/training/hw_forest_cat.png';
const OUT = 'public/about';
const MANIFEST = 'public/training/tuning-manifest.json';

function pngToImageData(buf: Buffer): ImageData {
  const png = PNG.sync.read(buf);
  return {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb',
  } as ImageData;
}
function imageDataToPng(img: ImageData): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i++) png.data[i] = img.data[i]!;
  return PNG.sync.write(png);
}

interface TuningEntry {
  best: {
    config: {
      k?: number;
      saliencyWeight: number;
      salientSeedBudget: number;
      mergeThreshold: number;
    };
  };
}

function loadTunedConfig(name: string): TuningEntry['best']['config'] | null {
  if (!existsSync(MANIFEST)) return null;
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  return m.entries?.[name]?.best?.config ?? null;
}

function buildOutlinesSvg(width: number, height: number, result: ReturnType<typeof runMultiColorPipeline>): string {
  // Same paths as the final SVG but stroke-only — reveals the geometry.
  const entries = result.layers.flatMap((l) =>
    l.pathData.map((d) => ({ d, color: l.color })),
  );
  const paths = entries
    .map((e) => `  <path d="${e.d}" fill="none" stroke="${e.color}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" />`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${paths}
</svg>`;
}

function main(): void {
  mkdirSync(OUT, { recursive: true });

  // Step 1: original (just copy)
  copyFileSync(SRC, `${OUT}/step-1-original.png`);
  process.stderr.write(`wrote ${OUT}/step-1-original.png\n`);

  // Step 2-4: run pipeline at tuned config
  const img = pngToImageData(readFileSync(SRC));
  const cfg = loadTunedConfig('hw_forest_cat') ?? {
    k: 20,
    saliencyWeight: 0,
    salientSeedBudget: 8,
    mergeThreshold: 4,
  };
  // 2px minContourLength closes the sliver gaps between layers that show up
  // in the landing-hero before/after scrub when the default (3) drops
  // small contours along seams.
  const cfgWithContour = { ...cfg, minContourLength: 2 };
  process.stderr.write(`forest_cat config: ${JSON.stringify(cfgWithContour)}\n`);

  const result = runMultiColorPipeline(img, cfgWithContour);

  // Step 2: quantized rasterized output
  const quant = multicolorToImageData(result);
  writeFileSync(`${OUT}/step-2-quantized.png`, imageDataToPng(quant));
  process.stderr.write(`wrote ${OUT}/step-2-quantized.png (k=${result.k}, ${result.layers.length} layers)\n`);

  // Step 3: outlines-only SVG
  const outlines = buildOutlinesSvg(img.width, img.height, result);
  writeFileSync(`${OUT}/step-3-contours.svg`, outlines);
  process.stderr.write(`wrote ${OUT}/step-3-contours.svg\n`);

  // Step 4: final filled SVG
  writeFileSync(`${OUT}/step-4-final.svg`, result.svg);
  process.stderr.write(`wrote ${OUT}/step-4-final.svg\n`);

  const totalPaths = result.layers.reduce((n, l) => n + l.pathData.length, 0);
  process.stderr.write(
    `\nsummary: k=${result.k}, unique fills=${new Set(result.layers.map((l) => l.color)).size}, paths=${totalPaths}\n`,
  );
}

main();
