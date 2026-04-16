/**
 * Vectorization Pipeline
 *
 * Orchestrates the complete raster-to-vector conversion process:
 * 1. Threshold: Convert to binary image
 * 2. Edge Detection (optional): Find edges in the binary image
 * 3. Contour Tracing: Extract contours using marching squares
 * 4. Curve Fitting: Convert contours to smooth Bézier paths
 * 5. SVG Generation: Create final SVG output
 */

import { threshold, type ThresholdOptions, type ThresholdMethod } from './threshold';
import { detectEdges, type EdgeMethod, type EdgeDetectionOptions } from './edge-detection';
import { traceContours, type ContourTracingOptions, type ContourTracingResult } from './contour-tracing';
import { fitCurves, pathToSvgData, type CurveFitMethod } from './curve-fitting';
import { createImageData } from '../utils/canvas';
import { createSvgDocument, type BezierPath, type Point } from '../utils/svg';

export interface PipelineOptions {
  // Threshold options
  thresholdMethod: ThresholdMethod;
  manualThreshold?: number;
  adaptiveBlockSize?: number;
  adaptiveC?: number;

  // Edge detection options (optional - can skip for direct contour tracing)
  useEdgeDetection: boolean;
  edgeMethod?: EdgeMethod;
  sobelThreshold?: number;
  cannySigma?: number;
  cannyLowThreshold?: number;
  cannyHighThreshold?: number;

  // Contour tracing options
  minContourLength?: number;
  simplifyTolerance?: number;

  // Curve fitting options
  curveFitMethod: CurveFitMethod;
  curveTolerance: number;

  // SVG output options
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  fillRule?: 'nonzero' | 'evenodd';
}

export interface PipelineResult {
  // Output
  svg: string;
  paths: BezierPath[];

  // Metrics
  metrics: {
    inputWidth: number;
    inputHeight: number;
    totalContours: number;
    totalPoints: number;
    totalSegments: number;
    processingTimeMs: number;
    stages: {
      threshold: number;
      edgeDetection: number;
      contourTracing: number;
      curveFitting: number;
      svgGeneration: number;
    };
  };

  // Intermediate data for debugging/visualization
  debug?: {
    binaryImage: Uint8ClampedArray;
    edgeImage?: Uint8ClampedArray;
    contours: ContourTracingResult;
  };
}

/**
 * Default pipeline options
 */
export const defaultPipelineOptions: PipelineOptions = {
  thresholdMethod: 'otsu',
  useEdgeDetection: false,
  minContourLength: 3,  // Minimum 3 points for a closed shape
  simplifyTolerance: 0.5,  // Less aggressive simplification (in pixels)
  curveFitMethod: 'bezier',
  curveTolerance: 2,
  fillColor: 'black',
  strokeColor: 'none',
  strokeWidth: 1,
  fillRule: 'evenodd',
};

/**
 * Run the complete vectorization pipeline
 *
 * @param imageData - Input image data
 * @param options - Pipeline configuration options
 * @param includeDebug - Include intermediate data in result
 * @returns Pipeline result with SVG and metrics
 */
export function runPipeline(
  imageData: ImageData,
  options: Partial<PipelineOptions> = {},
  includeDebug: boolean = false
): PipelineResult {
  const opts = { ...defaultPipelineOptions, ...options };
  const { width, height } = imageData;
  const startTime = performance.now();
  const stageTimes = {
    threshold: 0,
    edgeDetection: 0,
    contourTracing: 0,
    curveFitting: 0,
    svgGeneration: 0,
  };

  // Stage 1: Threshold to binary
  let stageStart = performance.now();

  const thresholdOpts: ThresholdOptions = {
    method: opts.thresholdMethod,
    manualValue: opts.manualThreshold,
    windowSize: opts.adaptiveBlockSize,
    constant: opts.adaptiveC,
  };

  const thresholdResult = threshold(imageData, thresholdOpts);
  const binaryImage = thresholdResult.binary;
  stageTimes.threshold = performance.now() - stageStart;

  // Stage 2: Edge detection (optional)
  let workingImage = binaryImage;
  let edgeImage: Uint8ClampedArray | undefined;

  if (opts.useEdgeDetection && opts.edgeMethod) {
    stageStart = performance.now();

    // Create ImageData from binary for edge detection
    const binaryImageData = createImageData(width, height);
    for (let i = 0; i < binaryImage.length; i++) {
      const v = binaryImage[i]!;
      const idx = i * 4;
      binaryImageData.data[idx] = v;
      binaryImageData.data[idx + 1] = v;
      binaryImageData.data[idx + 2] = v;
      binaryImageData.data[idx + 3] = 255;
    }

    const edgeOpts: EdgeDetectionOptions = {
      method: opts.edgeMethod,
      sobelThreshold: opts.sobelThreshold,
      sigma: opts.cannySigma,
      lowThreshold: opts.cannyLowThreshold,
      highThreshold: opts.cannyHighThreshold,
    };

    const edgeResult = detectEdges(binaryImageData, edgeOpts);
    workingImage = edgeResult.edges;
    edgeImage = edgeResult.edges;
    stageTimes.edgeDetection = performance.now() - stageStart;
  }

  // Stage 3: Contour tracing
  stageStart = performance.now();

  const traceOpts: ContourTracingOptions = {
    minLength: opts.minContourLength,
    simplifyTolerance: opts.simplifyTolerance,
  };

  const contourResult = traceContours(workingImage, width, height, traceOpts);
  stageTimes.contourTracing = performance.now() - stageStart;

  // Stage 4: Curve fitting
  stageStart = performance.now();

  const paths: BezierPath[] = [];
  let totalSegments = 0;

  for (const contour of contourResult.contours) {
    if (contour.points.length < 3) continue;

    const fitResult = fitCurves(contour.points, {
      method: opts.curveFitMethod,
      tolerance: opts.curveTolerance,
      closed: contour.closed,
    });

    fitResult.path.isHole = contour.isHole;
    paths.push(fitResult.path);
    totalSegments += fitResult.path.segments.length;
  }

  stageTimes.curveFitting = performance.now() - stageStart;

  // Stage 5: SVG generation
  stageStart = performance.now();

  const svgPaths: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]!;
    const contour = contourResult.contours[i]!;

    // Use first point of contour as start point
    const startPoint: Point = contour.points[0] ?? { x: 0, y: 0 };
    const pathData = pathToSvgData(path, startPoint);

    if (pathData) {
      svgPaths.push(pathData);
    }
  }

  const svg = createSvgDocument(svgPaths, width, height, {
    fill: opts.fillColor,
    stroke: opts.strokeColor,
    strokeWidth: opts.strokeWidth,
    fillRule: opts.fillRule,
  });

  stageTimes.svgGeneration = performance.now() - stageStart;

  const totalTime = performance.now() - startTime;

  // Build result
  const result: PipelineResult = {
    svg,
    paths,
    metrics: {
      inputWidth: width,
      inputHeight: height,
      totalContours: contourResult.contours.length,
      totalPoints: contourResult.totalPoints,
      totalSegments,
      processingTimeMs: totalTime,
      stages: stageTimes,
    },
  };

  if (includeDebug) {
    result.debug = {
      binaryImage,
      edgeImage,
      contours: contourResult,
    };
  }

  return result;
}

/**
 * Run pipeline with timing breakdown for performance analysis
 */
export function runPipelineWithTiming(
  imageData: ImageData,
  options: Partial<PipelineOptions> = {}
): PipelineResult {
  return runPipeline(imageData, options, false);
}

/**
 * Run pipeline and return debug information
 */
export function runPipelineDebug(
  imageData: ImageData,
  options: Partial<PipelineOptions> = {}
): PipelineResult {
  return runPipeline(imageData, options, true);
}

/**
 * Convert a binary image to ImageData for visualization
 */
export function binaryToImageData(
  binary: Uint8ClampedArray,
  width: number,
  height: number
): ImageData {
  const imageData = new ImageData(width, height);
  for (let i = 0; i < binary.length; i++) {
    const v = binary[i]!;
    const idx = i * 4;
    imageData.data[idx] = v;
    imageData.data[idx + 1] = v;
    imageData.data[idx + 2] = v;
    imageData.data[idx + 3] = 255;
  }
  return imageData;
}

/**
 * Render an SVG string to ImageData for comparison
 * Note: This requires a browser environment with canvas support
 */
export async function renderSvgToImageData(
  svg: string,
  width: number,
  height: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to create canvas context'));
        return;
      }

      // Fill with white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);

      // Draw SVG
      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG'));
    };

    img.src = url;
  });
}
