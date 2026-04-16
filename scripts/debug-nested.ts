/**
 * Debug nested squares and concentric rings
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runPipelineDebug } from '../src/algorithms/pipeline';

const files = ['nested-squares-256.png', 'concentric-rings-256.png'];

for (const file of files) {
  const testFile = join(process.cwd(), 'test-images', file);
  const pngBuffer = readFileSync(testFile);
  const png = PNG.sync.read(pngBuffer);

  const imageData = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb' as const,
  };

  const result = runPipelineDebug(imageData);

  console.log(`\n${file}:`);
  console.log(`  Image size: ${png.width}x${png.height}`);
  console.log(`  Contours found: ${result.debug!.contours.contours.length}`);

  for (let i = 0; i < result.debug!.contours.contours.length; i++) {
    const c = result.debug!.contours.contours[i];
    const area = Math.abs(contourArea(c.points));
    console.log(`  Contour ${i}: ${c.points.length} pts, isHole=${c.isHole}, area=${area.toFixed(0)}, bounds=(${c.bounds.minX.toFixed(0)},${c.bounds.minY.toFixed(0)})-(${c.bounds.maxX.toFixed(0)},${c.bounds.maxY.toFixed(0)})`);
  }
}

function contourArea(points: Array<{x: number, y: number}>): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;
    area += curr.x * next.y - next.x * curr.y;
  }
  return area / 2;
}
