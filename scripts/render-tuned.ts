/**
 * Render an image from public/training/ using its auto-tuned params.
 *
 *   npx tsx scripts/render-tuned.ts <name> [--manifest <path>]
 *
 * If the image isn't in the manifest, falls back to pipeline defaults.
 * Writes SVG to test-output/<name>_tuned.svg.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { runMultiColorPipeline } from '../src/algorithms/pipeline-multicolor';

interface ManifestEntry {
  hasTruth: boolean;
  best: {
    config: {
      k?: number;
      saliencyWeight: number;
      salientSeedBudget: number;
      mergeThreshold: number;
    };
    score: number;
    scoreType: string;
    paths: number;
    uniqueFills: number;
  };
}

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
  const name = process.argv[2];
  if (!name) {
    process.stderr.write('usage: render-tuned <name> [--manifest <path>]\n');
    process.exit(1);
  }
  const manifestPath = process.argv.includes('--manifest')
    ? process.argv[process.argv.indexOf('--manifest') + 1]!
    : 'public/training/tuning-manifest.json';

  const pngPath = join('public/training', `${name}.png`);
  if (!existsSync(pngPath)) {
    process.stderr.write(`not found: ${pngPath}\n`);
    process.exit(1);
  }

  let cfg: ManifestEntry['best']['config'] | null = null;
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      entries: Record<string, ManifestEntry>;
    };
    if (m.entries[name]) cfg = m.entries[name]!.best.config;
  }

  const img = pngToImageData(readFileSync(pngPath));
  const t0 = Date.now();
  const result = runMultiColorPipeline(img, cfg ?? {});
  const ms = Date.now() - t0;

  const outPath = `test-output/${name}_tuned.svg`;
  writeFileSync(outPath, result.svg);
  const paths = result.layers.reduce((n, l) => n + l.pathData.length, 0);
  process.stdout.write(
    `${name}: ${cfg ? 'tuned' : 'default'} → ${outPath} ` +
      `k=${result.k} paths=${paths} ${ms}ms` +
      (cfg ? ` cfg={k=${cfg.k ?? 'auto'} sw=${cfg.saliencyWeight} sb=${cfg.salientSeedBudget} mt=${cfg.mergeThreshold}}` : '') +
      '\n',
  );
}

main();
