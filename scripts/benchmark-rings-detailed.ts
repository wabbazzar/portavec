/**
 * Detailed benchmark to isolate contour tracing bottleneck
 */
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { threshold } from '../src/algorithms/threshold';
import { extractContours, contourSignedArea, pointInContour, type Contour } from '../src/algorithms/contour-tracing/marching-squares';

// Read the PNG
const data = readFileSync('./test-images/concentric-rings-256.png');
const png = PNG.sync.read(data);

const imageData = {
  width: png.width,
  height: png.height,
  data: new Uint8ClampedArray(png.data),
  colorSpace: 'srgb' as const,
};

// Step 1: Threshold
const start1 = performance.now();
const thresholdResult = threshold(imageData, { method: 'otsu' });
const t1 = performance.now() - start1;
console.log(`Threshold: ${t1.toFixed(2)}ms`);

// Step 2: Extract contours WITHOUT hierarchy (just tracing)
const start2 = performance.now();

// Inline marching squares without hierarchy classification
const binary = thresholdResult.binary;
const width = imageData.width;
const height = imageData.height;

function getCellConfig(x: number, y: number): number {
  const getPixel = (px: number, py: number): number => {
    if (px < 0 || px >= width || py < 0 || py >= height) return 0;
    return (binary[py * width + px] ?? 0) > 0 ? 1 : 0;
  };
  let config = 0;
  if (getPixel(x, y) > 0) config |= 1;
  if (getPixel(x + 1, y) > 0) config |= 2;
  if (getPixel(x + 1, y + 1) > 0) config |= 4;
  if (getPixel(x, y + 1) > 0) config |= 8;
  return config;
}

// Count cells with edges
let cellsWithEdges = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const config = getCellConfig(x, y);
    if (config !== 0 && config !== 15) cellsWithEdges++;
  }
}
const t2a = performance.now() - start2;
console.log(`Cell scanning (${cellsWithEdges} edge cells): ${t2a.toFixed(2)}ms`);

// Full extraction with hierarchy
const start3 = performance.now();
const contours = extractContours(binary, width, height);
const t3 = performance.now() - start3;
console.log(`Full extractContours: ${t3.toFixed(2)}ms`);
console.log(`  Contours found: ${contours.length}`);

// Profile hierarchy classification separately
console.log('\n=== Hierarchy Classification Profile ===');

// Test point-in-contour performance
const testContour = contours[0]!;
const testPoint = { x: width / 2, y: height / 2 };

const picIterations = 10000;
const startPic = performance.now();
for (let i = 0; i < picIterations; i++) {
  pointInContour(testPoint, testContour.points);
}
const picTime = performance.now() - startPic;
console.log(`pointInContour (${testContour.points.length} points, ${picIterations} iterations): ${picTime.toFixed(2)}ms`);
console.log(`  Per call: ${(picTime / picIterations * 1000).toFixed(2)}µs`);

// Test signed area performance
const saIterations = 10000;
const startSa = performance.now();
for (let i = 0; i < saIterations; i++) {
  contourSignedArea(testContour.points);
}
const saTime = performance.now() - startSa;
console.log(`contourSignedArea (${testContour.points.length} points, ${saIterations} iterations): ${saTime.toFixed(2)}ms`);
console.log(`  Per call: ${(saTime / saIterations * 1000).toFixed(2)}µs`);

// Count hierarchy checks
const n = contours.length;
const hierarchyChecks = n * (n - 1); // Each contour checks against all others
console.log(`\nHierarchy checks needed: ${hierarchyChecks} (${n} contours)`);

// Simulate hierarchy classification
const startHierarchy = performance.now();
for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const a = contours[i]!;
    const b = contours[j]!;

    // Bounding box check
    if (a.bounds.minX < b.bounds.minX ||
        a.bounds.maxX > b.bounds.maxX ||
        a.bounds.minY < b.bounds.minY ||
        a.bounds.maxY > b.bounds.maxY) {
      continue;
    }

    // Point in polygon check
    if (a.points.length > 0) {
      pointInContour(a.points[0]!, b.points);
    }
  }
}
const hierarchyTime = performance.now() - startHierarchy;
console.log(`Hierarchy classification simulation: ${hierarchyTime.toFixed(2)}ms`);
