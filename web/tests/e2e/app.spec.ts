import { expect, test, type Page } from "@playwright/test";

interface Snapshot { face: boolean; primary: string; complex: string[]; calibrated: boolean }
const last = (page: Page) => page.evaluate(() => {
  const o = (window as unknown as { __mien: { last: { face: boolean; primary: { id: string }; complex: { id: string }[]; calibrated: boolean } | null } }).__mien.last;
  return o ? { face: o.face, primary: o.primary.id, complex: o.complex.map((c) => c.id), calibrated: o.calibrated } : null;
});

async function startCamera(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mien" })).toBeVisible();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.locator("#start")).toBeHidden({ timeout: 60_000 });
  await expect.poll(() => last(page), { timeout: 30_000 }).not.toBeNull();
}

test("starts the camera, loads the face model and runs the engine", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await startCamera(page);
  // First run without a stored calibration offers to calibrate.
  await expect(page.locator("#calib")).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.locator("#calib")).toBeHidden();
  // Panels render every expression and AU; the extended catalogue is hidden until enabled.
  await expect(page.locator("#tab-emotions .row")).toHaveCount(44);
  await expect(page.locator("#tab-emotions .row:visible")).toHaveCount(38);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Extended emotion catalogue").check();
  await page.keyboard.press("Escape");
  await expect(page.locator("#tab-emotions .row:visible")).toHaveCount(44);
  expect(await page.evaluate(() => (window as unknown as { __mien: { engine: { extended: boolean } } }).__mien.engine.extended)).toBe(true);
  await page.getByRole("tab", { name: "Face" }).click();
  await expect(page.locator("#tab-face .row.au").first()).toBeVisible();
  await page.getByRole("tab", { name: "Log" }).click();
  await expect(page.locator("#timeline")).toBeVisible();
  await page.screenshot({ path: info.outputPath("running.png") });
  expect(errors).toEqual([]);
});

test("recognises expressions in a real face video", async ({ page }, info) => {
  test.skip(!process.env.FAKE_VIDEO, "set FAKE_VIDEO to a .y4m face clip");
  await startCamera(page);
  await page.getByRole("button", { name: "Not now" }).click();
  const samples: Snapshot[] = [];
  const shots = [4000, 9000, 14000];
  const t0 = Date.now();
  while (Date.now() - t0 < 21_000) {
    const s = await last(page);
    if (s) samples.push(s);
    const elapsed = Date.now() - t0;
    if (shots.length && elapsed > shots[0]) {
      await page.screenshot({ path: info.outputPath(`live-${shots.shift()}.png`) });
    }
    await page.waitForTimeout(250);
  }
  const withFace = samples.filter((s) => s.face);
  const labels = [...new Set(withFace.map((s) => s.primary))];
  const complex = [...new Set(withFace.flatMap((s) => s.complex))];
  console.log(`samples=${samples.length} face=${withFace.length} primary labels=${labels.join(",")} complex=${complex.join(",")}`);
  expect(withFace.length / samples.length).toBeGreaterThan(0.8);
  expect(labels).toContain("happiness");
  expect(labels.length).toBeGreaterThan(1);

  // The explanation panel lists the actions behind the current label.
  await page.getByRole("tab", { name: "Why" }).click();
  await expect(page.locator("#tab-why .why-head h3")).toBeVisible();
  await page.screenshot({ path: info.outputPath("why.png") });
  await page.getByRole("tab", { name: "Face" }).click();
  await expect(page.locator("#tab-face .stat").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("face.png") });
});

test("calibrates to a neutral face", async ({ page }) => {
  test.skip(!process.env.FAKE_VIDEO, "set FAKE_VIDEO to a .y4m face clip");
  await startCamera(page);
  await page.getByRole("button", { name: "Calibrate" }).click();
  await expect(page.locator("#toast")).toContainText(/Calibrated|Couldn't see/, { timeout: 15_000 });
  await expect.poll(async () => (await last(page))?.calibrated, { timeout: 5000 }).toBe(true);
  await expect(page.locator("#status")).toHaveClass(/ok/);
});
