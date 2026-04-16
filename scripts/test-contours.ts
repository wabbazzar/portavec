/**
 * Test the contour extraction with the actual algorithm
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runPipelineDebug } from '../src/algorithms/pipeline';

const testFiles = [
  'square-128.png',
  'circle-128.png',
  'ring-128.png',
];

for (const file of testFiles) {
  const testFile = join(process.cwd(), 'test-images', file);
  try {
    const pngBuffer = readFileSync(testFile);
    const png = PNG.sync.read(pngBuffer);

    const imageData = {
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
      colorSpace: 'srgb' as const,
    };

    const result = runPipelineDebug(imageData);
    console.log(`${file}:`);
    console.log(`  Contours: ${result.debug!.contours.contours.length}`);
    for (let i = 0; i < result.debug!.contours.contours.length; i++) {
      const c = result.debug!.contours.contours[i];
      console.log(`    Contour ${i}: ${c.points.length} points, isHole=${c.isHole}, bounds=(${c.bounds.minX.toFixed(1)},${c.bounds.minY.toFixed(1)})-(${c.bounds.maxX.toFixed(1)},${c.bounds.maxY.toFixed(1)})`);
    }
    console.log();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`${file}: Error - ${message}`);
  }
}
