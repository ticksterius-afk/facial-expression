export type Facing = "user" | "environment";

export class CameraError extends Error {}

/** Opens a camera into the <video> element, replacing any previous source. */
export async function openCamera(video: HTMLVideoElement, facing: Facing): Promise<void> {
  if (!window.isSecureContext) {
    throw new CameraError("The camera needs a secure (https) page. Open the app over https or from localhost.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("This browser does not expose a camera API.");
  }
  stopSource(video);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } },
    });
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === "NotAllowedError") throw new CameraError("Camera permission was denied. Allow camera access for this site in your browser settings and try again.");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new CameraError("No suitable camera was found.");
    throw new CameraError(`Could not open the camera (${name || String(e)}).`);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
}

/** Plays a local video file instead of the camera. */
export async function openFile(video: HTMLVideoElement, file: File): Promise<void> {
  stopSource(video);
  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  await video.play();
}

export function stopSource(video: HTMLVideoElement): void {
  const s = video.srcObject;
  if (s instanceof MediaStream) for (const t of s.getTracks()) t.stop();
  if (video.src.startsWith("blob:")) URL.revokeObjectURL(video.src);
  video.removeAttribute("src");
  video.srcObject = null;
}
