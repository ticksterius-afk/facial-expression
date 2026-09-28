/**
 * Landmark geometry for the MediaPipe 478-point face mesh.
 *
 * MediaPipe's blendshape model never activates some ARKit channels
 * (cheekSquint*, noseSneer* are always 0), and others are weak (eyeWide*,
 * mouthFrown*). Those channels carry the evidence for AU6 (cheek raiser — the
 * "Duchenne" marker), AU9 (nose wrinkler — the core of disgust), AU5 and AU15.
 * We recover them from landmark geometry instead.
 *
 * All measurements are taken in a head-aligned frame (so they are invariant to
 * head rotation) and expressed in units of the inter-ocular distance (so they
 * are invariant to face size / distance from the camera). They are *raw*
 * measurements: the engine subtracts each person's neutral baseline.
 *
 * Side naming follows the subject: "Left" = the subject's left side.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

type Vec3 = [number, number, number];

/** Landmark indices (canonical MediaPipe face mesh topology). */
export const LM = {
  forehead: 10,
  chin: 152,
  noseTip: 1,
  subnasale: 2,
  noseBridge: 168,
  upperLipTop: 0,
  upperLipInner: 13,
  lowerLipInner: 14,
  lowerLipBottom: 17,
  right: {
    eyeOuter: 33,
    eyeInner: 133,
    upperLid: [160, 159, 158],
    lowerLid: [144, 145, 153],
    browInner: [107, 55, 66, 65],
    browMid: [105, 52],
    browOuter: [70, 46, 63, 53],
    mouthCorner: 61,
    alar: [129, 64, 98],
    cheek: [116, 117, 123, 147],
  },
  left: {
    eyeOuter: 263,
    eyeInner: 362,
    upperLid: [387, 386, 385],
    lowerLid: [373, 374, 380],
    browInner: [336, 285, 296, 295],
    browMid: [334, 282],
    browOuter: [300, 276, 293, 283],
    mouthCorner: 291,
    alar: [358, 294, 327],
    cheek: [345, 346, 352, 376],
  },
} as const;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => scale(a, 1 / (norm(a) || 1));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const RAD = 180 / Math.PI;

/**
 * A head-aligned coordinate frame built from rigid landmarks (eye corners,
 * forehead, subnasale — none of which move much with expression).
 * Face-frame axes: +x towards the subject's left, +y up, +z out of the face
 * (towards the camera when frontal).
 */
export class FaceFrame {
  readonly origin: Vec3;
  readonly ex: Vec3;
  readonly ey: Vec3;
  readonly ez: Vec3;
  /** Inter-ocular distance (between eye centers) in pixel-ish units. */
  readonly iod: number;
  /** Head pose in degrees. pitch > 0: chin up; yaw > 0: face turned to the image right; roll > 0: head tilted clockwise in the image. */
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;

  private readonly pts: Vec3[];

  /**
   * @param landmarks normalized MediaPipe landmarks (x, y in [0,1] of the image, z in x-units)
   * @param width image width in pixels (for aspect-correct geometry)
   * @param height image height in pixels
   */
  constructor(landmarks: ArrayLike<Landmark>, width: number, height: number) {
    const n = landmarks.length;
    this.pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = landmarks[i];
      // Image space: x right, y down, z away from camera. Convert to x right,
      // y up, z towards camera so the frame is right-handed and intuitive.
      this.pts[i] = [p.x * width, -p.y * height, -p.z * width];
    }
    const P = this.pts;
    const rEye = scale(addAll([P[LM.right.eyeOuter], P[LM.right.eyeInner]]), 0.5);
    const lEye = scale(addAll([P[LM.left.eyeOuter], P[LM.left.eyeInner]]), 0.5);
    this.origin = scale(addAll([rEye, lEye]), 0.5);
    const across = sub(lEye, rEye); // subject's right -> left
    this.iod = norm(across) || 1;
    // In a non-mirrored image the subject's left eye is on the image right, so
    // ex points image-right when frontal.
    const ex = unit(across);
    const upRaw = sub(P[LM.forehead], P[LM.subnasale]);
    const ey = unit(sub(upRaw, scale(ex, dot(upRaw, ex))));
    const ez = cross(ex, ey); // out of the face, towards the camera
    this.ex = ex;
    this.ey = ey;
    this.ez = ez;
    // Face normal ez in camera space: frontal => (0, 0, 1).
    this.pitch = Math.atan2(ez[1], ez[2]) * RAD; // tilting the chin up turns the normal up (+y)
    this.yaw = Math.atan2(ez[0], ez[2]) * RAD;
    this.roll = Math.atan2(-ex[1], ex[0]) * RAD;
  }

  /** Landmark i in face coordinates, in inter-ocular units. */
  p(i: number): Vec3 {
    const d = sub(this.pts[i], this.origin);
    const s = 1 / this.iod;
    return [dot(d, this.ex) * s, dot(d, this.ey) * s, dot(d, this.ez) * s];
  }

  /** Mean of several landmarks in face coordinates. */
  mean(ids: readonly number[]): Vec3 {
    let x = 0, y = 0, z = 0;
    for (const i of ids) {
      const q = this.p(i);
      x += q[0]; y += q[1]; z += q[2];
    }
    const k = 1 / ids.length;
    return [x * k, y * k, z * k];
  }
}

function addAll(vs: Vec3[]): Vec3 {
  const out: Vec3 = [0, 0, 0];
  for (const v of vs) { out[0] += v[0]; out[1] += v[1]; out[2] += v[2]; }
  return out;
}

type Side = typeof LM.left | typeof LM.right;

/**
 * Raw geometric measurements (inter-ocular units unless noted).
 * Keys are `geo.<name><Side>` for bilateral measurements and `geo.<name>` otherwise;
 * head pose is emitted as `pose.pitch|yaw|roll` in degrees.
 */
export function measureGeometry(frame: FaceFrame): Record<string, number> {
  const out: Record<string, number> = {};
  const f = frame;

  // Mouth reference: midpoint of the inner lips. Opening the jaw moves the
  // lower lip, the corners follow about halfway, so corner-vs-center height
  // stays roughly jaw-invariant.
  const upIn = f.p(LM.upperLipInner);
  const loIn = f.p(LM.lowerLipInner);
  const mouthCenterY = (upIn[1] + loIn[1]) / 2;
  const subnasale = f.p(LM.subnasale);

  const sides: [string, Side][] = [["Left", LM.left], ["Right", LM.right]];
  for (const [name, s] of sides) {
    const inner = f.p(s.eyeInner);
    const outer = f.p(s.eyeOuter);
    const eyeWidth = Math.hypot(outer[0] - inner[0], outer[1] - inner[1]) || 1;
    const canthusY = (inner[1] + outer[1]) / 2;
    const upper = f.mean(s.upperLid);
    const lower = f.mean(s.lowerLid);

    // AU1/AU2/AU4: brow heights above the (rigid) eye corners.
    out[`geo.browInnerHeight${name}`] = f.mean(s.browInner)[1] - inner[1];
    out[`geo.browMidHeight${name}`] = f.mean(s.browMid)[1] - canthusY;
    out[`geo.browOuterHeight${name}`] = f.mean(s.browOuter)[1] - outer[1];

    // AU5 (+) / AU7, AU43 (-): palpebral aperture relative to eye width.
    out[`geo.eyeOpen${name}`] = (upper[1] - lower[1]) / eyeWidth;
    // AU6/AU7: lower lid pushed up towards the corner line (higher = raised).
    out[`geo.lowerLidHeight${name}`] = lower[1] - canthusY;
    // AU6: the outer malar (under-eye cheek) surface lifts; these points are
    // lateral enough not to be dragged down when the jaw opens in laughter.
    out[`geo.cheekHeight${name}`] = f.mean(s.cheek)[1] - canthusY;
    // AU9: nose wrinkling lifts the alae towards the inner eye corner.
    out[`geo.alarHeight${name}`] = f.mean(s.alar)[1] - inner[1];

    // AU12 (+) / AU15 (-): lip corner height relative to the lip midline.
    const corner = f.p(s.mouthCorner);
    out[`geo.lipCornerHeight${name}`] = corner[1] - mouthCenterY;
    // AU12/AU20 (+) / AU18,22 (-): lateral corner position from the midline.
    out[`geo.lipCornerOut${name}`] = Math.abs(corner[0] - subnasale[0]);
  }

  // Brows drawn together (AU4, corrugator): distance between inner brow heads.
  const bl = f.mean(LM.left.browInner);
  const br = f.mean(LM.right.browInner);
  out["geo.browGap"] = Math.hypot(bl[0] - br[0], bl[2] - br[2]);

  // AU10: upper lip raised towards the nose.
  out["geo.upperLipGap"] = f.p(LM.upperLipTop)[1] - subnasale[1];
  // AU25: lips parted (inner lip distance).
  out["geo.lipGap"] = upIn[1] - loIn[1];
  // AU26/27: jaw drop (chin below the nose).
  out["geo.jawDrop"] = subnasale[1] - f.p(LM.chin)[1];
  // AU23/24/28: red-lip thickness (pressing, tightening and sucking thin the lips).
  out["geo.lipThickness"] =
    (f.p(LM.upperLipTop)[1] - upIn[1]) + (loIn[1] - f.p(LM.lowerLipBottom)[1]);

  out["pose.pitch"] = f.pitch;
  out["pose.yaw"] = f.yaw;
  out["pose.roll"] = f.roll;
  return out;
}
