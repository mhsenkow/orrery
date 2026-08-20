#!/usr/bin/env node
/** Headless site screenshots for README / site/img.
 *  Requires a local server: python3 -m http.server 8765
 *  Uses Chrome headless + puppeteer-core (no browser download). */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site/img');
const BASE = process.env.ORRERY_BASE || 'http://localhost:8765/vr/?demo=1&seed=20260808&land=auto';
const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SHOTS = [
  ['earth-hud.png', 'hud'],
  ['earth-currents.png', 'currents'],
  ['earth-local.png', 'local'],
  ['worlds-picker.png', 'worlds'],
];

mkdirSync(OUT, { recursive: true });

let puppeteer;
try {
  puppeteer = await import('puppeteer-core');
} catch {
  console.error('capture-site: install puppeteer-core once: npm install --no-save puppeteer-core');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
page.setDefaultTimeout(60000);

for (const [file, pitch] of SHOTS) {
  const url = `${BASE}${BASE.includes('?') ? '&' : '?'}pitch=${pitch}`;
  process.stdout.write(`capture ${file} … `);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => globalThis.__orreryPitchReady === true, { timeout: 60000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: join(OUT, file), type: 'png' });
  console.log('ok');
}

await browser.close();
console.log(`wrote ${SHOTS.length} images to site/img/`);
