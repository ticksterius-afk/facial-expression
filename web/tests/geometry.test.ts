import { describe, expect, it } from "vitest";
import { FaceFrame, measureGeometry, type Landmark } from "../src/platform/mediapipe/geometry.ts";
import fixture from "./fixtures/face-landmarks.json" with { type: "json" };

const W = fixture.w;
const H = fixture.h;
const raw: Landmark[] = fixture.landmarks.map(([x, y, z]) => ({ x, y, z }));

/** The fixture face re-expressed as a frontal face (head frame == camera frame), 120 px per inter-ocular distance. */
function frontalize(lms: Landmark[]): Landmark[] {
  const f = new FaceFrame(lms, W, H);
  const s = 120;
  return lms.map((_, i) => {
    const [x, y, z] = f.p(i);
    return { x: 0.5 + (x * s) / W, y: 0.5 - (y * s) / H, z: (-z * s) / W };
  });
}
const base = frontalize(raw);

/**
 * Rotates normalized landmarks about the face centre in a y-up, z-towards-camera
 * pixel space (the convention FaceFrame uses), then converts back.
 * pitch: about x (chin up > 0), yaw: about y (face turns to the image right > 0),
 * roll: about z (clockwise in the image > 0).
 */
function rotate(lms: Landmark[], pitchDeg: number, yawDeg: number, rollDeg: number): Landmark[] {
  const P = lms.map((p) => [p.x * W, -p.y * H, -p.z * W]);
  const c = P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length, a[2] + p[2] / P.length], [0, 0, 0]);
  const r = Math.PI / 180;
  const [cp, sp] = [Math.cos(pitchDeg * r), Math.sin(pitchDeg * r)];
  const [cy, sy] = [Math.cos(yawDeg * r), Math.sin(yawDeg * r)];
  const [cr, sr] = [Math.cos(-rollDeg * r), Math.sin(-rollDeg * r)];
  return P.map(([x0, y0, z0]) => {
    let [x, y, z] = [x0 - c[0], y0 - c[1], z0 - c[2]];
    // pitch: rotate z towards +y (normal tips up)
    [y, z] = [y * cp + z * sp, -y * sp + z * cp];
    // yaw: rotate z towards +x
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    // roll: in-plane
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    return { x: (x + c[0]) / W, y: -(y + c[1]) / H, z: -(z + c[2]) / W };
  });
}

describe("MediaPipe landmark geometry", () => {
  const ref = new FaceFrame(base, W, H);

  it("frontalized fixture reads as a frontal pose", () => {
    expect(Math.abs(ref.pitch)).toBeLessThan(0.01);
    expect(Math.abs(ref.yaw)).toBeLessThan(0.01);
    expect(Math.abs(ref.roll)).toBeLessThan(0.01);
  });

  it.each([
    ["pitch up (chin up)", 15, 0, 0, 0.5],
    ["pitch down", -20, 0, 0, 0.5],
    ["yaw (turn to own left)", 0, 25, 0, 0.5],
    ["roll (tilt to own left)", 0, 0, 12, 0.5],
    ["combined", 10, -15, 6, 2],
  ])("recovers head pose: %s", (_name, pitch, yaw, roll, tol) => {
    const f = new FaceFrame(rotate(base, pitch, yaw, roll), W, H);
    expect(Math.abs(f.pitch - pitch)).toBeLessThan(tol);
    expect(Math.abs(f.yaw - yaw)).toBeLessThan(tol);
    expect(Math.abs(f.roll - roll)).toBeLessThan(tol);
  });

  it("produces rotation- and scale-invariant expression measurements", () => {
    const m0 = measureGeometry(ref);
    const moved = rotate(base, 12, -18, 8).map((p) => ({ x: 0.5 + (p.x - 0.5) * 0.6, y: 0.5 + (p.y - 0.5) * 0.6, z: p.z * 0.6 }));
    const m1 = measureGeometry(new FaceFrame(moved, W, H));
    for (const k of Object.keys(m0)) {
      if (k.startsWith("pose.")) continue;
      expect(Math.abs(m1[k] - m0[k]), k).toBeLessThan(0.01);
    }
  });

  it("measures a raised lip corner as positive lipCornerHeight", () => {
    const lifted = base.map((p, i) => (i === 61 || i === 291 ? { ...p, y: p.y - 0.01 } : p));
    const m0 = measureGeometry(ref);
    const m1 = measureGeometry(new FaceFrame(lifted, W, H));
    expect(m1["geo.lipCornerHeightLeft"]).toBeGreaterThan(m0["geo.lipCornerHeightLeft"]);
    expect(m1["geo.lipCornerHeightRight"]).toBeGreaterThan(m0["geo.lipCornerHeightRight"]);
  });

  it("names sides from the subject's point of view", () => {
    // In an un-mirrored camera image the subject's left eye appears on the image right.
    expect(raw[263].x).toBeGreaterThan(raw[33].x);
    const leftEye = ref.p(263);
    expect(leftEye[0]).toBeGreaterThan(0);
  });
});
