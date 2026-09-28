/**
 * Forehead and glabella texture: wrinkles and furrows from pixels.
 *
 * In FACS, raising the brows (AU1/AU2) is recognised as much by the horizontal
 * wrinkles it pushes into the forehead as by the brow position, and lowering
 * them (AU4) by the vertical furrows between the brows. Early automatic AU
 * detectors used exactly these "transient features" (Tian, Kanade & Cohn,
 * 2001). The MediaPipe mesh under-reports brow movement, but the image still
 * shows the wrinkles, so we measure them directly:
 *
 *  - tex.foreheadLines: mean |∂I/∂v| (brightness change up the face) over a
 *    patch of forehead just above the brows -> horizontal wrinkles.
 *  - tex.glabellaLines: mean |∂I/∂u| (change across the face) over the patch
 *    between the inner brow heads -> vertical furrows.
 *
 * Both are divided by the patch's mean brightness so global lighting changes
 * cancel, and reported as natural logs, so a change from the person's neutral
 * is a ratio (+0.69 = wrinkle contrast doubled) whatever the skin, light or
 * camera resolution.
 * The patches are laid out in the head-aligned face frame, so they follow head
 * rotation and scale.
 */
import { FaceFrame, LM } from "./geometry.ts";

/** Returns image brightness (any linear scale) at full-frame pixel coordinates. */
export type Sampler = (x: number, y: number) => number;

interface Patch {
  /** Centre (face-frame u, v in inter-ocular units) */
  cu: number;
  cv: number;
  /** Half-extent in u and v */
  hu: number;
  hv: number;
  nu: number;
  nv: number;
}

/** Face-frame point (u right, v up, IOD units, z = 0 plane of the frame) -> image pixel (x right, y down). */
function toPixel(f: FaceFrame, u: number, v: number): [number, number] {
  const s = f.iod;
  const x = f.origin[0] + s * (u * f.ex[0] + v * f.ey[0]);
  const y = f.origin[1] + s * (u * f.ex[1] + v * f.ey[1]);
  return [x, -y];
}

function gradientEnergy(f: FaceFrame, sample: Sampler, p: Patch, axis: "u" | "v"): number {
  let sum = 0;
  let mean = 0;
  let n = 0;
  const du = (2 * p.hu) / (p.nu - 1);
  const dv = (2 * p.hv) / (p.nv - 1);
  const grid: number[] = new Array(p.nu * p.nv);
  for (let j = 0; j < p.nv; j++) {
    for (let i = 0; i < p.nu; i++) {
      const [x, y] = toPixel(f, p.cu - p.hu + i * du, p.cv - p.hv + j * dv);
      const val = sample(x, y);
      grid[j * p.nu + i] = val;
      mean += val;
      n++;
    }
  }
  mean /= n;
  let m = 0;
  if (axis === "v") {
    for (let j = 1; j < p.nv; j++) for (let i = 0; i < p.nu; i++) { sum += Math.abs(grid[j * p.nu + i] - grid[(j - 1) * p.nu + i]); m++; }
  } else {
    for (let j = 0; j < p.nv; j++) for (let i = 1; i < p.nu; i++) { sum += Math.abs(grid[j * p.nu + i] - grid[j * p.nu + i - 1]); m++; }
  }
  return Math.log(Math.max(1e-3, mean > 1e-6 ? sum / m / mean : 0));
}

/** Face-frame bounds of the two patches (also used to crop the video efficiently and to draw the overlay). */
export function texturePatches(f: FaceFrame): { forehead: Patch; glabella: Patch } {
  // Anchor the forehead patch just above the current upper brow line so it
  // samples skin, not brow hair, as the brows move.
  const browTop = Math.max(f.mean(LM.left.browMid)[1], f.mean(LM.right.browMid)[1], f.mean(LM.left.browInner)[1], f.mean(LM.right.browInner)[1]);
  const forehead: Patch = { cu: 0, cv: browTop + 0.08 + 0.16, hu: 0.5, hv: 0.16, nu: 40, nv: 20 };
  const inner = (f.mean(LM.left.browInner)[1] + f.mean(LM.right.browInner)[1]) / 2;
  const glabella: Patch = { cu: 0, cv: inner - 0.02, hu: 0.14, hv: 0.12, nu: 20, nv: 16 };
  return { forehead, glabella };
}

export function measureTexture(f: FaceFrame, sample: Sampler): Record<string, number> {
  const { forehead, glabella } = texturePatches(f);
  return {
    "tex.foreheadLines": gradientEnergy(f, sample, forehead, "v"),
    "tex.glabellaLines": gradientEnergy(f, sample, glabella, "u"),
  };
}

/** Pixel-space bounding box of the texture patches (for cropping the video). */
export function textureBounds(f: FaceFrame): { x: number; y: number; w: number; h: number } {
  const { forehead, glabella } = texturePatches(f);
  const pts: [number, number][] = [];
  for (const p of [forehead, glabella]) {
    for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(toPixel(f, p.cu + su * p.hu, p.cv + sv * p.hv));
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.floor(Math.min(...xs)) - 2;
  const y = Math.floor(Math.min(...ys)) - 2;
  return { x, y, w: Math.ceil(Math.max(...xs)) + 2 - x, h: Math.ceil(Math.max(...ys)) + 2 - y };
}

/** Outline of a patch in normalized image coordinates, for the overlay. */
export function patchOutline(f: FaceFrame, which: "forehead" | "glabella", width: number, height: number): [number, number][] {
  const p = texturePatches(f)[which];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
    const [x, y] = toPixel(f, p.cu + su * p.hu, p.cv + sv * p.hv);
    return [x / width, y / height];
  });
}

/** Bilinear sampler over a grayscale buffer whose (0,0) sits at (ox, oy) in full-frame pixels, scaled by `scale`. */
export function bufferSampler(gray: ArrayLike<number>, w: number, h: number, ox = 0, oy = 0, scale = 1): Sampler {
  return (x, y) => {
    const fx = Math.min(w - 1.001, Math.max(0, (x - ox) * scale));
    const fy = Math.min(h - 1.001, Math.max(0, (y - oy) * scale));
    const x0 = fx | 0;
    const y0 = fy | 0;
    const ax = fx - x0;
    const ay = fy - y0;
    const i = y0 * w + x0;
    const top = gray[i] * (1 - ax) + gray[i + 1] * ax;
    const bottom = gray[i + w] * (1 - ax) + gray[i + w + 1] * ax;
    return top * (1 - ay) + bottom * ay;
  };
}
