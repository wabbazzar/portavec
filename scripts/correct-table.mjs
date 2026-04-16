/**
 * Generate the CORRECT NEXT_EDGE table for marching squares
 *
 * Bit definitions:
 *   bit 0 (1)  = top-left = pixel at (x, y)
 *   bit 1 (2)  = top-right = pixel at (x+1, y)
 *   bit 2 (4)  = bottom-right = pixel at (x+1, y+1)
 *   bit 3 (8)  = bottom-left = pixel at (x, y+1)
 *
 * Edge indices: 0=top, 1=right, 2=bottom, 3=left
 *
 * For CW tracing with foreground on the RIGHT side:
 * - When we trace the contour, the filled region should be on our right
 */

// First, determine which edges each config crosses
function getEdgesCrossed(config) {
  const TL = (config & 1) > 0;
  const TR = (config & 2) > 0;
  const BR = (config & 4) > 0;
  const BL = (config & 8) > 0;

  const edges = [];
  if (TL !== TR) edges.push(0);  // top edge crossed
  if (TR !== BR) edges.push(1);  // right edge crossed
  if (BR !== BL) edges.push(2);  // bottom edge crossed
  if (BL !== TL) edges.push(3);  // left edge crossed

  return edges;
}

// For CW tracing with foreground on right:
// When entering an edge, we need to exit through the correct edge
// such that the foreground (filled pixels) stay on our right side.
//
// The key insight: as we walk along the contour, the FILLED region
// should always be on our RIGHT. So when entering from edge E,
// we need to find which exit edge keeps the filled region on our right.

function getNextEdge(config, entryEdge) {
  const edges = getEdgesCrossed(config);

  // If this entry edge isn't crossed, it's invalid
  if (!edges.includes(entryEdge)) return -1;

  // For 2-edge cases (non-saddle), there's only one other edge
  if (edges.length === 2) {
    return edges.find(e => e !== entryEdge);
  }

  // For 4-edge cases (saddles), we need to pick based on keeping foreground right
  // Saddle configs: 5 (TL+BR) and 10 (TR+BL)

  if (config === 5) {
    // Config 5: TL and BR are filled
    // +---+---+
    // | X | . |
    // +---+---+
    // | . | X |
    // +---+---+
    // Two separate contour segments:
    // - Around TL: top(0) <-> left(3)
    // - Around BR: right(1) <-> bottom(2)
    // For CW with foreground on right:
    // - Entry from top(0): TL is below and left, to keep it right, go left(3)
    // - Entry from left(3): TL is above and right, to keep it right, go top(0)
    // - Entry from right(1): BR is below and left, to keep it right, go bottom(2)
    // - Entry from bottom(2): BR is above and right, to keep it right, go right(1)
    switch (entryEdge) {
      case 0: return 3;  // top -> left (around TL)
      case 1: return 2;  // right -> bottom (around BR)
      case 2: return 1;  // bottom -> right (around BR)
      case 3: return 0;  // left -> top (around TL)
    }
  }

  if (config === 10) {
    // Config 10: TR and BL are filled
    // +---+---+
    // | . | X |
    // +---+---+
    // | X | . |
    // +---+---+
    // Two separate contour segments:
    // - Around TR: top(0) <-> right(1)
    // - Around BL: bottom(2) <-> left(3)
    // For CW with foreground on right:
    // - Entry from top(0): TR is below and right, to keep it right, go right(1)
    // - Entry from right(1): TR is above and left, to keep it right, go top(0)
    // - Entry from bottom(2): BL is above and left, to keep it right, go left(3)
    // - Entry from left(3): BL is below and right, to keep it right, go bottom(2)
    switch (entryEdge) {
      case 0: return 1;  // top -> right (around TR)
      case 1: return 0;  // right -> top (around TR)
      case 2: return 3;  // bottom -> left (around BL)
      case 3: return 2;  // left -> bottom (around BL)
    }
  }

  return -1;
}

console.log("=== CORRECT NEXT_EDGE TABLE ===\n");

const EDGE_NAMES = ['top', 'right', 'bottom', 'left'];
const table = [];

for (let config = 0; config < 16; config++) {
  const edges = getEdgesCrossed(config);
  const row = [];

  for (let entry = 0; entry < 4; entry++) {
    const exit = getNextEdge(config, entry);
    row.push(exit);
  }

  table.push(row);

  const TL = (config & 1) ? 'X' : '.';
  const TR = (config & 2) ? 'X' : '.';
  const BR = (config & 4) ? 'X' : '.';
  const BL = (config & 8) ? 'X' : '.';

  console.log(`Config ${config.toString().padStart(2)}: [${row.map(x => x.toString().padStart(2)).join(', ')}]  edges: ${edges.map(e => EDGE_NAMES[e]).join(', ') || 'none'}  ${TL}${TR}/${BL}${BR}`);
}

console.log("\n\nconst NEXT_EDGE: number[][] = [");
for (let i = 0; i < 16; i++) {
  const row = table[i];
  const TL = (i & 1) ? 'X' : '.';
  const TR = (i & 2) ? 'X' : '.';
  const BR = (i & 4) ? 'X' : '.';
  const BL = (i & 8) ? 'X' : '.';
  console.log(`  [${row.map(x => x.toString().padStart(2)).join(', ')}],  // ${i}: ${TL}${TR}/${BL}${BR}`);
}
console.log("];");
