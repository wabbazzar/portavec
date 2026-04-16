/**
 * Benchmark script for concentric rings image
 */
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { runPipelineDebug } from '../src/algorithms/pipeline';

// Read the PNG
const data = readFileSync('./test-images/concentric-rings-256.png');
const png = PNG.sync.read(data);

// Convert to ImageData-like
const imageData = {
  width: png.width,
  height: png.height,
  data: new Uint8ClampedArray(png.data),
  colorSpace: 'srgb' as const,
};

console.log(`Image size: ${png.width}x${png.height}`);
console.log(`Total pixels: ${png.width * png.height}`);
console.log('');

// Run pipeline with timing
const iterations = 3;
const results: number[] = [];

for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  const result = runPipelineDebug(imageData);
  const elapsed = performance.now() - start;
  results.push(elapsed);

  if (i === iterations - 1) {
    console.log('=== Pipeline Breakdown ===');
    console.log(`Total time: ${elapsed.toFixed(2)}ms`);
    console.log(`  Threshold: ${result.metrics.stages.threshold.toFixed(2)}ms`);
    console.log(`  Edge detection: ${result.metrics.stages.edgeDetection.toFixed(2)}ms`);
    console.log(`  Contour tracing: ${result.metrics.stages.contourTracing.toFixed(2)}ms`);
    console.log(`  Curve fitting: ${result.metrics.stages.curveFitting.toFixed(2)}ms`);
    console.log(`  SVG generation: ${result.metrics.stages.svgGeneration.toFixed(2)}ms`);
    console.log('');
    console.log('=== Output Stats ===');
    console.log(`Contours: ${result.metrics.totalContours}`);
    console.log(`Total points: ${result.metrics.totalPoints}`);
    console.log(`Total segments: ${result.metrics.totalSegments}`);
    console.log(`Paths: ${result.paths.length}`);

    // Contour details
    if (result.debug?.contours) {
      console.log('\n=== Contour Details ===');
      result.debug.contours.contours.forEach((c, i) => {
        console.log(`  Contour ${i}: ${c.points.length} points, isHole=${c.isHole}`);
      });
    }
  }
}

const avgTime = results.reduce((a, b) => a + b, 0) / results.length;
console.log(`\nAverage time over ${iterations} runs: ${avgTime.toFixed(2)}ms`);
