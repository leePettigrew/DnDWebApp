/** Pure 2D helpers for the tactical map. Map coords are image pixels. */

export interface Pt {
  x: number;
  y: number;
}

/** Pan/zoom of the board: map px → screen px is `p * scale + offset`. */
export interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function mapToScreen(p: Pt, v: View): Pt {
  return { x: p.x * v.scale + v.offsetX, y: p.y * v.scale + v.offsetY };
}

export function screenToMap(p: Pt, v: View): Pt {
  return { x: (p.x - v.offsetX) / v.scale, y: (p.y - v.offsetY) / v.scale };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Snap a point to the nearest grid-cell center. */
export function snapToCellCenter(
  p: Pt,
  gridSize: number,
  offsetX = 0,
  offsetY = 0,
): Pt {
  if (!gridSize || gridSize <= 0) return p;
  const cx = Math.floor((p.x - offsetX) / gridSize);
  const cy = Math.floor((p.y - offsetY) / gridSize);
  return {
    x: offsetX + cx * gridSize + gridSize / 2,
    y: offsetY + cy * gridSize + gridSize / 2,
  };
}

/** Distance in feet between two map points, given the grid scale. */
export function feetBetween(
  a: Pt,
  b: Pt,
  gridSize: number,
  feetPerCell: number,
): number {
  if (!gridSize || gridSize <= 0) return 0;
  const cells = dist(a, b) / gridSize;
  return Math.round(cells * feetPerCell);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
