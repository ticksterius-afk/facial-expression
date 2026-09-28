import { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "../platform/mediapipe/geometry.ts";

type Conn = { start: number; end: number };

const pathOf = (ids: number[]): Conn[] => ids.slice(1).map((end, i) => ({ start: ids[i], end }));

/** Face contours grouped by the region whose activity colours them. */
const CONTOURS: { region: string; conns: Conn[] }[] = [
  { region: "brows", conns: [...FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW] },
  { region: "eyes", conns: [...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE] },
  { region: "mouth", conns: FaceLandmarker.FACE_LANDMARKS_LIPS },
  { region: "nose", conns: [...pathOf([168, 6, 197, 195, 5, 4, 1, 19, 94, 2]), ...pathOf([129, 98, 97, 2, 326, 327, 358])] },
  { region: "chin", conns: pathOf([176, 148, 152, 377, 400]) },
];
const CHEEK_POINTS = [116, 117, 123, 147, 345, 346, 352, 376];
const OVAL = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
const IRIS = [...FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS];

/**
 * Forehead: three lines where frontalis (AU1/AU2) wrinkles form, interpolated
 * between the brow tops, the mid-forehead row and the top of the face oval
 * (matched point for point, subject's right to left).
 */
const BROW_TOP = [70, 63, 105, 107, 9, 336, 334, 293, 300];
const FOREHEAD_MID = [68, 104, 69, 108, 151, 337, 299, 333, 298];
const FOREHEAD_TOP = [54, 103, 67, 109, 10, 338, 297, 332, 284];
/** Glabella: the vertical furrows AU4 cuts between the inner brow heads [lower, upper] per side. */
const GLABELLA = [[55, 107], [285, 336]];

/** Where to put AU labels (landmark to anchor at, AU ids to show). */
const LABELS: { at: number; aus: string[] }[] = [
  { at: 151, aus: ["AU1", "AU2"] },
  { at: 9, aus: ["AU4"] },
  { at: 346, aus: ["AU5", "AU6", "AU7", "AU43"] },
  { at: 4, aus: ["AU9", "AU10"] },
  { at: 291, aus: ["AU12", "AU14", "AU15", "AU20", "AU23", "AU24"] },
  { at: 152, aus: ["AU17", "AU25", "AU26"] },
];

/** Neutral white -> amber -> red as activity rises. */
export function heat(v: number, alpha = 1): string {
  const x = Math.max(0, Math.min(1, v));
  if (x < 0.08) return `rgba(255,255,255,${0.35 * alpha})`;
  const h = 48 - 48 * x;
  return `hsla(${h}, 100%, ${62 - 10 * x}%, ${(0.55 + 0.45 * x) * alpha})`;
}

export class Overlay {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  clear(): void {
    this.fit();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draws landmark contours onto the canvas, matching the <video>'s
   * object-fit: cover crop. The canvas is mirrored by CSS together with the
   * video, so text is counter-mirrored to stay readable.
   */
  draw(
    video: HTMLVideoElement,
    landmarks: Landmark[] | null,
    regions: Record<string, number>,
    aus: Record<string, number>,
    mode: "regions" | "labels" | "off",
    mirrored: boolean,
  ): void {
    this.clear();
    if (!landmarks || mode === "off" || !video.videoWidth) return;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const s = Math.max(cw / video.videoWidth, ch / video.videoHeight);
    const ox = (cw - video.videoWidth * s) / 2;
    const oy = (ch - video.videoHeight * s) / 2;
    const X = (i: number) => ox + landmarks[i].x * video.videoWidth * s;
    const Y = (i: number) => oy + landmarks[i].y * video.videoHeight * s;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const stroke = (conns: Conn[], color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * dpr;
      ctx.beginPath();
      for (const c of conns) {
        ctx.moveTo(X(c.start), Y(c.start));
        ctx.lineTo(X(c.end), Y(c.end));
      }
      ctx.stroke();
    };

    stroke(OVAL, "rgba(255,255,255,0.18)", 1);
    stroke(IRIS, "rgba(255,255,255,0.35)", 1);
    const forehead = regions.forehead ?? 0;
    for (const { region, conns } of CONTOURS) {
      // The brows move with both the forehead (raise) and the glabella (lower).
      const v = region === "brows" ? Math.max(forehead, regions.brows ?? 0) : regions[region] ?? 0;
      stroke(conns, heat(v), 1.4 + 2.2 * v);
    }

    const mix = (a: number, b: number, t: number): [number, number] => [X(a) + (X(b) - X(a)) * t, Y(a) + (Y(b) - Y(a)) * t];
    const polyline = (pts: [number, number][], color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * dpr;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    };
    // Forehead lines: drawn inset from the temples, so they read as wrinkles rather than a grid.
    const inset = (row: [number, number][]) => row.slice(1, -1);
    const rows = [
      FOREHEAD_MID.map((m, i) => mix(BROW_TOP[i], m, 0.5)),
      FOREHEAD_MID.map((m): [number, number] => [X(m), Y(m)]),
      FOREHEAD_MID.map((m, i) => mix(m, FOREHEAD_TOP[i], 0.5)),
    ];
    for (const row of rows) polyline(inset(row), heat(forehead, 0.8), 1 + 2 * forehead);
    const glabella = regions.brows ?? 0;
    if (glabella >= 0.08) {
      for (const [lower, upper] of GLABELLA) {
        // Pull each furrow halfway from the brow head towards the midline (8 below, 9 above).
        const a = mix(lower, 8, 0.5);
        const b = mix(upper, 9, 0.5);
        polyline([a, b], heat(glabella), 1.2 + 2.2 * glabella);
      }
    }
    const cheek = regions.cheeks ?? 0;
    ctx.fillStyle = heat(cheek);
    for (const i of CHEEK_POINTS) {
      ctx.beginPath();
      ctx.arc(X(i), Y(i), (1.6 + 2.5 * cheek) * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    if (mode === "labels") {
      ctx.font = `${600} ${11 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = "middle";
      for (const { at, aus: ids } of LABELS) {
        const active = ids.filter((id) => (aus[id] ?? 0) >= 0.25).slice(0, 3);
        if (!active.length) continue;
        const text = active.map((id) => `${id} ${Math.round((aus[id] ?? 0) * 100)}`).join("  ");
        const x = X(at) + 14 * dpr;
        const y = Y(at);
        ctx.save();
        ctx.translate(x, y);
        if (mirrored) ctx.scale(-1, 1);
        const w = ctx.measureText(text).width;
        const tx = mirrored ? -w : 0;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(tx - 4 * dpr, -8 * dpr, w + 8 * dpr, 16 * dpr);
        ctx.fillStyle = "#fff";
        ctx.fillText(text, tx, 0);
        ctx.restore();
      }
    }
  }

  private fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }
}
