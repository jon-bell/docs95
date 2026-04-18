// Generates packages/app/build/icon.png — a 512×512 placeholder app icon.
// Pure Node (zlib.crc32 requires Node ≥ 22). Run with: node build/make-icon.mjs
//
// Produces a solid Windows-95-teal background with a white W glyph rasterised
// from a simple vector path. Replace with a designed asset when we have one.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIDTH = 512;
const HEIGHT = 512;

const BG = [0, 122, 204, 255]; // Word-ish blue #007ACC
const FG = [255, 255, 255, 255];

// Rasterise a "W" as four diagonal strokes into an RGBA buffer.
function drawGlyph(pixels) {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const glyphHeight = 260;
  const glyphWidth = 320;
  const strokeWidth = 44;

  const topY = cy - glyphHeight / 2;
  const botY = cy + glyphHeight / 2;
  const leftX = cx - glyphWidth / 2;
  const rightX = cx + glyphWidth / 2;
  const innerTopY = topY + glyphHeight * 0.55;

  // Four vertices of the W, in order
  const pts = [
    [leftX, topY],
    [leftX + glyphWidth * 0.25, botY],
    [cx, innerTopY],
    [cx + glyphWidth * 0.25, botY],
    [rightX, topY],
  ];

  for (let i = 0; i < pts.length - 1; i++) {
    drawLine(pixels, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], strokeWidth);
  }
}

function drawLine(pixels, x0, y0, x1, y1, thickness) {
  const halfT = thickness / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  const nx = -dy / length;
  const ny = dx / length;

  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - thickness));
  const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(x0, x1) + thickness));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - thickness));
  const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(y0, y1) + thickness));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Distance from point (x,y) to the line segment
      const t = ((x - x0) * dx + (y - y0) * dy) / (length * length);
      const tc = Math.max(0, Math.min(1, t));
      const px = x0 + tc * dx;
      const py = y0 + tc * dy;
      const dist = Math.hypot(x - px, y - py);
      if (dist <= halfT) {
        const idx = (y * WIDTH + x) * 4;
        pixels[idx] = FG[0];
        pixels[idx + 1] = FG[1];
        pixels[idx + 2] = FG[2];
        pixels[idx + 3] = FG[3];
      }
    }
  }
}

// Build pixel buffer
const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
for (let i = 0; i < WIDTH * HEIGHT; i++) {
  pixels[i * 4] = BG[0];
  pixels[i * 4 + 1] = BG[1];
  pixels[i * 4 + 2] = BG[2];
  pixels[i * 4 + 3] = BG[3];
}
drawGlyph(pixels);

// Pack into PNG with filter byte (0) per scanline
const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 4));
for (let y = 0; y < HEIGHT; y++) {
  const rowStart = y * (1 + WIDTH * 4);
  raw[rowStart] = 0;
  pixels.copy(raw, rowStart + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
}
const compressed = zlib.deflateSync(raw);

// PNG chunk writer
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8;
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.resolve(__dirname, 'icon.png');
fs.writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
