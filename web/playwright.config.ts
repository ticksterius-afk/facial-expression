import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the production build in Chromium with a fake camera.
 * Set FAKE_VIDEO=/path/to/clip.y4m to feed a real face video (see tests/e2e/README.md);
 * otherwise Chromium's synthetic test pattern is used (no face).
 */
const fakeVideo = process.env.FAKE_VIDEO;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        ...(fakeVideo ? [`--use-file-for-fake-video-capture=${fakeVideo}`] : []),
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15 Pro"], viewport: { width: 402, height: 874 }, browserName: "chromium", isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 }, browserName: "chromium" } },
  ],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
  },
});
