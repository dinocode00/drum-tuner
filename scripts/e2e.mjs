// End-to-end check: serve the app, feed synthesized drum hits into Chromium's
// fake microphone, and verify the app reads the right pitches.
// Usage: node scripts/e2e.mjs [screenshotDir]
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { renderDrum, renderLugTap } from '../js/audio/drumsynth.js';

const root = resolve(new URL('..', import.meta.url).pathname);
const shots = process.argv[2] || join(tmpdir(), 'drum-tuner-shots');
const SR = 48000;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

function track(hits, gapSec = 1.4) {
  const total = Math.round(SR * (1 + hits.length * gapSec));
  const out = new Float32Array(total);
  let seed = 1;
  for (let i = 0; i < total; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; out[i] = 0.001 * ((seed / 2 ** 32) * 2 - 1); }
  hits.forEach((h, k) => {
    const at = Math.round(SR * (1 + k * gapSec));
    for (let i = 0; i < h.length && at + i < total; i++) out[at + i] += h[i] * 0.6;
  });
  return out;
}

async function withMic(samples, name, fn) {
  const file = join(tmpdir(), `drum-tuner-${name}.wav`);
  await writeFile(file, wav(samples));
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`, '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.grantPermissions(['microphone'], { origin: url });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    await page.goto(url);
    await fn(page);
  } finally {
    await browser.close();
  }
  if (errors.length) throw new Error(`Console errors:\n${errors.join('\n')}`);
}

const cents = (a, b) => 1200 * Math.log2(a / b);
let failures = 0;
function check(ok, msg) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) failures++;
}

await mkdir(shots, { recursive: true });

// 1) Pitch mode on the 12" tom (target B2 = 123.47 Hz); drum is a bit flat at 118 Hz.
const tomHz = 118;
await withMic(track([0, 1, 2, 3].map(() => renderDrum({ fundamental: tomHz, type: 'tom', diameter: 12, resonance: 'high', sampleRate: SR }))), 'pitch', async (page) => {
  await page.getByRole('button', { name: /Rack tom 2/ }).click();
  await page.getByRole('tab', { name: 'Pitch' }).click();
  await page.locator('button.listen').click();
  await page.waitForFunction(() => window.__drumTuner.session.history.length >= 2, null, { timeout: 15000 });
  const got = await page.evaluate(() => window.__drumTuner.session.history.slice());
  console.log('  pitch readings:', got.map((f) => f.toFixed(1)).join(', '));
  check(got.every((f) => Math.abs(cents(f, tomHz)) < 25), `pitch mode reads ${tomHz} Hz within 25¢`);
  const verdictText = await page.locator('.verdict').textContent();
  check(/tighten/i.test(verdictText), `flat drum says tighten ("${verdictText}")`);
  await page.screenshot({ path: join(shots, '1-pitch.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Spectrum' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(shots, '2-spectrum.png'), fullPage: true });
});

// 2) Lug mode on the 12" tom batter: taps at slightly different lug pitches.
const lugHz = [214, 222, 205, 216, 230, 216];
await withMic(track(lugHz.map((f) => renderLugTap(f, SR)), 1.1), 'lugs', async (page) => {
  await page.getByRole('button', { name: /Rack tom 2/ }).click();
  await page.getByRole('tab', { name: 'Lugs' }).click();
  await page.locator('button.listen').click();
  await page.waitForFunction(() => {
    const s = window.__drumTuner.state;
    const r = s.readings[s.ui.drumId].batter;
    return r.filter((x) => x > 0).length >= 6;
  }, null, { timeout: 20000 });
  const readings = await page.evaluate(() => {
    const s = window.__drumTuner.state;
    return s.readings[s.ui.drumId].batter;
  });
  // Lugs are visited in star order: 1,4,3,6,2,5 for 6 lugs.
  const order = [0, 3, 2, 5, 1, 4];
  const expected = new Array(6);
  order.forEach((lug, k) => (expected[lug] = lugHz[k]));
  console.log('  lug readings:', readings.map((f) => f && f.toFixed(1)).join(', '));
  check(readings.every((f, i) => f && Math.abs(cents(f, expected[i])) < 20), 'lug readings land on the right lugs within 20¢');
  await page.screenshot({ path: join(shots, '3-lugs.png'), fullPage: true });
});

// 3) Static screens.
await withMic(track([]), 'quiet', async (page) => {
  await page.screenshot({ path: join(shots, '0-tune.png'), fullPage: true });
  await page.getByRole('button', { name: 'Kit' }).click();
  await page.screenshot({ path: join(shots, '4-kit.png'), fullPage: true });
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, '5-editor.png') });
  await page.getByRole('button', { name: 'Play target' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Learn' }).click();
  await page.screenshot({ path: join(shots, '6-learn.png'), fullPage: true });
});

server.close();
console.log(`Screenshots in ${shots}`);
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
