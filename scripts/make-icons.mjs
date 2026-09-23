// Renders icons/icon.svg to the PNG sizes iOS and the manifest need.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const [size, name, bleed] of [[180, 'apple-touch-icon.png', true], [192, 'icon-192.png', false], [512, 'icon-512.png', false]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // iOS rounds corners itself, so the touch icon is a full square.
  const art = bleed ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<style>html,body{margin:0;background:#0e0f12}</style>${art.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: new URL(`../icons/${name}`, import.meta.url).pathname, omitBackground: false });
  await page.close();
}
await browser.close();
