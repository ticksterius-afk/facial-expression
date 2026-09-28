#!/usr/bin/env node
// Renders public/icons/icon.svg to the PNG sizes iOS and Android need.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../public/icons/", import.meta.url));
const svg = readFileSync(dir + "icon.svg", "utf8");
const maskable = svg.replace('rx="112"', 'rx="0"');
const jobs = [
  ["apple-touch-icon.png", 180, svg.replace('rx="112"', 'rx="0"')], // iOS applies its own mask
  ["icon-192.png", 192, svg],
  ["icon-512.png", 512, svg],
  ["icon-maskable-512.png", 512, maskable],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, src] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: dir + name, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log("wrote", name);
}
await browser.close();
