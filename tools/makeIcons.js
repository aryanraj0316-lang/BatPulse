/**
 * Generates the placeholder brand images (icon, adaptive icon foreground, splash, favicon) with no dependencies.
 *   node tools/makeIcons.js
 * Deterministic: running it twice gives identical files. Replace the PNGs in assets/ with final art any time
 * (same file names and sizes); nothing else needs to change. See docs/RELEASE_CHECKLIST.md.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets');
const BG = [4, 7, 17]; // #040711, the game's void black
const CYAN = [77, 240, 255]; // sonar cyan

// ---------------------------------------------------------------- PNG writer (RGBA, 8 bit)
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- the picture, in unit coordinates (-1..1)
const inPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// right half of a bat: wing with three scallops, ear and body; mirrored for the left half
const HALF = [[0, -0.2], [0.08, -0.5], [0.14, -0.22], [0.5, -0.46], [0.8, -0.1], [0.66, -0.02], [0.58, 0.18], [0.44, 0.06], [0.3, 0.26], [0.16, 0.1], [0.08, 0.34], [0, 0.4]];
const LEFT = HALF.map(([x, y]) => [-x, y]);

/** Colour (r,g,b,a 0..1) of the picture at unit position (x,y). `rings` / `bg` choose what is drawn. */
function shade(x, y, { bg, scale }) {
  const px = x / scale;
  const py = y / scale;
  const r = Math.hypot(px, py + 0.02);
  let a = 0;
  let col = CYAN;
  // sonar rings: fading outwards
  for (const [ring, w, alpha] of [[0.62, 0.012, 0.9], [0.8, 0.01, 0.55], [0.98, 0.008, 0.3]]) {
    const d = Math.abs(r - ring);
    if (d < w) a = Math.max(a, alpha * (1 - d / w));
  }
  // the bat
  if (inPoly(px, py + 0.02, HALF) || inPoly(px, py + 0.02, LEFT)) {
    a = 1;
    col = [225, 250, 255];
  }
  if (bg) {
    const out = [0, 1, 2].map((i) => Math.round(BG[i] * (1 - a) + col[i] * a));
    return [out[0], out[1], out[2], 255];
  }
  return [col[0], col[1], col[2], Math.round(a * 255)];
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 2; // 2x2 supersampling
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = ((x + (sx + 0.5) / SS) / size) * 2 - 1;
          const uy = ((y + (sy + 0.5) / SS) / size) * 2 - 1;
          const c = shade(ux, uy, opts);
          // premultiply so transparent samples do not darken the edge
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const o = (y * size + x) * 4;
      const n = SS * SS;
      if (a > 0) {
        buf[o] = Math.round(r / a); buf[o + 1] = Math.round(g / a); buf[o + 2] = Math.round(b / a);
      }
      buf[o + 3] = Math.round(a / n);
    }
  }
  return png(size, buf);
}

fs.mkdirSync(OUT, { recursive: true });
const files = {
  'icon.png': render(1024, { bg: true, scale: 1.0 }), // iOS / store icon: full bleed, solid
  'adaptive-icon.png': render(1024, { bg: false, scale: 1.5 }), // Android foreground: transparent, inside the 66 % safe zone
  'splash-icon.png': render(512, { bg: false, scale: 1.0 }),
  'favicon.png': render(48, { bg: true, scale: 1.0 }),
};
for (const [name, data] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), data);
  console.log(`${name}  ${data.length} bytes`);
}
