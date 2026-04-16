/**
 * Visualize all 16 marching squares configurations and determine
 * correct edge transitions for clockwise tracing (foreground on right)
 */

console.log("Marching Squares Edge Transitions");
console.log("==================================\n");
console.log("Cell layout: pixels at (x,y), (x+1,y), (x+1,y+1), (x,y+1)");
console.log("Config bits: TL=1, TR=2, BR=4, BL=8");
console.log("Edges: 0=top, 1=right, 2=bottom, 3=left");
console.log("\nTracing CLOCKWISE with foreground on RIGHT side.\n");

// For each config, determine which edges the contour crosses
// and the correct entry->exit mapping for CW tracing

for (let config = 0; config < 16; config++) {
  const TL = (config & 1) ? 'X' : '.';
  const TR = (config & 2) ? 'X' : '.';
  const BR = (config & 4) ? 'X' : '.';
  const BL = (config & 8) ? 'X' : '.';

  console.log(`Config ${config}:`);
  console.log(`  +---+---+`);
  console.log(`  | ${TL} | ${TR} |`);
  console.log(`  +---+---+`);
  console.log(`  | ${BL} | ${BR} |`);
  console.log(`  +---+---+`);

  // Determine which edges the contour crosses
  // An edge is crossed if the two corners on that edge have different values
  const topCrossed = (config & 1) !== ((config & 2) >> 1);  // TL != TR
  const rightCrossed = (config & 2) !== ((config & 4) >> 1); // TR != BR
  const bottomCrossed = (config & 4) !== ((config & 8) >> 1); // BR != BL
  const leftCrossed = (config & 8) !== ((config & 1) << 3);   // BL != TL

  // Actually let me recalculate this properly
  // Edge is crossed if corners on either side of edge differ
  const topEdge = ((config & 1) > 0) !== ((config & 2) > 0);      // TL vs TR
  const rightEdge = ((config & 2) > 0) !== ((config & 4) > 0);    // TR vs BR
  const bottomEdge = ((config & 4) > 0) !== ((config & 8) > 0);   // BR vs BL
  const leftEdge = ((config & 8) > 0) !== ((config & 1) > 0);     // BL vs TL

  const edges = [];
  if (topEdge) edges.push('top(0)');
  if (rightEdge) edges.push('right(1)');
  if (bottomEdge) edges.push('bottom(2)');
  if (leftEdge) edges.push('left(3)');

  console.log(`  Edges crossed: ${edges.length > 0 ? edges.join(', ') : 'none'}`);

  // For non-saddle cases (exactly 2 edges), determine the CW direction
  if (edges.length === 2) {
    // The contour goes from one edge to the other
    // For CW tracing, foreground should be on the right
    // This means we trace around the foreground region

    // Determine which corners are filled
    const filled = [];
    if (config & 1) filled.push('TL');
    if (config & 2) filled.push('TR');
    if (config & 4) filled.push('BR');
    if (config & 8) filled.push('BL');

    console.log(`  Filled corners: ${filled.join(', ')}`);

    // The correct transition depends on which side the foreground is
    // For CW tracing with foreground on right:
    // - We walk along the edge with foreground on our right
    // - Entry edge -> Exit edge in the direction that keeps foreground right
  }

  console.log();
}

// Now let's manually work out the correct NEXT_EDGE table
console.log("\n\n=== CORRECT NEXT_EDGE TABLE ===\n");
console.log("For CW tracing with foreground on RIGHT side:\n");

// Let me think about this more carefully for each config
// The key insight: in marching squares, each cell with a crossing
// has one or two line segments. The segment connects edge midpoints.
// When tracing CW around the foreground:
// - We enter a cell from some edge
// - We need to exit through another edge such that foreground stays on our right

// For config 1 (BL only):
// Filled: BL. Contour crosses LEFT and BOTTOM.
// Tracing CW around the filled BL corner:
// - Coming from above (entering through BOTTOM), we exit through LEFT
// - Coming from right (entering through LEFT), we exit through BOTTOM
// Wait, that's entry->exit, but entry means "coming from that direction into the cell"
// Entry from BOTTOM (2) means we came from the cell below and entered through the bottom edge
// We need to exit keeping foreground (BL) on the right

console.log("Config 1 (BL only): contour crosses LEFT(3) and BOTTOM(2)");
console.log("  - Entry from bottom(2): foreground is bottom-left, so exit left(3) to keep it on right");
console.log("  - Entry from left(3): foreground is bottom-left, so exit bottom(2) to keep it on right");
console.log("  NEXT_EDGE[1] = [-1, -1, 3, 2]  -- CORRECT");

console.log("\nConfig 8 (TL only): contour crosses TOP(0) and LEFT(3)");
console.log("  - Entry from top(0): foreground is top-left, going down, exit left(3)");
console.log("  - Entry from left(3): foreground is top-left, going up, exit top(0)");
console.log("  NEXT_EDGE[8] = [3, -1, -1, 0]");
console.log("  BUT WAIT - at the top-right corner of a square:");
console.log("  - We enter from LEFT, foreground (square) is BELOW us");
console.log("  - Config 8 at (103,23) has foreground at (103,24) = below the cell");
console.log("  - To trace CW around the square, we should go DOWN, not UP");
console.log("  - Exit should be BOTTOM, but config 8 doesn't cross BOTTOM!");
console.log("");
console.log("  AH! The issue is that config 8 = TL = bit 0 set = pixel at (x,y)");
console.log("  But looking at cell (103,23), the filled pixel is at (103,24)");
console.log("  That's the BL corner of the cell, so config should have bit 3 set = 8");
console.log("  So config 8 means BL corner is set, not TL!");
console.log("");
console.log("  Wait, let me check the bit definitions again:");
console.log("    bit 0 (1)  = top-left = pixel at (x, y)");
console.log("    bit 1 (2)  = top-right = pixel at (x+1, y)");
console.log("    bit 2 (4)  = bottom-right = pixel at (x+1, y+1)");
console.log("    bit 3 (8)  = bottom-left = pixel at (x, y+1)");
console.log("");
console.log("  So config 8 = bit 3 = bottom-left pixel is set");
console.log("  For cell (103, 23): BL pixel is at (103, 24) - that's our filled square!");
console.log("");
console.log("  Config 8 (BL only) crosses LEFT and BOTTOM edges");
console.log("  But wait, that should be config 8 = 0b1000 = bit 3 = BL");
console.log("");
console.log("  Let me recalculate which edges config 8 crosses:");
console.log("    TL=0, TR=0, BR=0, BL=1");
console.log("    top edge: TL vs TR = 0 vs 0 = no crossing");
console.log("    right edge: TR vs BR = 0 vs 0 = no crossing");
console.log("    bottom edge: BR vs BL = 0 vs 1 = CROSSING");
console.log("    left edge: BL vs TL = 1 vs 0 = CROSSING");
console.log("");
console.log("  So config 8 crosses BOTTOM(2) and LEFT(3)");
console.log("  Entry from bottom(2): exit left(3)");
console.log("  Entry from left(3): exit bottom(2)");
console.log("  NEXT_EDGE[8] should be [-1, -1, 3, 2]");
console.log("");
console.log("  But the current table has config 8 as [3, -1, -1, 0]");
console.log("  That's saying top->left and left->top, which is WRONG!");
console.log("");
console.log("  THE BUG: I confused TL with BL in the config naming!");
