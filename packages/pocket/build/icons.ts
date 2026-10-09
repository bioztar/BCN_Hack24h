import { deflateSync } from "node:zlib";
import type { Plugin } from "vite";

// App icons are drawn in code and emitted at build time, so no binary media is committed.
export const ICON_SIZES = [180, 192, 512] as const;

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

type RGB = [number, number, number];
const BLUE: RGB = [0, 51, 153];
const GOLD: RGB = [255, 204, 0];
const WHITE: RGB = [255, 255, 255];
const GREY: RGB = [70, 76, 88];
const RED: RGB = [200, 16, 46];

function inStar(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d > r) return false;
  const a = Math.atan2(dy, dx) + Math.PI / 2;
  const seg = (Math.PI * 2) / 5;
  const t = Math.abs(((a % seg) + seg) % seg - seg / 2) / (seg / 2);
  const inner = r * 0.42;
  return d <= inner + (r - inner) * (1 - t) ** 1.6;
}

/** Colour at normalised coordinates (0..1): EU blue, ring of stars, a tiny grey official with a red stamp. */
function sample(x: number, y: number): RGB {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (inStar(x, y, 0.5 + Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.36, 0.05)) return GOLD;
  }
  if (Math.hypot(x - 0.5, y - 0.37) < 0.085) return WHITE;
  if (x > 0.46 && x < 0.54 && y > 0.345 && y < 0.36) return GREY;
  const by = y - 0.47;
  if (by >= 0 && by < 0.2 && Math.abs(x - 0.5) < 0.1 + by * 0.25) {
    if (Math.abs(x - 0.5) < 0.018 && by < 0.12) return RED;
    return GREY;
  }
  if (x > 0.62 && x < 0.72 && y > 0.6 && y < 0.66) return RED;
  if (x > 0.655 && x < 0.685 && y > 0.52 && y < 0.6) return [120, 70, 30];
  return BLUE;
}

export function renderIcon(size: number): Buffer {
  const ss = 3;
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const i = (y * size + x) * 4;
      px[i] = r / (ss * ss);
      px[i + 1] = g / (ss * ss);
      px[i + 2] = b / (ss * ss);
      px[i + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

export function iconsPlugin(): Plugin {
  const cache = new Map<number, Buffer>();
  const get = (s: number) => {
    let b = cache.get(s);
    if (!b) cache.set(s, (b = renderIcon(s)));
    return b;
  };
  return {
    name: "pocket-icons",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/icon-(\d+)\.png$/.exec(req.url ?? "");
        const size = m ? Number(m[1]) : NaN;
        if (!(ICON_SIZES as readonly number[]).includes(size)) return next();
        res.setHeader("content-type", "image/png");
        res.end(get(size));
      });
    },
    generateBundle() {
      for (const s of ICON_SIZES) this.emitFile({ type: "asset", fileName: `icon-${s}.png`, source: get(s) });
    },
  };
}
