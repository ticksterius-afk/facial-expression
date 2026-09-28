import "./styles.css";
import { CameraError, openCamera, openFile, type Facing } from "./app/camera.ts";
import { MODEL } from "./app/model.ts";
import { Overlay } from "./app/overlay.ts";
import { DEFAULT_SETTINGS, load, loadRaw, remove, save, type Settings } from "./app/storage.ts";
import { Tracker } from "./app/tracker.ts";
import { UI } from "./app/ui.ts";
import { EmotionEngine, type FrameResult } from "./engine/index.ts";
import type { Landmark } from "./platform/mediapipe/geometry.ts";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const CALIBRATION_KEY = "calibration.mediapipe";
const UI_INTERVAL_MS = 80;

const video = $<HTMLVideoElement>("#video");
const stage = $("#stage");
const overlay = new Overlay($<HTMLCanvasElement>("#overlay"));
const settings: Settings = load("settings", DEFAULT_SETTINGS);
const engine = new EmotionEngine(MODEL, "mediapipe", { sensitivity: settings.sensitivity });
const ui = new UI(engine);

let tracker: Tracker | null = null;
let facing: Facing = "user";
let source: "camera" | "file" = "camera";
let running = false;
let lastVideoTime = -1;
let lastUi = 0;
let lastT = 0;
let fps = 0;
let lastOut: FrameResult | null = null;
let lastLandmarks: Landmark[] | null = null;
let wakeLock: { release(): Promise<void> } | null = null;

// Restore a previous calibration for this device.
const saved = loadRaw<Record<string, number>>(CALIBRATION_KEY);
if (saved) engine.baseline.setCalibration(saved);

// ------------------------------------------------------------------ start
$("#btn-start").addEventListener("click", () => start("camera"));
$<HTMLInputElement>("#file-input").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) start("file", file);
});

async function start(kind: "camera" | "file", file?: File): Promise<void> {
  const err = $("#start-error");
  err.hidden = true;
  const btn = $<HTMLButtonElement>("#btn-start");
  btn.disabled = true;
  btn.textContent = "Loading face model…";
  try {
    tracker ??= await Tracker.create(settings.delegate);
    source = kind;
    if (kind === "camera") await openCamera(video, facing);
    else await openFile(video, file!);
    applyMirror();
    $("#start").hidden = true;
    running = true;
    requestWakeLock();
    schedule();
    if (kind === "camera" && !engine.baseline.calibrated) $("#calib").hidden = false;
    setStatus();
  } catch (e) {
    err.textContent = e instanceof CameraError ? e.message : `Could not start: ${(e as Error).message ?? e}`;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Start camera";
  }
}

// ------------------------------------------------------------------ loop
function schedule(): void {
  if (!running) return;
  if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(() => frame());
  else requestAnimationFrame(() => frame());
}

function frame(): void {
  if (!running || !tracker) return;
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime && !document.hidden) {
    lastVideoTime = video.currentTime;
    const t = performance.now();
    const face = tracker.detect(video, t);
    const out = engine.process(t, face?.measurements ?? null);
    lastOut = out;
    lastLandmarks = face?.landmarks ?? null;
    if (lastT) fps = fps * 0.9 + (1000 / Math.max(1, t - lastT)) * 0.1;
    lastT = t;
    overlay.draw(video, lastLandmarks, out.regions, out.aus, settings.overlay, isMirrored());
    if (out.events.length) ui.addEvents(out.events);
    handleCalibration(out);
    if (t - lastUi > UI_INTERVAL_MS) {
      lastUi = t;
      ui.update(out, fps);
    }
  }
  schedule();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (running) requestWakeLock();
});

// ------------------------------------------------------------------ calibration
$("#btn-calib-go").addEventListener("click", beginCalibration);
$("#btn-calib-skip").addEventListener("click", () => { $("#calib").hidden = true; });
$("#status").addEventListener("click", () => { if (running) $("#calib").hidden = false; });
$("#btn-recalibrate").addEventListener("click", () => {
  ($("#settings") as HTMLDialogElement).close();
  $("#calib").hidden = false;
});
$("#btn-forget").addEventListener("click", () => {
  engine.baseline.reset();
  remove(CALIBRATION_KEY);
  toast("Calibration forgotten — the baseline will be learned from scratch.");
  setStatus();
});

let calibrating = false;
function beginCalibration(): void {
  if (!running) return;
  calibrating = true;
  engine.startCalibration(performance.now(), 3);
  $("#calib-title").textContent = "Hold still — relaxed face";
  $("#calib-text").textContent = "Look at the screen, lips together, brows relaxed.";
  $("#btn-calib-go").hidden = true;
  $("#btn-calib-skip").hidden = true;
}

function handleCalibration(out: FrameResult): void {
  if (!calibrating) return;
  const arc = document.getElementById("calib-arc");
  if (arc) arc.style.strokeDashoffset = String(276.46 * (1 - out.calibration.progress));
  if (!out.calibration.result) return;
  calibrating = false;
  $("#calib").hidden = true;
  $("#btn-calib-go").hidden = false;
  $("#btn-calib-skip").hidden = false;
  $("#calib-title").textContent = "Calibrate your neutral face";
  $("#calib-text").innerHTML = "Everyone's resting face is different. Look at the screen with a relaxed, neutral expression for three seconds so expressions are measured from <em>your</em> baseline.";
  if (arc) arc.style.strokeDashoffset = "276.46";
  if (out.calibration.result === "done") {
    const cal = engine.baseline.getCalibration();
    if (cal) save(CALIBRATION_KEY, cal);
    toast("Calibrated to your neutral face.");
  } else {
    toast("Couldn't see your face clearly — try again with your face in view.");
  }
  setStatus();
}

function setStatus(): void {
  const chip = $("#status");
  chip.classList.toggle("ok", engine.baseline.calibrated);
  $("#status-text").textContent = engine.baseline.calibrated ? `Calibrated · ${tracker?.delegate ?? ""}` : "Tap to calibrate";
}

// ------------------------------------------------------------------ camera controls
$("#btn-flip").addEventListener("click", async () => {
  if (source !== "camera") return;
  facing = facing === "user" ? "environment" : "user";
  try {
    await openCamera(video, facing);
    applyMirror();
  } catch (e) {
    toast((e as Error).message);
  }
});

function isMirrored(): boolean {
  return source === "camera" && facing === "user" && settings.mirror;
}
function applyMirror(): void {
  stage.classList.toggle("mirrored", isMirrored());
}

// ------------------------------------------------------------------ settings
const dialog = $("#settings") as HTMLDialogElement;
const sens = $<HTMLInputElement>("#sens");
const sensOut = $("#sens-out");
const overlayMode = $<HTMLSelectElement>("#overlay-mode");
const mirror = $<HTMLInputElement>("#mirror");
const delegate = $<HTMLSelectElement>("#delegate");

$("#btn-settings").addEventListener("click", () => {
  sens.value = String(settings.sensitivity);
  sensOut.textContent = `${settings.sensitivity.toFixed(1)}×`;
  overlayMode.value = settings.overlay;
  mirror.checked = settings.mirror;
  delegate.value = settings.delegate;
  dialog.showModal();
});
sens.addEventListener("input", () => {
  settings.sensitivity = Number(sens.value);
  engine.sensitivity = settings.sensitivity;
  sensOut.textContent = `${settings.sensitivity.toFixed(1)}×`;
  save("settings", settings);
});
overlayMode.addEventListener("change", () => { settings.overlay = overlayMode.value as Settings["overlay"]; save("settings", settings); });
mirror.addEventListener("change", () => { settings.mirror = mirror.checked; applyMirror(); save("settings", settings); });
delegate.addEventListener("change", async () => {
  settings.delegate = delegate.value as Settings["delegate"];
  save("settings", settings);
  if (!tracker) return;
  const old = tracker;
  tracker = null;
  old.close();
  tracker = await Tracker.create(settings.delegate);
  setStatus();
});

// ------------------------------------------------------------------ misc
let toastTimer = 0;
function toast(msg: string): void {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 3200);
}

async function requestWakeLock(): Promise<void> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (wl && !document.hidden) wakeLock = await wl.request("screen");
  } catch {
    wakeLock = null; // not supported or denied: the screen may dim, detection still works
  }
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service worker registration failed", e));
  });
}

// Test/debug hook (used by the end-to-end test; harmless in production).
(window as unknown as { __mien: unknown }).__mien = {
  get last() { return lastOut; },
  get delegate() { return tracker?.delegate; },
  engine,
  get wakeLock() { return wakeLock !== null; },
};
