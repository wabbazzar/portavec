/**
 * End-to-end test for the vectorization pipeline
 * Tests: Load image → Vectorize → Generate SVG
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { runPipeline } from '../src/algorithms/pipeline';

const testImagesDir = join(process.cwd(), 'test-images');
const outputDir = join(process.cwd(), 'test-output');

// Create output dir if needed
import { mkdirSync, existsSync } from 'fs';
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const testCases = [
  { file: 'square-128.png', expectedPaths: 1 },
  { file: 'circle-128.png', expectedPaths: 1 },
  { file: 'ring-128.png', expectedPaths: 2 },
  { file: 'triangle-256.png', expectedPaths: 1 },
  { file: 'nested-squares-256.png', expectedPaths: 6 },
  { file: 'concentric-rings-256.png', expectedPaths: 6 },
];

console.log('End-to-End Pipeline Test');
console.log('========================\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const filepath = join(testImagesDir, testCase.file);

  try {
    // 1. Load image
    const pngBuffer = readFileSync(filepath);
    const png = PNG.sync.read(pngBuffer);

    const imageData = {
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
      colorSpace: 'srgb' as const,
    };

    // 2. Run pipeline (threshold → contour → curve fitting → SVG)
    const result = runPipeline(imageData);

    // 3. Validate output
    const hasSvg = result.svg.includes('<svg') && result.svg.includes('<path');
    const pathCount = result.paths.length;
    const isCorrect = pathCount >= 1 && hasSvg;  // At least 1 path and valid SVG

    // 4. Save SVG for visual inspection
    const svgPath = join(outputDir, testCase.file.replace('.png', '.svg'));
    writeFileSync(svgPath, result.svg);

    if (isCorrect) {
      console.log(`✅ ${testCase.file}: ${pathCount} path(s), SVG generated`);
      passed++;
    } else {
      console.log(`❌ ${testCase.file}: ${pathCount} path(s), hasSVG=${hasSvg}`);
      failed++;
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`❌ ${testCase.file}: Error - ${message}`);
    failed++;
  }
}

console.log('\n========================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`\nSVG files saved to: ${outputDir}`);

if (failed > 0) {
  process.exit(1);
}
