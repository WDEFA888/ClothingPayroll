'use strict';
// 生成 256x256 应用图标：松绿底 + 白色圆角卡片 + 绿色工资条横线，并打包成 .ico。
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 256;
const green = [36, 87, 64];
const white = [255, 255, 255];

function cov(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  const d = Math.hypot(ax, ay) - r + Math.min(Math.max(qx, qy), 0);
  return Math.max(0, Math.min(1, 0.5 - d));
}
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

const bars = [
  [128, 108, 30, 7],
  [128, 128, 30, 7],
  [128, 148, 16, 7]
];

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    let c = mix(green, white, cov(x, y, 128, 128, 60, 60, 26));
    for (const [bx, by, hw, hh] of bars) c = mix(c, green, cov(x, y, bx, by, hw, hh, hh));
    raw[p++] = Math.round(c[0]);
    raw[p++] = Math.round(c[1]);
    raw[p++] = Math.round(c[2]);
    raw[p++] = 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

// 打包 ICO：单个 256x256 PNG 压缩条目。
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0; entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12);
const ico = Buffer.concat([header, entry, png]);

const out = __dirname;
fs.writeFileSync(path.join(out, 'icon.png'), png);
fs.writeFileSync(path.join(out, 'icon.ico'), ico);
console.log('icon.png', png.length, 'bytes; icon.ico', ico.length, 'bytes');
