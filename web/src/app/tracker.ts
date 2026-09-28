import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { FaceFrame, measureGeometry, type Landmark } from "../platform/mediapipe/geometry.ts";

const LOCAL_MODEL = "./models/face_landmarker.task";
const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface TrackedFace {
  landmarks: Landmark[];
  measurements: Record<string, number>;
}

/** MediaPipe Face Landmarker wrapper producing engine measurements. */
export class Tracker {
  private readonly landmarker: FaceLandmarker;
  readonly delegate: "GPU" | "CPU";

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
    Object.assign(measurements, measureGeometry(new FaceFrame(landmarks, video.videoWidth, video.videoHeight)));
    return { landmarks, measurements };
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
