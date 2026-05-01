// Render docs/branding/logo.svg into the three PWA icon sizes
// (icon-192.png, icon-512.png, icon-512-maskable.png) via sharp.
//
// Maskable variant is rendered with a 20% safe-zone padding (the SVG
// already keeps content well inside the 92px ring, but the spec says
// maskable icons must stay inside the 80% inner circle).

import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..', '..');
const svgPath = resolve(projectRoot, 'docs', 'branding', 'logo.svg');
const outDir = resolve(projectRoot, 'gui', 'designer', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath);

async function renderPlain(size, filename) {
  await sharp(svg, { density: Math.round((size / 256) * 96 * 4) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(resolve(outDir, filename));
  console.log(`[icons] ${filename}  ${size}x${size}`);
}

async function renderMaskable(size, filename) {
  // Maskable PWA spec: safe zone is the inner 80% (radius 0.4 * size from center).
  // logo.svg already centres ring at r=92 inside 256 viewBox (= 71.9% diameter,
  // 35.9% radius — under the 40% limit). We still pad by 20% to give every
  // maskable adapter (round/squircle/circle) a clean amber edge to crop into.
  const inner = Math.round(size * 0.8);
  const offset = Math.round((size - inner) / 2);
  const innerPng = await sharp(svg, { density: Math.round((inner / 256) * 96 * 4) })
    .resize(inner, inner)
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0xf5, g: 0x9e, b: 0x0b, alpha: 1 },
    },
  })
    .composite([{ input: innerPng, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(outDir, filename));
  console.log(`[icons] ${filename}  ${size}x${size} (maskable, safe-zone 80%)`);
}

await renderPlain(192, 'icon-192.png');
await renderPlain(512, 'icon-512.png');
await renderMaskable(512, 'icon-512-maskable.png');
console.log('[icons] done');
