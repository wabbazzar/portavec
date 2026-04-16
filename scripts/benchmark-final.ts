/**
 * Final benchmark showing performance improvements
 */
import { readFileSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';
import { runPipeline } from '../src/algorithms/pipeline';

const data = readFileSync('./test-images/concentric-rings-256.png');
const png = PNG.sync.read(data);

const imageData = {
  width: png.width,
  height: png.height,
  data: new Uint8ClampedArray(png.data),
  colorSpace: 'srgb' as const,
};

console.log('=== Concentric Rings Performance Benchmark ===');
console.log(`Image: ${png.width}x${png.height} (${png.width * png.height} pixels)`);
console.log('');

// Warmup
for (let i = 0; i < 3; i++) {
  runPipeline(imageData);
}

// Benchmark
const iterations = 10;
const times: number[] = [];

for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  const result = runPipeline(imageData);
  times.push(performance.now() - start);
}

const avg = times.reduce((a, b) => a + b, 0) / times.length;
const min = Math.min(...times);
const max = Math.max(...times);

console.log(`Iterations: ${iterations}`);
console.log(`Average: ${avg.toFixed(2)}ms`);
console.log(`Min: ${min.toFixed(2)}ms`);
console.log(`Max: ${max.toFixed(2)}ms`);
console.log('');

// Final result with breakdown
const result = runPipeline(imageData);
console.log('=== Pipeline Stage Breakdown ===');
console.log(`Threshold: ${result.metrics.stages.threshold.toFixed(2)}ms`);
console.log(`Edge detection: ${result.metrics.stages.edgeDetection.toFixed(2)}ms`);
console.log(`Contour tracing: ${result.metrics.stages.contourTracing.toFixed(2)}ms`);
console.log(`Curve fitting: ${result.metrics.stages.curveFitting.toFixed(2)}ms`);
console.log(`SVG generation: ${result.metrics.stages.svgGeneration.toFixed(2)}ms`);
console.log('');
console.log('=== Output Quality ===');
console.log(`Contours: ${result.metrics.totalContours}`);
console.log(`Total points: ${result.metrics.totalPoints}`);
console.log(`Total segments: ${result.metrics.totalSegments}`);

// Save SVG for inspection
writeFileSync('./test-output/concentric-rings-result.svg', result.svg);
console.log('\nSVG saved to: test-output/concentric-rings-result.svg');
