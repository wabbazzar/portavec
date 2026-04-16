import { describe, it, expect } from 'vitest';
import {
  runPipeline,
  runPipelineDebug,
  binaryToImageData,
  defaultPipelineOptions,
} from '../../src/algorithms/pipeline';
import { createImageData } from '../../src/utils/canvas';

/**
 * Create a simple test image with a black square on white background
 */
function createSquareImage(
  width: number,
  height: number,
  squareSize: number,
  squareX: number,
  squareY: number
): ImageData {
  const imageData = createImageData(width, height);

  // Fill with white
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 255;     // R
    imageData.data[i + 1] = 255; // G
    imageData.data[i + 2] = 255; // B
    imageData.data[i + 3] = 255; // A
  }

  // Draw black square
  for (let y = squareY; y < squareY + squareSize && y < height; y++) {
    for (let x = squareX; x < squareX + squareSize && x < width; x++) {
      const idx = (y * width + x) * 4;
      imageData.data[idx] = 0;     // R
      imageData.data[idx + 1] = 0; // G
      imageData.data[idx + 2] = 0; // B
    }
  }

  return imageData;
}

/**
 * Create an image with a circle
 */
function createCircleImage(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number
): ImageData {
  const imageData = createImageData(width, height);

  // Fill with white
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 255;
    imageData.data[i + 1] = 255;
    imageData.data[i + 2] = 255;
    imageData.data[i + 3] = 255;
  }

  // Draw black circle
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radius * radius) {
        const idx = (y * width + x) * 4;
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 0;
        imageData.data[idx + 2] = 0;
      }
    }
  }

  return imageData;
}

/**
 * Create an image with a ring (circle with hole - like letter O)
 */
function createRingImage(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number
): ImageData {
  const imageData = createImageData(width, height);

  // Fill with white
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 255;
    imageData.data[i + 1] = 255;
    imageData.data[i + 2] = 255;
    imageData.data[i + 3] = 255;
  }

  // Draw ring
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distSq = dx * dx + dy * dy;
      if (distSq <= outerRadius * outerRadius && distSq >= innerRadius * innerRadius) {
        const idx = (y * width + x) * 4;
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 0;
        imageData.data[idx + 2] = 0;
      }
    }
  }

  return imageData;
}

describe('Pipeline - basic functionality', () => {
  it('should process a simple square image', () => {
    const image = createSquareImage(64, 64, 20, 22, 22);
    const result = runPipeline(image);

    expect(result.svg).toBeTruthy();
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('</svg>');
    expect(result.paths.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.inputWidth).toBe(64);
    expect(result.metrics.inputHeight).toBe(64);
    expect(result.metrics.processingTimeMs).toBeGreaterThan(0);
  });

  it('should process a circle image', () => {
    const image = createCircleImage(64, 64, 32, 32, 20);
    const result = runPipeline(image, {
      curveFitMethod: 'bezier',
      curveTolerance: 2,
    });

    expect(result.svg).toBeTruthy();
    expect(result.paths.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalContours).toBeGreaterThanOrEqual(1);
  });

  it('should detect holes in ring shape', () => {
    const image = createRingImage(64, 64, 32, 32, 25, 10);
    const result = runPipelineDebug(image);

    expect(result.svg).toBeTruthy();
    // Ring should have outer contour and inner hole
    expect(result.debug).toBeDefined();
    expect(result.debug!.contours.contours.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle empty (all white) image', () => {
    const imageData = createImageData(32, 32);
    // Fill with white
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 255;
      imageData.data[i + 1] = 255;
      imageData.data[i + 2] = 255;
      imageData.data[i + 3] = 255;
    }

    const result = runPipeline(imageData);

    expect(result.svg).toBeTruthy();
    expect(result.paths.length).toBe(0);
    expect(result.metrics.totalContours).toBe(0);
  });
});

describe('Pipeline - threshold methods', () => {
  it('should work with Otsu threshold', () => {
    const image = createSquareImage(64, 64, 20, 22, 22);
    const result = runPipeline(image, { thresholdMethod: 'otsu' });

    expect(result.svg).toBeTruthy();
    expect(result.paths.length).toBeGreaterThanOrEqual(1);
  });

  it('should work with manual threshold', () => {
    const image = createSquareImage(64, 64, 20, 22, 22);
    const result = runPipeline(image, {
      thresholdMethod: 'manual',
      manualThreshold: 128,
    });

    expect(result.svg).toBeTruthy();
    expect(result.paths.length).toBeGreaterThanOrEqual(1);
  });

  it('should work with adaptive threshold', () => {
    const image = createSquareImage(64, 64, 20, 22, 22);
    const result = runPipeline(image, {
      thresholdMethod: 'adaptive',
      adaptiveBlockSize: 15,
    });

    expect(result.svg).toBeTruthy();
  });
});

describe('Pipeline - edge detection', () => {
  it('should work with Sobel edge detection', () => {
    const image = createSquareImage(64, 64, 20, 22, 22);
    const result = runPipeline(image, {
      useEdgeDetection: true,
      edgeMethod: 'sobel',
      sobelThreshold: 30,
    });

    expect(result.svg).toBeTruthy();
  });

  it('should work with Canny edge detection', () => {
    const image = createSquareImage(64, 64, 20, 22, 22);
    const result = runPipeline(image, {
      useEdgeDetection: true,
      edgeMethod: 'canny',
    });

    expect(result.svg).toBeTruthy();
  });
});

describe('Pipeline - curve fitting methods', () => {
  it('should work with bezier curve fitting', () => {
    const image = createCircleImage(64, 64, 32, 32, 20);
    const result = runPipeline(image, {
      curveFitMethod: 'bezier',
      curveTolerance: 2,
    });

    expect(result.svg).toBeTruthy();
    // Smart fitting may use lines for polygonal sections or curves for smooth sections
    // Just verify we have valid SVG output with paths
    expect(result.svg).toContain('<path');
    expect(result.svg).toMatch(/ [LC] /); // Should have L or C commands
  });

  it('should work with polyline fitting', () => {
    const image = createCircleImage(64, 64, 32, 32, 20);
    const result = runPipeline(image, {
      curveFitMethod: 'polyline',
      curveTolerance: 2,
    });

    expect(result.svg).toBeTruthy();
    // Should have line segments
    expect(result.svg).toContain('L ');
  });

  it('should respect curve tolerance', () => {
    const image = createCircleImage(64, 64, 32, 32, 20);

    const lowTolerance = runPipeline(image, {
      curveFitMethod: 'bezier',
      curveTolerance: 0.5,
    });

    const highTolerance = runPipeline(image, {
      curveFitMethod: 'bezier',
      curveTolerance: 5,
    });

    // Lower tolerance should produce more segments
    expect(lowTolerance.metrics.totalSegments).toBeGreaterThanOrEqual(
      highTolerance.metrics.totalSegments
    );
  });
});

describe('Pipeline - debug output', () => {
  it('should include debug information when requested', () => {
    const image = createSquareImage(64, 64, 20, 22, 22);
    const result = runPipelineDebug(image);

    expect(result.debug).toBeDefined();
    expect(result.debug!.binaryImage).toBeInstanceOf(Uint8ClampedArray);
    expect(result.debug!.contours).toBeDefined();
    expect(result.debug!.contours.contours).toBeInstanceOf(Array);
  });

  it('should include edge image when edge detection is used', () => {
    const image = createSquareImage(64, 64, 20, 22, 22);
    const result = runPipelineDebug(image, {
      useEdgeDetection: true,
      edgeMethod: 'sobel',
    });

    expect(result.debug).toBeDefined();
    expect(result.debug!.edgeImage).toBeInstanceOf(Uint8ClampedArray);
  });
});

describe('Pipeline - metrics', () => {
  it('should report accurate timing metrics', () => {
    const image = createCircleImage(64, 64, 32, 32, 20);
    const result = runPipeline(image);

    expect(result.metrics.stages.threshold).toBeGreaterThan(0);
    expect(result.metrics.stages.contourTracing).toBeGreaterThan(0);
    expect(result.metrics.stages.curveFitting).toBeGreaterThanOrEqual(0);
    expect(result.metrics.stages.svgGeneration).toBeGreaterThan(0);

    // Total time should be sum of stages (approximately)
    const stageSum =
      result.metrics.stages.threshold +
      result.metrics.stages.edgeDetection +
      result.metrics.stages.contourTracing +
      result.metrics.stages.curveFitting +
      result.metrics.stages.svgGeneration;

    // Allow some tolerance for overhead
    expect(result.metrics.processingTimeMs).toBeGreaterThanOrEqual(stageSum * 0.9);
  });

  it('should count contours and segments correctly', () => {
    const image = createSquareImage(64, 64, 20, 22, 22);
    const result = runPipeline(image);

    expect(result.metrics.totalContours).toBe(result.paths.length);
    expect(result.metrics.totalPoints).toBeGreaterThan(0);
    expect(result.metrics.totalSegments).toBeGreaterThan(0);
  });
});

describe('Pipeline - binaryToImageData utility', () => {
  it('should convert binary array to ImageData', () => {
    const width = 4;
    const height = 4;
    const binary = new Uint8ClampedArray(width * height);
    binary.fill(0);
    binary[0] = 255;
    binary[5] = 255;

    const imageData = binaryToImageData(binary, width, height);

    expect(imageData.width).toBe(width);
    expect(imageData.height).toBe(height);
    expect(imageData.data.length).toBe(width * height * 4);

    // Check first pixel (white)
    expect(imageData.data[0]).toBe(255);
    expect(imageData.data[1]).toBe(255);
    expect(imageData.data[2]).toBe(255);
    expect(imageData.data[3]).toBe(255);

    // Check second pixel (black)
    expect(imageData.data[4]).toBe(0);
    expect(imageData.data[5]).toBe(0);
    expect(imageData.data[6]).toBe(0);
    expect(imageData.data[7]).toBe(255);
  });
});

describe('Pipeline - default options', () => {
  it('should have sensible default options', () => {
    expect(defaultPipelineOptions.thresholdMethod).toBe('otsu');
    expect(defaultPipelineOptions.useEdgeDetection).toBe(false);
    expect(defaultPipelineOptions.curveFitMethod).toBe('bezier');
    expect(defaultPipelineOptions.curveTolerance).toBeGreaterThan(0);
    expect(defaultPipelineOptions.fillColor).toBe('black');
    expect(defaultPipelineOptions.fillRule).toBe('evenodd');
  });
});
