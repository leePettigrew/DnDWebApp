import type { BattleGrid } from "@/lib/domain/types";

/**
 * Grid geometry for the battle builder — square and pointy-top hex (odd-r
 * offset). `cellPx` is the horizontal width of a cell (flat-to-flat for hex),
 * so a hex's circumradius is `cellPx / √3`. Cell storage is always row-major
 * `row*cols + col` for both grids.
 */

const SQRT3 = Math.sqrt(3);
export const hexSize = (cp: number) => cp / SQRT3;

export interface Pt {
  x: number;
  y: number;
}

export function cellCenter(grid: BattleGrid, col: number, row: number, cp: number): Pt {
  if (grid === "square") return { x: (col + 0.5) * cp, y: (row + 0.5) * cp };
  const s = hexSize(cp);
  return { x: (col + 0.5 + (row & 1 ? 0.5 : 0)) * cp, y: s + row * 1.5 * s };
}

export function cellPolygon(grid: BattleGrid, col: number, row: number, cp: number): Pt[] {
  if (grid === "square") {
    const x = col * cp;
    const y = row * cp;
    return [{ x, y }, { x: x + cp, y }, { x: x + cp, y: y + cp }, { x, y: y + cp }];
  }
  const { x, y } = cellCenter("hex", col, row, cp);
  const s = hexSize(cp);
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90); // pointy-top: first vertex up
    pts.push({ x: x + s * Math.cos(a), y: y + s * Math.sin(a) });
  }
  return pts;
}

export function mapSize(grid: BattleGrid, cols: number, rows: number, cp: number): { w: number; h: number } {
  if (grid === "square") return { w: cols * cp, h: rows * cp };
  const s = hexSize(cp);
  return { w: (cols + 0.5) * cp, h: 2 * s + (rows - 1) * 1.5 * s };
}

export function pixelToCell(
  grid: BattleGrid,
  px: number,
  py: number,
  cp: number,
  cols: number,
  rows: number,
): { col: number; row: number } | null {
  if (grid === "square") {
    const col = Math.floor(px / cp);
    const row = Math.floor(py / cp);
    return col < 0 || row < 0 || col >= cols || row >= rows ? null : { col, row };
  }
  const s = hexSize(cp);
  const approxRow = Math.round((py - s) / (1.5 * s));
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  for (let r = approxRow - 1; r <= approxRow + 1; r++) {
    if (r < 0 || r >= rows) continue;
    const approxCol = Math.round(px / cp - 0.5 - (r & 1 ? 0.5 : 0));
    for (let c = approxCol - 1; c <= approxCol + 1; c++) {
      if (c < 0 || c >= cols) continue;
      const ctr = cellCenter("hex", c, r, cp);
      const d = (ctr.x - px) ** 2 + (ctr.y - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { col: c, row: r };
      }
    }
  }
  return best;
}

export function neighbors(grid: BattleGrid, col: number, row: number): [number, number][] {
  if (grid === "square") return [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]];
  return row & 1
    ? [[col + 1, row], [col - 1, row], [col, row - 1], [col + 1, row - 1], [col, row + 1], [col + 1, row + 1]]
    : [[col + 1, row], [col - 1, row], [col - 1, row - 1], [col, row - 1], [col - 1, row + 1], [col, row + 1]];
}

/** Cells a brush of `sz` covers (square block / hex rings). */
export function brushCells(
  grid: BattleGrid,
  col: number,
  row: number,
  sz: number,
  cols: number,
  rows: number,
): [number, number][] {
  const out: [number, number][] = [];
  if (grid === "square") {
    const off = Math.floor((sz - 1) / 2);
    for (let dr = 0; dr < sz; dr++) {
      for (let dc = 0; dc < sz; dc++) {
        const c = col - off + dc;
        const r = row - off + dr;
        if (c >= 0 && r >= 0 && c < cols && r < rows) out.push([c, r]);
      }
    }
    return out;
  }
  const seen = new Set<number>();
  const q: [number, number, number][] = [[col, row, 0]];
  while (q.length) {
    const [c, r, d] = q.shift()!;
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    const k = r * cols + c;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([c, r]);
    if (d < sz - 1) for (const [nc, nr] of neighbors("hex", c, r)) q.push([nc, nr, d + 1]);
  }
  return out;
}

/** Snap a point (in cell-width units = px/cp) to the nearest cell vertex. */
export function snapVertex(
  grid: BattleGrid,
  wx: number,
  wy: number,
  cp: number,
  cols: number,
  rows: number,
): Pt | null {
  if (grid === "square") {
    return { x: Math.max(0, Math.min(cols, Math.round(wx))), y: Math.max(0, Math.min(rows, Math.round(wy))) };
  }
  const cell = pixelToCell("hex", wx * cp, wy * cp, cp, cols, rows);
  if (!cell) return null;
  const poly = cellPolygon("hex", cell.col, cell.row, cp);
  let best = poly[0];
  let bestD = Infinity;
  for (const p of poly) {
    const d = (p.x / cp - wx) ** 2 + (p.y / cp - wy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { x: best.x / cp, y: best.y / cp };
}
