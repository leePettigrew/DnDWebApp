import type { MapToken, Wall } from "@/lib/domain/types";
import type { Pt } from "./geometry";

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

/** Draw the currently-visible alpha mask (white = visible) into `maskCtx`. */
export function computeVisibilityMask(
  maskCtx: CanvasRenderingContext2D,
  tempCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewers: MapToken[],
  walls: Wall[],
): void {
  maskCtx.clearRect(0, 0, width, height);
  const far = (width + height) * 2;

  for (const tk of viewers) {
    const radius = tk.visionRadius && tk.visionRadius > 0 ? tk.visionRadius : 0;
    if (radius <= 0) continue;

    tempCtx.clearRect(0, 0, width, height);
    tempCtx.globalCompositeOperation = "source-over";

    // Lit disc with a soft outer falloff.
    const grad = tempCtx.createRadialGradient(
      tk.x,
      tk.y,
      Math.max(1, radius * 0.55),
      tk.x,
      tk.y,
      radius,
    );
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    tempCtx.fillStyle = grad;
    tempCtx.beginPath();
    tempCtx.arc(tk.x, tk.y, radius, 0, Math.PI * 2);
    tempCtx.fill();

    // Punch each wall's shadow (region behind it from this token).
    tempCtx.globalCompositeOperation = "destination-out";
    tempCtx.fillStyle = "rgba(0,0,0,1)";
    for (const w of walls) {
      const a = projectAway({ x: tk.x, y: tk.y }, { x: w.x1, y: w.y1 }, far);
      const b = projectAway({ x: tk.x, y: tk.y }, { x: w.x2, y: w.y2 }, far);
      tempCtx.beginPath();
      tempCtx.moveTo(w.x1, w.y1);
      tempCtx.lineTo(a.x, a.y);
      tempCtx.lineTo(b.x, b.y);
      tempCtx.lineTo(w.x2, w.y2);
      tempCtx.closePath();
      tempCtx.fill();
    }
    tempCtx.globalCompositeOperation = "source-over";

    // Additively accumulate into the mask.
    maskCtx.globalCompositeOperation = "lighter";
    maskCtx.drawImage(tempCtx.canvas, 0, 0);
  }
  maskCtx.globalCompositeOperation = "source-over";
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
