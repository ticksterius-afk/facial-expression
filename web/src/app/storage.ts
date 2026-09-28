/**
 * Per-device preferences and calibration. Storage can be unavailable (private
 * browsing, blocked site data), so every access is guarded and callers get
 * defaults instead of exceptions.
 */
const PREFIX = "mien.";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function loadRaw<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export interface Settings {
  sensitivity: number;
  overlay: "regions" | "labels" | "off";
  mirror: boolean;
  delegate: "GPU" | "CPU";
}

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, overlay: "regions", mirror: true, delegate: "GPU" };
