import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { FaceFrame, measureGeometry, type Landmark } from "../platform/mediapipe/geometry.ts";
import { bufferSampler, measureTexture, textureBounds } from "../platform/mediapipe/texture.ts";

const LOCAL_MODEL = "./models/face_landmarker.task";
const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
/** Forehead crop is read back at most this wide: plenty for wrinkles, cheap to copy from the GPU. */
const TEXTURE_MAX_WIDTH = 200;

export interface TrackedFace {
  landmarks: Landmark[];
  measurements: Record<string, number>;
}

/** MediaPipe Face Landmarker wrapper producing engine measurements. */
export class Tracker {
  private readonly landmarker: FaceLandmarker;
  readonly delegate: "GPU" | "CPU";
  private readonly texCanvas = document.createElement("canvas");
  private texCtx: CanvasRenderingContext2D | null = null;
  private texGray = new Float32Array(0);
  /** Turned off if the browser refuses to read the camera's pixels. */
  private textureOk = true;

  private constructor(landmarker: FaceLandmarker, delegate: "GPU" | "CPU") {
    this.landmarker = landmarker;
    this.delegate = delegate;
  }

  static async create(preferred: "GPU" | "CPU"): Promise<Tracker> {
    const wasm = new URL("./mediapipe/wasm", document.baseURI).href;
    const fileset = await FilesetResolver.forVisionTasks(wasm);
    const modelAssetPath = (await exists(LOCAL_MODEL)) ? LOCAL_MODEL : CDN_MODEL;
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    if (preferred === "GPU") {
      try {
        return new Tracker(await make("GPU"), "GPU");
      } catch (e) {
        console.warn("GPU delegate unavailable, falling back to CPU", e);
      }
    }
    return new Tracker(await make("CPU"), "CPU");
  }

  /** Runs detection on the current video frame. `t` must increase monotonically (ms). */
  detect(video: HTMLVideoElement, t: number): TrackedFace | null {
    const res: FaceLandmarkerResult = this.landmarker.detectForVideo(video, t);
    const landmarks = res.faceLandmarks[0];
    if (!landmarks || landmarks.length < 468) return null;
    const measurements: Record<string, number> = {};
    for (const c of res.faceBlendshapes[0]?.categories ?? []) {
      if (c.categoryName && c.categoryName !== "_neutral") measurements[c.categoryName] = c.score;
    }
    const frame = new FaceFrame(landmarks, video.videoWidth, video.videoHeight);
    Object.assign(measurements, measureGeometry(frame));
    if (this.textureOk) {
      try {
        Object.assign(measurements, this.texture(video, frame));
      } catch (e) {
        console.warn("forehead texture unavailable", e);
        this.textureOk = false;
      }
    }
    return { landmarks, measurements };
  }

  /** Forehead wrinkle / glabella furrow measurements from a small crop of the frame. */
  private texture(video: HTMLVideoElement, frame: FaceFrame): Record<string, number> {
    const b = textureBounds(frame);
    const x0 = Math.max(0, b.x);
    const y0 = Math.max(0, b.y);
    const x1 = Math.min(video.videoWidth, b.x + b.w);
    const y1 = Math.min(video.videoHeight, b.y + b.h);
    if (x1 - x0 < 16 || y1 - y0 < 16) return {};
    const scale = Math.min(1, TEXTURE_MAX_WIDTH / (x1 - x0));
    const w = Math.max(2, Math.round((x1 - x0) * scale));
    const h = Math.max(2, Math.round((y1 - y0) * scale));
    const c = this.texCanvas;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.texCtx ??= c.getContext("2d", { willReadFrequently: true });
    const ctx = this.texCtx;
    if (!ctx) throw new Error("no 2D context");
    ctx.drawImage(video, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    if (this.texGray.length !== w * h) this.texGray = new Float32Array(w * h);
    const gray = this.texGray;
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    // Crop pixel (i, j) is frame pixel (x0 + i / scale, y0 + j / scale).
    return measureTexture(frame, bufferSampler(gray, w, h, x0, y0, scale));
  }

  close(): void {
    this.landmarker.close();
  }
}

async function exists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && !(r.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}
