import basicSsl from "@vitejs/plugin-basic-ssl";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Serve MediaPipe's WASM runtime from our own origin (public/mediapipe/wasm) so
 * the app works offline as a PWA and inside native wrappers, with no CDN.
 * The face model itself is fetched once by scripts/fetch-model.mjs.
 */
function mediapipeAssets(): Plugin {
  return {
    name: "mediapipe-assets",
    buildStart() {
      const src = here("node_modules/@mediapipe/tasks-vision/wasm");
      const dst = here("public/mediapipe/wasm");
      mkdirSync(dst, { recursive: true });
      for (const f of readdirSync(src)) copyFileSync(`${src}/${f}`, `${dst}/${f}`);
      if (!existsSync(here("public/models/face_landmarker.task"))) {
        this.warn("public/models/face_landmarker.task is missing — run `npm run fetch-model` (the app falls back to Google's CDN).");
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [mediapipeAssets(), ...(mode === "https" ? [basicSsl()] : [])],
  server: { fs: { allow: [here("..")] } },
  build: { target: "es2022", assetsInlineLimit: 0 },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
}));
