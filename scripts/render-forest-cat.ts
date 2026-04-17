/**
 * Render hw_forest_cat.png through the multicolor pipeline at a given k,
 * write SVG to test-output/. Used by the self-improving loop to track
 * how forest-cat quality responds to pipeline tuning.
 *
 *   tsx scripts/render-forest-cat.ts <iter> [k]
 *
 * Arguments:
 *   iter  — integer iteration number; names output `hw_forest_cat_iterN.svg`
 *   k     — optional override; defaults to auto (elbow)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { runMultiColorPipeline } from '../src/algorithms/pipeline-multicolor';

function pngToImageData(buf: Buffer): ImageData {
  const png = PNG.sync.read(buf);
  return {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb',
  } as ImageData;
}

function main(): void {
  const iter = process.argv[2] ?? '0';
  const kArg = process.argv[3];
  const salArg = process.argv[4];
  const k = kArg != null ? Number(kArg) : undefined;
  const saliencyWeight = salArg != null ? Number(salArg) : undefined;

  const pngBuf = readFileSync('public/training/hw_forest_cat.png');
  const img = pngToImageData(pngBuf);
  const opts: Record<string, number> = {};
  if (k != null) opts.k = k;
  if (saliencyWeight != null) opts.saliencyWeight = saliencyWeight;
  const t0 = Date.now();
  const result = runMultiColorPipeline(img, opts);
  const ms = Date.now() - t0;

  const outPath = `test-output/hw_forest_cat_iter${iter}.svg`;
  writeFileSync(outPath, result.svg);

  const uniqueFills = new Set(result.layers.map((l) => l.color)).size;
  const totalPaths = result.layers.reduce((n, l) => n + l.pathData.length, 0);
  process.stdout.write(
    `iter${iter}: wrote ${outPath} — k=${result.k}, uniqueFills=${uniqueFills}, paths=${totalPaths}, sal=${saliencyWeight ?? 0}, ${ms}ms\n`,
  );
}

main();
