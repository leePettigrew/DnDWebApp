import type { MapLight, MapToken, Wall } from "@/lib/domain/types";
import type { Pt } from "./geometry";

export type LightLevel = "bright" | "dim" | "dark";

/**
 * Dynamic line-of-sight fog by shadow-casting on canvases. All coordinates are
 * MAP IMAGE PIXELS. The visibility mask is computed per viewer token: a soft
 * vision disc, minus the shadow each wall casts away from that token. Discs are
 * additive (party-shared sight). The board then composites fog from this mask
 * plus an accumulated "explored" canvas.
 */

function projectAway(origin: Pt, point: Pt, far: number): Pt {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: point.x + (dx / len) * far, y: point.y + (dy / len) * far };
}

/** Draw one radial source (disc minus wall shadows) additively into `target`. */
function drawSource(
  target: CanvasRenderingContext2D,
  temp: CanvasRenderingContext2D,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  walls: Wall[],
  far: number,
): void {
  temp.clearRect(0, 0, width, height);
  temp.globalCompositeOperation = "source-over";
  const grad = temp.createRadialGradient(x, y, Math.max(1, radius * 0.55), x, y, radius);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  temp.fillStyle = grad;
  temp.beginPath();
  temp.arc(x, y, radius, 0, Math.PI * 2);
  temp.fill();

  temp.globalCompositeOperation = "destination-out";
  temp.fillStyle = "rgba(0,0,0,1)";
  for (const w of walls) {
    const a = projectAway({ x, y }, { x: w.x1, y: w.y1 }, far);
    const b = projectAway({ x, y }, { x: w.x2, y: w.y2 }, far);
    temp.beginPath();
    temp.moveTo(w.x1, w.y1);
    temp.lineTo(a.x, a.y);
    temp.lineTo(b.x, b.y);
    temp.lineTo(w.x2, w.y2);
    temp.closePath();
    temp.fill();
  }
  temp.globalCompositeOperation = "source-over";

  target.globalCompositeOperation = "lighter";
  target.drawImage(temp.canvas, 0, 0);
  target.globalCompositeOperation = "source-over";
}

/**
 * Draw the currently-visible alpha mask (white = visible). A token sees within
 * its vision radius (minus wall shadows). In dim/dark ambient that sight is
 * gated by light: visible = vision ∩ (lit ∪ darkvision), where lit = placed
 * lights + carried torches (+ a dim ambient floor) — all shadow-cast by walls.
 */
export function computeVisibilityMask(
  maskCtx: CanvasRenderingContext2D,
  tempCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewers: MapToken[],
  walls: Wall[],
  lights: MapLight[] = [],
  ambient: LightLevel = "bright",
  litCtx: CanvasRenderingContext2D | null = null,
): void {
  maskCtx.clearRect(0, 0, width, height);
  const far = (width + height) * 2;

  for (const tk of viewers) {
    const radius = tk.visionRadius && tk.visionRadius > 0 ? tk.visionRadius : 0;
    if (radius > 0) drawSource(maskCtx, tempCtx, width, height, tk.x, tk.y, radius, walls, far);
  }

  if (ambient !== "bright" && litCtx) {
    litCtx.clearRect(0, 0, width, height);
    litCtx.globalCompositeOperation = "source-over";
    if (ambient === "dim") {
      litCtx.fillStyle = "rgba(255,255,255,0.45)";
      litCtx.fillRect(0, 0, width, height);
    }
    for (const L of lights) {
      if (L.radius > 0) drawSource(litCtx, tempCtx, width, height, L.x, L.y, L.radius, walls, far);
    }
    for (const tk of viewers) {
      if (tk.lightRadius && tk.lightRadius > 0)
        drawSource(litCtx, tempCtx, width, height, tk.x, tk.y, tk.lightRadius, walls, far);
      if (tk.darkvision && tk.darkvision > 0)
        drawSource(litCtx, tempCtx, width, height, tk.x, tk.y, tk.darkvision, walls, far);
    }
    // Intersect: keep visible only where also lit / darkvision.
    maskCtx.globalCompositeOperation = "destination-in";
    maskCtx.drawImage(litCtx.canvas, 0, 0);
    maskCtx.globalCompositeOperation = "source-over";
  }
}

/** Accumulate the current mask into the explored canvas (persistent memory). */
export function accumulateExplored(
  exploredCtx: CanvasRenderingContext2D,
  maskCanvas: HTMLCanvasElement,
): void {
  exploredCtx.globalCompositeOperation = "lighter";
  exploredCtx.drawImage(maskCanvas, 0, 0);
  exploredCtx.globalCompositeOperation = "source-over";
}

/** Paint the final fog: opaque unexplored, dim explored, clear currently-visible. */
export function paintFog(
  fogCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  maskCanvas: HTMLCanvasElement,
  exploredCanvas: HTMLCanvasElement | null,
  opts: { fogColor: string; exploredDim: number },
): void {
  fogCtx.globalCompositeOperation = "source-over";
  fogCtx.globalAlpha = 1;
  fogCtx.clearRect(0, 0, width, height);
  fogCtx.fillStyle = opts.fogColor;
  fogCtx.fillRect(0, 0, width, height);

  if (exploredCanvas) {
    fogCtx.globalCompositeOperation = "destination-out";
    fogCtx.globalAlpha = opts.exploredDim;
    fogCtx.drawImage(exploredCanvas, 0, 0);
    fogCtx.globalAlpha = 1;
  }

  fogCtx.globalCompositeOperation = "destination-out";
  fogCtx.drawImage(maskCanvas, 0, 0);
  fogCtx.globalCompositeOperation = "source-over";
}

/** Is a map point currently visible (alpha above a small threshold)? */
export function isVisibleAt(
  maskCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const data = maskCtx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return data[3] > 28;
}
