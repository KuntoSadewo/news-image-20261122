// The World in One Day — 22 November 2026
// A one-page newspaper front page summing up the world's news of
// Sunday 22 November 2026, drawn pixel by pixel with the Node standard
// library only. No network, no clock, no randomness: two runs write
// the same bytes to /output/entry.png (or $MAKEFUN_OUTPUT_DIR).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- palette ----------
const PAPER: RGB = [245, 239, 223];
const INK: RGB = [25, 25, 25];
const NAVY: RGB = [22, 50, 74];
const NAVY2: RGB = [38, 74, 104];
const RED: RGB = [168, 35, 26];
const TEAL: RGB = [15, 107, 92];
const GOLD: RGB = [176, 124, 24];
const BLUE: RGB = [43, 95, 138];
const GREY: RGB = [107, 98, 87];
const WHITE: RGB = [255, 255, 255];
const CREAM: RGB = [255, 250, 235];

type RGB = [number, number, number];

// ---------- PNG encoder (stdlib zlib) ----------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(rgb: Uint8Array, width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- canvas ----------
class Canvas {
  readonly w = W;
  readonly h = H;
  readonly px = new Uint8Array(W * H * 3);

  constructor() {
    this.fill(PAPER);
  }

  fill(c: RGB): void {
    for (let i = 0; i < this.px.length; i += 3) {
      this.px[i] = c[0];
      this.px[i + 1] = c[1];
      this.px[i + 2] = c[2];
    }
  }

  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) this.set(i, j, c);
    }
  }

  frame(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }

  hline(x: number, y: number, w: number, t: number, c: RGB): void {
    this.rect(x, y, w, t, c);
  }

  vline(x: number, y: number, h: number, t: number, c: RGB): void {
    this.rect(x, y, t, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    const r = Math.floor(t / 2);
    for (;;) {
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) this.set(x + i, y + j, c);
      }
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  circle(cx: number, cy: number, r: number, c: RGB): void {
    let x = r;
    let y = 0;
    let err = 0;
    while (x >= y) {
      this.set(cx + x, cy + y, c);
      this.set(cx + y, cy + x, c);
      this.set(cx - y, cy + x, c);
      this.set(cx - x, cy + y, c);
      this.set(cx - x, cy - y, c);
      this.set(cx - y, cy - x, c);
      this.set(cx + y, cy - x, c);
      this.set(cx + x, cy - y, c);
      y += 1;
      err += 1 + 2 * y;
      if (2 * (err - x) + 1 > 0) {
        x -= 1;
        err += 1 - 2 * x;
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) this.set(cx + x, cy + y, c);
    }
  }

  triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minX = Math.min(x0, x1, x2);
    const maxX = Math.max(x0, x1, x2);
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (d === 0) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
        const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
        const g = 1 - a - b;
        if (a >= 0 && b >= 0 && g >= 0) this.set(x, y, c);
      }
    }
  }
}

// ---------- 5x7 bitmap font, drawn from scratch ----------
// Each glyph is 7 rows of 5 cells; "#" is ink, "." is empty.
const FONT: Record<string, string[]> = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  a: [".....", ".....", ".####", "....#", ".####", "#...#", ".####"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  c: [".....", ".....", ".####", "#....", "#....", "#....", ".####"],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  f: ["..##.", ".#...", ".#...", "####.", ".#...", ".#...", ".#..."],
  g: [".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  i: ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  j: ["...#.", ".....", "..##.", "...#.", "...#.", "#..#.", ".##.."],
  k: ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  l: [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  p: [".....", ".....", "####.", "#...#", "#...#", "####.", "#...."],
  q: [".....", ".....", ".####", "#...#", "#...#", ".####", "....#"],
  r: [".....", ".....", "#.##.", "##...", "#....", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  t: [".#...", ".#...", "####.", ".#...", ".#...", ".#...", "..##."],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#..##", ".##.#"],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  w: [".....", ".....", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  y: [".....", ".....", "#...#", "#...#", "#...#", ".####", "....#"],
  z: [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".....", ".##..", ".#..."],
  ":": [".....", ".....", ".##..", ".##..", ".....", ".##..", ".##.."],
  ";": [".....", ".....", ".##..", ".##..", ".....", ".##..", ".#..."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  '"': [".#.#.", ".#.#.", ".#.#.", ".....", ".....", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "%": ["#...#", "#..#.", "...#.", "..#..", ".#...", "#..#.", "#...#"],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "&": [".###.", "#...#", "#...#", ".#...", "#.#.#", "#..#.", ".##.#"],
  "+": [".....", ".....", "..#..", ".###.", "..#..", ".....", "....."],
  "=": [".....", ".....", ".....", "#####", ".....", "#####", "....."],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "•": [".....", ".....", "..#..", ".###.", ".###.", "..#..", "....."],
  "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
  "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
};

// ---------- text ----------
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT["?"];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "#") {
          cv.rect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (textWidth(test, scale) <= maxW || cur === "") {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------- pictograms (white line art on a coloured panel) ----------
function iconShip(cv: Canvas, x: number, y: number, s: number): void {
  // hull
  cv.triangle(x + 4 * s, y + 34 * s, x + 60 * s, y + 34 * s, x + 52 * s, y + 48 * s, WHITE);
  cv.triangle(x + 4 * s, y + 34 * s, x + 52 * s, y + 48 * s, x + 12 * s, y + 48 * s, WHITE);
  // containers
  cv.rect(x + 14 * s, y + 20 * s, 12 * s, 14 * s, WHITE);
  cv.rect(x + 30 * s, y + 20 * s, 12 * s, 14 * s, WHITE);
  cv.rect(x + 22 * s, y + 8 * s, 12 * s, 12 * s, WHITE);
  // mast + waves
  cv.vline(x + 48 * s, y + 6 * s, 28 * s, 2 * s, WHITE);
  cv.line(x + 6 * s, y + 54 * s, x + 20 * s, y + 54 * s, 2 * s, WHITE);
  cv.line(x + 26 * s, y + 54 * s, x + 40 * s, y + 54 * s, 2 * s, WHITE);
  cv.line(x + 46 * s, y + 54 * s, x + 58 * s, y + 54 * s, 2 * s, WHITE);
}

function iconStar(cv: Canvas, x: number, y: number, s: number): void {
  const cx = x + 32 * s;
  const cy = y + 32 * s;
  const R = 26 * s;
  const r = 11 * s;
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push([cx + Math.round(rad * Math.cos(ang)), cy + Math.round(rad * Math.sin(ang))]);
  }
  for (let i = 0; i < 10; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % 10];
    cv.triangle(cx, cy, p0[0], p0[1], p1[0], p1[1], WHITE);
  }
  cv.disc(cx, cy, 5 * s, NAVY);
}

function iconBuilding(cv: Canvas, x: number, y: number, s: number): void {
  cv.rect(x + 10 * s, y + 12 * s, 20 * s, 44 * s, WHITE);
  cv.rect(x + 34 * s, y + 24 * s, 20 * s, 32 * s, WHITE);
  // windows (knocked out in panel colour)
  cv.rect(x + 15 * s, y + 18 * s, 4 * s, 4 * s, RED);
  cv.rect(x + 21 * s, y + 18 * s, 4 * s, 4 * s, RED);
  cv.rect(x + 15 * s, y + 28 * s, 4 * s, 4 * s, RED);
  cv.rect(x + 39 * s, y + 30 * s, 4 * s, 4 * s, RED);
  cv.rect(x + 45 * s, y + 30 * s, 4 * s, 4 * s, RED);
  // crack
  cv.line(x + 24 * s, y + 12 * s, x + 18 * s, y + 26 * s, 2 * s, RED);
  cv.line(x + 18 * s, y + 26 * s, x + 26 * s, y + 38 * s, 2 * s, RED);
  cv.line(x + 26 * s, y + 38 * s, x + 20 * s, y + 56 * s, 2 * s, RED);
}

function iconChart(cv: Canvas, x: number, y: number, s: number): void {
  // axes
  cv.vline(x + 8 * s, y + 8 * s, 44 * s, 2 * s, WHITE);
  cv.hline(x + 8 * s, y + 52 * s, 48 * s, 2 * s, WHITE);
  // falling line with arrowhead
  cv.line(x + 12 * s, y + 14 * s, x + 26 * s, y + 24 * s, 3 * s, WHITE);
  cv.line(x + 26 * s, y + 24 * s, x + 38 * s, y + 22 * s, 3 * s, WHITE);
  cv.line(x + 38 * s, y + 22 * s, x + 52 * s, y + 44 * s, 3 * s, WHITE);
  cv.triangle(x + 52 * s, y + 44 * s, x + 44 * s, y + 40 * s, x + 50 * s, y + 50 * s, WHITE);
}

function iconGavel(cv: Canvas, x: number, y: number, s: number): void {
  // head
  cv.rect(x + 10 * s, y + 10 * s, 28 * s, 12 * s, WHITE);
  cv.rect(x + 6 * s, y + 8 * s, 36 * s, 4 * s, WHITE);
  // handle (diagonal) with a knob at its end
  cv.line(x + 24 * s, y + 22 * s, x + 46 * s, y + 46 * s, 5 * s, WHITE);
  cv.disc(x + 48 * s, y + 48 * s, 4 * s, WHITE);
  // sound block
  cv.rect(x + 8 * s, y + 54 * s, 30 * s, 4 * s, WHITE);
}

function iconFlame(cv: Canvas, x: number, y: number, s: number): void {
  cv.triangle(x + 32 * s, y + 4 * s, x + 10 * s, y + 40 * s, x + 30 * s, y + 40 * s, WHITE);
  cv.triangle(x + 32 * s, y + 4 * s, x + 30 * s, y + 40 * s, x + 54 * s, y + 40 * s, WHITE);
  cv.triangle(x + 32 * s, y + 26 * s, x + 18 * s, y + 54 * s, x + 46 * s, y + 54 * s, WHITE);
  cv.triangle(x + 32 * s, y + 26 * s, x + 46 * s, y + 54 * s, x + 54 * s, y + 40 * s, WHITE);
  // inner flame core in red, so it reads on any panel colour
  cv.triangle(x + 32 * s, y + 34 * s, x + 24 * s, y + 54 * s, x + 40 * s, y + 54 * s, RED);
}

function iconGlobe(cv: Canvas, cx: number, cy: number, r: number): void {
  // ocean
  cv.disc(cx, cy, r, BLUE);
  // land masses (stylised continents)
  cv.disc(cx - Math.floor(r * 0.42), cy - Math.floor(r * 0.25), Math.floor(r * 0.26), TEAL);
  cv.disc(cx + Math.floor(r * 0.35), cy + Math.floor(r * 0.18), Math.floor(r * 0.3), TEAL);
  cv.disc(cx + Math.floor(r * 0.15), cy - Math.floor(r * 0.45), Math.floor(r * 0.18), TEAL);
  cv.disc(cx - Math.floor(r * 0.1), cy + Math.floor(r * 0.5), Math.floor(r * 0.16), TEAL);
  // meridians + equator
  cv.circle(cx, cy, r, WHITE);
  cv.line(cx - r, cy, cx + r, cy, 2, WHITE);
  for (const rx of [Math.floor(r * 0.45), Math.floor(r * 0.8)]) {
    for (let deg = 0; deg < 360; deg += 4) {
      const rad = (deg * Math.PI) / 180;
      const px = cx + Math.floor(rx * Math.cos(rad));
      const py = cy + Math.floor(r * Math.sin(rad));
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r * r) cv.set(px, py, WHITE);
    }
  }
  // crack across the globe
  cv.line(cx - Math.floor(r * 0.8), cy - Math.floor(r * 0.7), cx - Math.floor(r * 0.2), cy - Math.floor(r * 0.1), 4, RED);
  cv.line(cx - Math.floor(r * 0.2), cy - Math.floor(r * 0.1), cx + Math.floor(r * 0.3), cy + Math.floor(r * 0.2), 4, RED);
  cv.line(cx + Math.floor(r * 0.3), cy + Math.floor(r * 0.2), cx + Math.floor(r * 0.75), cy + Math.floor(r * 0.8), 4, RED);
}

// ---------- story block ----------
// x, y: top-left of a 476x160 block. Icon panel 64x64 at left, kicker +
// headline to its right, body text full width below.
function story(
  cv: Canvas,
  x: number,
  y: number,
  panel: RGB,
  icon: (cv: Canvas, x: number, y: number, s: number) => void,
  kicker: string,
  headline: string,
  body: string,
): void {
  cv.rect(x, y, 64, 64, panel);
  icon(cv, x, y, 1);
  drawText(cv, kicker, x + 76, y + 4, 2, panel);
  const headLines = wrapText(headline, 476 - 76, 3);
  let hy = y + 24;
  for (const ln of headLines.slice(0, 2)) {
    drawText(cv, ln, x + 76, hy, 3, INK);
    hy += 22;
  }
  const bodyLines = wrapText(body, 476, 2);
  let by = y + 78;
  for (const ln of bodyLines.slice(0, 3)) {
    drawText(cv, ln, x, by, 2, INK);
    by += 16;
  }
  cv.hline(x, y + 148, 476, 2, GREY);
}

// ---------- page layout ----------
function drawPage(cv: Canvas): void {
  cv.frame(8, 8, 1008, 1008, 3, INK);
  cv.frame(16, 16, 992, 992, 1, GREY);

  // masthead
  cv.rect(24, 24, 976, 116, NAVY);
  drawTextCentered(cv, "THE WORLD IN ONE DAY", 512, 38, 6, WHITE);
  drawTextCentered(cv, "SUNDAY 22 NOVEMBER 2026", 512, 100, 3, GOLD);
  drawTextCentered(cv, "ONE DAY  •  ONE PAGE  •  THE WORLD'S NEWS", 512, 152, 2, INK);
  cv.hline(24, 146, 976, 2, INK);
  cv.hline(24, 172, 976, 2, INK);

  // ---- lead story: COP31 collapses ----
  drawText(cv, "CLIMATE  •  ANTALYA, TURKEY", 24, 188, 2, RED);
  drawText(cv, "COP31 COLLAPSES:", 24, 212, 4, INK);
  drawText(cv, "NO DEAL ON CLIMATE", 24, 244, 4, INK);
  const leadBody = wrapText(
    "UN climate talks in Antalya ended Sunday with no agreement, two days past deadline. The EU and others rejected a final draft that said nothing about fossil fuels.",
    600,
    2,
  );
  let ly = 286;
  for (const ln of leadBody) {
    drawText(cv, ln, 24, ly, 2, INK);
    ly += 17;
  }
  // lead art: cracked globe
  cv.rect(660, 184, 340, 216, NAVY2);
  iconGlobe(cv, 830, 278, 78);
  drawTextCentered(cv, "TALKS END IN ANTALYA", 830, 372, 2, WHITE);
  cv.hline(24, 420, 976, 3, INK);

  // ---- six stories, two columns x three rows ----
  const colX = [24, 524];
  const rowY = [436, 606, 776];
  story(
    cv, colX[0], rowY[0], BLUE, iconShip,
    "THE GULF  •  BAHRAIN",
    "IRAN STRIKES AT US BASES IN BAHRAIN",
    "Missiles and drones hit an industrial site; two people hurt. Gulf states condemn the attack.",
  );
  story(
    cv, colX[1], rowY[0], NAVY, iconStar,
    "MEXICO  •  SINALOA",
    "CARTEL BOSS 'EL CHAPO ISIDRO' SEIZED",
    "Special forces captured Fausto Isidro Meza Flores. Eleven killed in the raid, four of them soldiers.",
  );
  story(
    cv, colX[0], rowY[1], RED, iconBuilding,
    "UKRAINE  •  KRYVYI RIH",
    "MISSILE HITS ZELENSKYY'S HOME TOWN",
    "A boy of 7 and a woman of 20 killed, 60 hurt. A drone hit flats near Kyiv; 14 people missing.",
  );
  story(
    cv, colX[1], rowY[1], TEAL, iconChart,
    "MARKETS  •  NEW YORK",
    "STOCKS SLIDE INTO CORRECTION",
    "The S&P 500 fell 3.7% on Friday, the Nasdaq 5.3%, as the AI sell-off spread to Asia.",
  );
  story(
    cv, colX[0], rowY[2], NAVY2, iconGavel,
    "JUSTICE  •  THE HAGUE",
    "ROHINGYA WELCOME GENOCIDE VERDICT",
    "Refugees welcomed the World Court ruling that Myanmar committed genocide in 2017, a first against a state.",
  );
  story(
    cv, colX[1], rowY[2], GOLD, iconFlame,
    "INDONESIA  •  BANTEN",
    "FACTORY FIRE: 3 DEAD, 36 MISSING",
    "Fire swept a candy factory in Cikande. Rescuers searched the ruins through Sunday.",
  );

  // ---- ticker: also today ----
  cv.rect(24, 940, 976, 52, NAVY);
  drawText(cv, "ALSO TODAY:", 36, 950, 2, GOLD);
  drawText(cv, "BepiColombo reaches Mercury orbit after eight years", 196, 950, 2, WHITE);
  drawText(
    cv,
    "EU-Indonesia deal signed  •  Trump, Xi, Putin meet  •  Nigeria boat, 24 dead",
    36,
    972,
    2,
    WHITE,
  );
  drawTextCentered(
    cv,
    "Events first reported Sunday 22 November 2026  •  Sources: AP, Reuters, AFP, Al Jazeera",
    512,
    998,
    1,
    GREY,
  );
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const cv = new Canvas();
  drawPage(cv);
  const png = encodePng(cv.px, W, H);
  writeFileSync(join(outDir, "entry.png"), png);
}

main();
