import * as THREE from "three";

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function valueNoise(rand, size) {
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return (u, v) => {
    const x = (((u % 1) + 1) % 1) * size;
    const y = Math.min(Math.max(v, 0), 0.9999) * (size - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = (x0 + 1) % size;
    const y1 = Math.min(y0 + 1, size - 1);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * size + x0];
    const b = grid[y0 * size + x1];
    const c = grid[y1 * size + x0];
    const d = grid[y1 * size + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbm(noises, u, v) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < noises.length; i++) {
    sum += noises[i](u, v) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function samplePalette(pal, t) {
  const x = Math.min(Math.max(t, 0), 0.9999) * (pal.length - 1);
  const i = Math.floor(x);
  return mix(pal[i], pal[i + 1], x - i);
}

export function proceduralTexture(body) {
  const w = 1024;
  const h = 512;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const rand = mulberry(hashSeed(body.id));
  const noises = [valueNoise(rand, 8), valueNoise(rand, 16), valueNoise(rand, 32), valueNoise(rand, 64), valueNoise(rand, 128)];
  const stretched = [valueNoise(rand, 6), valueNoise(rand, 24), valueNoise(rand, 96)];
  const pal = body.palette.map(hexToRgb);

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const lat = Math.abs(v - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let col;
      if (body.kind === "earth") {
        const n = fbm(noises, u, v);
        const land = n > 0.52;
        if (land) {
          const e = (n - 0.52) / 0.48;
          col = mix(pal[1], pal[3], Math.min(1, e * 1.6));
        } else {
          col = mix([10, 30, 70], pal[0], Math.min(1, (n / 0.52) * 1.2));
        }
        const ice = Math.max(0, (lat - 0.82) * 5.5);
        if (ice > 0) col = mix(col, pal[2], Math.min(1, ice));
        const cloud = fbm(noises, u + 0.37, v + 0.11);
        if (cloud > 0.58) col = mix(col, [250, 250, 252], Math.min(0.75, (cloud - 0.58) * 4));
      } else if (body.kind === "bands") {
        const warp = fbm(stretched, u * 1.5, v * 0.35) - 0.5;
        const band = Math.sin((v + warp * 0.08) * Math.PI * 18) * 0.5 + 0.5;
        const fine = fbm(noises, u * 3, v * 6);
        col = samplePalette(pal, band * 0.7 + fine * 0.5);
      } else if (body.kind === "cloud") {
        const n = fbm(stretched, u * 2, v * 0.8);
        const swirl = fbm(noises, u + n * 0.4, v);
        col = samplePalette(pal, swirl);
      } else if (body.kind === "smooth") {
        const band = Math.sin(v * Math.PI * 7 + fbm(stretched, u, v) * 2) * 0.5 + 0.5;
        col = samplePalette(pal, band * 0.6 + fbm(noises, u, v) * 0.4);
      } else {
        const n = fbm(noises, u, v);
        const crater = fbm([noises[4], noises[3]], u * 2, v * 2);
        col = samplePalette(pal, n * 0.8 + crater * 0.3);
        const pole = Math.max(0, (lat - 0.9) * 10);
        if (body.id === "Mars" && pole > 0) col = mix(col, pal[3], Math.min(1, pole));
      }
      const i = (y * w + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function sunTexture() {
  const w = 1024;
  const h = 512;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const rand = mulberry(7);
  const noises = [valueNoise(rand, 12), valueNoise(rand, 32), valueNoise(rand, 96), valueNoise(rand, 192)];
  const pal = ["#ff8a1f", "#ffb43c", "#ffd27a", "#fff0b8"].map(hexToRgb);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(noises, x / w, y / (h - 1));
      const col = samplePalette(pal, n * 1.4 - 0.1);
      const i = (y * w + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function ringTexture() {
  const w = 1024;
  const canvas = makeCanvas(w, 4);
  const ctx = canvas.getContext("2d");
  const rand = mulberry(99);
  for (let x = 0; x < w; x++) {
    const t = x / w;
    let a = 0;
    if (t > 0.05 && t < 0.28) a = 0.25 + rand() * 0.1;
    else if (t >= 0.28 && t < 0.62) a = 0.75 + rand() * 0.2;
    else if (t >= 0.62 && t < 0.66) a = 0.05;
    else if (t >= 0.66 && t < 0.95) a = 0.55 + rand() * 0.2;
    const shade = 180 + Math.floor(rand() * 50);
    ctx.fillStyle = `rgba(${shade},${shade - 12},${shade - 40},${a})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function glowTexture() {
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,230,170,1)");
  g.addColorStop(0.2, "rgba(255,190,90,0.55)");
  g.addColorStop(0.5, "rgba(255,140,40,0.12)");
  g.addColorStop(1, "rgba(255,120,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
