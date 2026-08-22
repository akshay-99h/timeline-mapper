// Generates icon-192.png and icon-512.png without any image dependencies:
// draws the Roamline mark (dark rounded square + glowing trail) into an RGBA
// buffer and encodes a PNG by hand (zlib is in node core).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function makeIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const S = size;
  const radius = S * 0.22;

  // trail curve: cubic-ish path sampled densely (matches icon.svg proportions)
  const P = [
    [0.19, 0.75], [0.27, 0.45], [0.36, 0.36], [0.45, 0.52],
    [0.53, 0.68], [0.60, 0.60], [0.67, 0.38], [0.74, 0.28],
    [0.81, 0.25],
  ].map(([x, y]) => [x * S, y * S]);
  const samples = [];
  for (let i = 0; i < P.length - 1; i++) {
    for (let f = 0; f < 1; f += 0.05) {
      // Catmull-Rom for smoothness
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const t = f, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      samples.push([x, y]);
    }
  }
  const head = samples[samples.length - 1];
  const coreW = S * 0.024, glowW = S * 0.06;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // rounded-rect mask
      const cx = Math.max(radius - x, x - (S - 1 - radius), 0);
      const cy = Math.max(radius - y, y - (S - 1 - radius), 0);
      const insideCorner = cx * cx + cy * cy <= radius * radius;
      if (!insideCorner) { px[i + 3] = 0; continue; }

      // background
      let r = 11, g = 11, b = 16, a = 255;

      // trail distance
      let d = 1e9;
      for (const [sx, sy] of samples) {
        const dx = x - sx, dy = y - sy;
        const dd = dx * dx + dy * dy;
        if (dd < d) d = dd;
      }
      d = Math.sqrt(d);
      const glow = Math.max(0, 1 - d / glowW) * 0.35;
      const core = Math.max(0, 1 - d / coreW);
      let mix = Math.min(1, glow + core);
      if (mix > 0) {
        r = r + (255 - r) * mix;
        g = g + (66 - g) * mix;
        b = b + (105 - b) * mix;
      }

      // head dot
      const hd = Math.hypot(x - head[0], y - head[1]);
      const headGlow = Math.max(0, 1 - hd / (S * 0.085)) * 0.5;
      const headCore = hd < S * 0.036 ? 1 : 0;
      const headWhite = hd < S * 0.016 ? 1 : 0;
      if (headGlow + headCore > 0) {
        const m = Math.min(1, headGlow + headCore);
        r = r + (255 - r) * m;
        g = g + (66 - g) * m;
        b = b + (105 - b) * m;
      }
      if (headWhite) { r = 255; g = 255; b = 255; }

      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    }
  }
  return encodePng(S, S, px);
}

// ------------------------------------------------------------- PNG encoder
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- ICO wrapper
// Modern browsers accept PNG-encoded entries inside .ico containers.
function makeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // width (0 = 256)
    e[1] = size >= 256 ? 0 : size; // height
    e.writeUInt16LE(1, 4);  // color planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    blobs.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

writeFileSync(new URL("../public/icon-192.png", import.meta.url), makeIcon(192));
writeFileSync(new URL("../public/icon-512.png", import.meta.url), makeIcon(512));
writeFileSync(
  new URL("../app/favicon.ico", import.meta.url),
  makeIco([
    { size: 32, data: makeIcon(32) },
    { size: 48, data: makeIcon(48) },
  ])
);
console.log("icons written (png + ico)");
