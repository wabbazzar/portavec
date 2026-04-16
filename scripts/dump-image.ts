/**
 * Dump image as ASCII art to visualize structure
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { join } from 'path';

const file = process.argv[2] || 'nested-squares-256.png';
const testFile = join(process.cwd(), 'test-images', file);
const pngBuffer = readFileSync(testFile);
const png = PNG.sync.read(pngBuffer);

console.log(`${file}: ${png.width}x${png.height}`);

// Sample at intervals
const stepX = Math.max(1, Math.floor(png.width / 80));
const stepY = Math.max(1, Math.floor(png.height / 40));

for (let y = 0; y < png.height; y += stepY) {
  let line = '';
  for (let x = 0; x < png.width; x += stepX) {
    const idx = (png.width * y + x) << 2;
    const gray = (png.data[idx] + png.data[idx + 1] + png.data[idx + 2]) / 3;
    line += gray < 128 ? '█' : ' ';
  }
  console.log(line);
}
