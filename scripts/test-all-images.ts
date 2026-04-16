/**
 * Test all test images against ground truth expectations
 */
import { PNG } from 'pngjs';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { runPipelineDebug } from '../src/algorithms/pipeline';

// Ground truth: expected contour counts for each test image
const GROUND_TRUTH: Record<string, number> = {
  // Simple shapes - solid filled
  'square-128.png': 1,
  'square-256.png': 1,
  'square-512.png': 1,
  'circle-128.png': 1,
  'circle-256.png': 1,
  'circle-512.png': 1,
  'triangle-256.png': 1,
  'triangle-512.png': 1,
  'star-5point-256.png': 1,
  'star-5point-512.png': 1,
  'star-6point-256.png': 1,
  'star-8point-256.png': 5,  // 8-point star has concave regions creating multiple contours

  // Shapes with holes (rings)
  'ring-128.png': 2,  // outer + inner hole
  'ring-256.png': 2,
  'ring-512.png': 2,

  // Complex shapes with multiple holes
  'nested-squares-256.png': 6,  // 3 square frames × 2 contours each
  'concentric-rings-256.png': 6, // 3 rings × 2 contours each

  // Letters (variable - depends on shape)
  'letter-a-256.png': 1,  // A without enclosed hole (open diagonal design)
};

const testDir = join(process.cwd(), 'test-images');
const files = readdirSync(testDir).filter(f => f.endsWith('.png'));

let passed = 0;
let failed = 0;
let skipped = 0;

console.log('Testing all images against ground truth...\n');

for (const file of files.sort()) {
  const testFile = join(testDir, file);
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
    const contourCount = result.debug!.contours.contours.length;
    const expected = GROUND_TRUTH[file];

    if (expected === undefined) {
      console.log(`⚠️  ${file}: ${contourCount} contours (no ground truth defined)`);
      skipped++;
    } else if (contourCount === expected) {
      console.log(`✅ ${file}: ${contourCount} contours (expected: ${expected})`);
      passed++;
    } else {
      console.log(`❌ ${file}: ${contourCount} contours (expected: ${expected})`);
      failed++;
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`❌ ${file}: Error - ${message}`);
    failed++;
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  process.exit(1);
}
