/**
 * Test the contour extraction with the actual algorithm
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the actual algorithm (transpiled)
async function test() {
  // Use ts-node or just read the transpiled output
  // For now, let's just test via the pipeline

  const { runPipelineDebug } = await import('../dist/algorithms/pipeline.js');

  const testFiles = [
    'square-128.png',
    'circle-128.png',
    'ring-128.png',
  ];

  for (const file of testFiles) {
    const testFile = join(__dirname, '..', 'test-images', file);
    try {
      const pngBuffer = readFileSync(testFile);
      const png = PNG.sync.read(pngBuffer);

      const imageData = {
        data: new Uint8ClampedArray(png.data),
        width: png.width,
        height: png.height,
        colorSpace: 'srgb',
      };

      const result = runPipelineDebug(imageData);
      console.log(`${file}:`);
      console.log(`  Contours: ${result.debug.contours.contours.length}`);
      for (let i = 0; i < result.debug.contours.contours.length; i++) {
        const c = result.debug.contours.contours[i];
        console.log(`    Contour ${i}: ${c.points.length} points, isHole=${c.isHole}`);
      }
      console.log();
    } catch (e) {
      console.log(`${file}: Error - ${e.message}`);
    }
  }
}

test().catch(console.error);
