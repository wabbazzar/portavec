/**
 * Marching Squares Algorithm for Contour Tracing
 *
 * Extracts contours (boundaries) from binary images by examining 2x2 pixel
 * neighborhoods and determining the edge configuration.
 *
 * Algorithm:
 * 1. Scan image looking for boundary pixels (foreground adjacent to background)
 * 2. For each 2x2 cell, classify into one of 16 configurations
 * 3. Each configuration maps to specific edge segments
 * 4. Connect segments into continuous contours
 *
 * The 16 configurations are based on which corners are "inside" (foreground):
 *   0000 = empty        0001 = bottom-left   0010 = bottom-right  ...
 *   1111 = full         etc.
 *
 * Reference: Lorensen & Cline (1987). "Marching Cubes" (2D variant)
 */

import type { Point } from '../../utils/svg';

/**
 * A single contour - a closed or open path of points
 */
export interface Contour {
  /** Points forming the contour (in order) */
  points: Point[];
  /** Whether the contour is closed (first point connects to last) */
  closed: boolean;
  /** Whether this contour is a hole (inner boundary) */
  isHole: boolean;
  /** Index of parent contour (-1 if no parent/outer contour) */
  parentIndex: number;
  /** Bounding box */
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

/**
 * Get the marching squares configuration for a 2x2 cell
 * Returns a 4-bit value where each bit represents a corner:
 *   bit 0 (1)  = top-left
 *   bit 1 (2)  = top-right
 *   bit 2 (4)  = bottom-right
 *   bit 3 (8)  = bottom-left
 */
function getCellConfig(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const getPixel = (px: number, py: number): number => {
    if (px < 0 || px >= width || py < 0 || py >= height) return 0;
    return (binary[py * width + px] ?? 0) > 0 ? 1 : 0;
  };

  let config = 0;
  if (getPixel(x, y) > 0) config |= 1;       // top-left
  if (getPixel(x + 1, y) > 0) config |= 2;   // top-right
  if (getPixel(x + 1, y + 1) > 0) config |= 4; // bottom-right
  if (getPixel(x, y + 1) > 0) config |= 8;   // bottom-left

  return config;
}

/**
 * Edge lookup table: maps cell configuration to edges
 * Each entry contains pairs of edge indices that should be connected
 * Edge indices: 0=top, 1=right, 2=bottom, 3=left
 */
const EDGE_TABLE: number[][] = [
  [],           // 0: empty
  [3, 2],       // 1: bottom-left only
  [2, 1],       // 2: bottom-right only
  [3, 1],       // 3: bottom row
  [0, 1],       // 4: top-right only
  [0, 1, 3, 2], // 5: saddle (diagonal)
  [0, 2],       // 6: right column
  [0, 3],       // 7: all except top-left
  [0, 3],       // 8: top-left only
  [0, 2],       // 9: left column
  [0, 3, 2, 1], // 10: saddle (diagonal)
  [0, 1],       // 11: all except top-right
  [3, 1],       // 12: top row
  [2, 1],       // 13: all except bottom-right
  [3, 2],       // 14: all except bottom-left
  [],           // 15: full
];

/**
 * Get the midpoint of an edge for a cell at (x, y)
 * Edge indices: 0=top, 1=right, 2=bottom, 3=left
 */
function getEdgePoint(x: number, y: number, edge: number): Point {
  switch (edge) {
    case 0: return { x: x + 0.5, y };       // top edge midpoint
    case 1: return { x: x + 1, y: y + 0.5 }; // right edge midpoint
    case 2: return { x: x + 0.5, y: y + 1 }; // bottom edge midpoint
    case 3: return { x, y: y + 0.5 };       // left edge midpoint
    default: return { x: x + 0.5, y: y + 0.5 };
  }
}

/**
 * Trace a single contour starting from a given cell and edge
 */
function traceContour(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  startEdge: number,
  visited: Set<string>
): Point[] {
  const points: Point[] = [];
  let x = startX;
  let y = startY;
  let entryEdge = startEdge;

  // Direction to move based on exit edge
  // If we exit through edge 0 (top), we move up (y - 1)
  // If we exit through edge 1 (right), we move right (x + 1)
  // etc.
  const dx = [0, 1, 0, -1];
  const dy = [-1, 0, 1, 0];

  // Entry edge when coming from a direction
  // If we exit through top (0), we enter the next cell from bottom (2)
  const oppositeEdge = [2, 3, 0, 1];

  const maxIterations = width * height * 4; // Safety limit
  let iterations = 0;

  do {
    const config = getCellConfig(binary, width, height, x, y);
    const edges = EDGE_TABLE[config];

    if (!edges || edges.length === 0) break;

    // Find which edge pair to use based on entry edge
    let exitEdge = -1;

    for (let i = 0; i < edges.length; i += 2) {
      const e1 = edges[i]!;
      const e2 = edges[i + 1]!;

      if (e1 === entryEdge) {
        exitEdge = e2;
        break;
      }
      if (e2 === entryEdge) {
        exitEdge = e1;
        break;
      }
    }

    // For saddle points or if no matching entry, use first edge pair
    if (exitEdge === -1 && edges.length >= 2) {
      exitEdge = edges[0] === entryEdge ? edges[1]! : edges[0]!;
    }

    if (exitEdge === -1) break;

    // Add the exit point
    const point = getEdgePoint(x, y, exitEdge);
    points.push(point);

    // Mark this cell-edge as visited
    visited.add(`${x},${y},${exitEdge}`);

    // Move to next cell
    x += dx[exitEdge]!;
    y += dy[exitEdge]!;
    entryEdge = oppositeEdge[exitEdge]!;

    iterations++;
    if (iterations > maxIterations) break;

  } while (!(x === startX && y === startY && entryEdge === startEdge));

  return points;
}

/**
 * Extract all contours from a binary image using marching squares
 */
export function extractContours(
  binary: Uint8ClampedArray,
  width: number,
  height: number
): Contour[] {
  const contours: Contour[] = [];
  const visited = new Set<string>();

  // Scan for contour starting points
  // A starting point is a cell with a non-empty, non-full configuration
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const config = getCellConfig(binary, width, height, x, y);

      // Skip empty (0) and full (15) cells
      if (config === 0 || config === 15) continue;

      const edges = EDGE_TABLE[config];
      if (!edges || edges.length === 0) continue;

      // Try to start a contour from each unvisited edge
      for (let i = 0; i < edges.length; i += 2) {
        const startEdge = edges[i]!;
        const key = `${x},${y},${startEdge}`;

        if (visited.has(key)) continue;

        const points = traceContour(binary, width, height, x, y, startEdge, visited);

        if (points.length >= 3) {
          // Calculate bounding box
          let minX = Infinity, minY = Infinity;
          let maxX = -Infinity, maxY = -Infinity;

          for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }

          contours.push({
            points,
            closed: true,
            isHole: false, // Will be determined later
            parentIndex: -1,
            bounds: { minX, minY, maxX, maxY },
          });
        }
      }
    }
  }

  // Determine hole relationships
  classifyContourHierarchy(contours);

  return contours;
}

/**
 * Calculate the signed area of a contour (positive = CCW, negative = CW)
 * Uses the shoelace formula
 */
export function contourSignedArea(points: Point[]): number {
  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;
    area += curr.x * next.y - next.x * curr.y;
  }

  return area / 2;
}

/**
 * Check if a point is inside a contour using ray casting
 */
export function pointInContour(point: Point, contour: Point[]): boolean {
  let inside = false;
  const n = contour.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = contour[i]!;
    const pj = contour[j]!;

    if (
      ((pi.y > point.y) !== (pj.y > point.y)) &&
      (point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x)
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if contour A is inside contour B
 */
function contourInsideContour(a: Contour, b: Contour): boolean {
  // Quick bounding box check
  if (
    a.bounds.minX < b.bounds.minX ||
    a.bounds.maxX > b.bounds.maxX ||
    a.bounds.minY < b.bounds.minY ||
    a.bounds.maxY > b.bounds.maxY
  ) {
    return false;
  }

  // Check if a sample point from A is inside B
  if (a.points.length === 0) return false;
  return pointInContour(a.points[0]!, b.points);
}

/**
 * Classify contours as holes and establish parent-child relationships
 * Outer contours have CCW winding, holes have CW winding
 */
function classifyContourHierarchy(contours: Contour[]): void {
  // First, determine winding direction
  for (const contour of contours) {
    const area = contourSignedArea(contour.points);
    // In image coordinates (Y increases downward), CW is positive
    // Outer contours typically trace CW, holes trace CCW
    contour.isHole = area > 0;
  }

  // Find parent-child relationships
  for (let i = 0; i < contours.length; i++) {
    const contour = contours[i]!;

    // Find the smallest contour that contains this one
    let smallestParent = -1;
    let smallestArea = Infinity;

    for (let j = 0; j < contours.length; j++) {
      if (i === j) continue;

      const candidate = contours[j]!;
      if (contourInsideContour(contour, candidate)) {
        const area = Math.abs(contourSignedArea(candidate.points));
        if (area < smallestArea) {
          smallestArea = area;
          smallestParent = j;
        }
      }
    }

    contour.parentIndex = smallestParent;

    // If inside another contour, flip the hole status
    // (a hole inside a hole is not a hole)
    if (smallestParent !== -1) {
      const parent = contours[smallestParent]!;
      contour.isHole = !parent.isHole;
    }
  }
}

/**
 * Simplify contour by removing points that are nearly collinear
 */
export function simplifyContour(
  points: Point[],
  tolerance: number = 1.0
): Point[] {
  if (points.length <= 3) return points;

  const result: Point[] = [points[0]!];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;

    // Calculate perpendicular distance from curr to line prev-next
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) continue;

    const distance = Math.abs(
      (next.y - prev.y) * curr.x -
      (next.x - prev.x) * curr.y +
      next.x * prev.y -
      next.y * prev.x
    ) / len;

    if (distance > tolerance) {
      result.push(curr);
    }
  }

  // Always include last point for closed contours
  result.push(points[points.length - 1]!);

  return result;
}
