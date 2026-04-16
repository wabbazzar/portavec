/**
 * Check concentric rings structure
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { join } from 'path';

const testFile = join(process.cwd(), 'test-images', 'concentric-rings-256.png');
const pngBuffer = readFileSync(testFile);
const png = PNG.sync.read(pngBuffer);

const size = png.width;
const cx = size / 2;

// Sample along the center horizontal line
console.log('Pixel values along center horizontal line (y=128):');
let prevBlack = false;
let transitions: number[] = [];
for (let x = 0; x < size; x++) {
  const idx = (size * 128 + x) << 2;
  const isBlack = png.data[idx] < 128;
  if (isBlack !== prevBlack) {
    transitions.push(x);
  }
  prevBlack = isBlack;
}

console.log(`Transitions at x: ${transitions.join(', ')}`);
console.log(`Number of transitions: ${transitions.length}`);
console.log(`Expected: 12 transitions (6 edges for 3 rings)`);

// Calculate ring boundaries
console.log('\nRing boundaries (from transitions):');
for (let i = 0; i < transitions.length; i += 2) {
  const start = transitions[i];
  const end = transitions[i + 1];
  if (start !== undefined && end !== undefined) {
    console.log(`  Ring segment: x=${start} to x=${end}, width=${end - start}`);
  }
}

// Check center
const centerIdx = (size * 128 + 128) << 2;
console.log(`\nCenter pixel (128, 128) is black: ${png.data[centerIdx] < 128}`);
