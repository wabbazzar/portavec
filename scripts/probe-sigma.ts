import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { estimateNoiseSigma } from '../src/algorithms/quantize/denoise';
function load(p: string): ImageData {
  const png = PNG.sync.read(readFileSync(p));
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height, colorSpace: 'srgb' } as ImageData;
}
for (const name of ['seed1_n30', 'seed1_n30_noisy', 'hw_forest_cat', 'seed1_n20', 'seed1_n16_grad']) {
  const img = load(`public/training/${name}.png`);
  const s = estimateNoiseSigma(img);
  console.log(`${name}: σ=${s.toFixed(2)}  → radius=${s < 3 ? 0 : s < 8 ? 1 : 2}`);
}
