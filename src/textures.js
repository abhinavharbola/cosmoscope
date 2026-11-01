import * as THREE from "three";
import { parseManifest, resolveFiles, surfaceKey, centerLonOffset, MASK_SLOTS } from "./texmanifest.js";

const channel = typeof window !== "undefined" && typeof MessageChannel !== "undefined" ? new MessageChannel() : null;

const tick = () =>
  channel
    ? new Promise((r) => {
        channel.port1.onmessage = () => r();
        channel.port2.postMessage(0);
      })
    : new Promise((r) => setTimeout(r, 0));

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

function pixelHash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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
    const y = (((v % 1) + 1) % 1) * size;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = (x0 + 1) % size;
    const y1 = (y0 + 1) % size;
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

function layers(rand, sizes) {
  return sizes.map((s) => valueNoise(rand, s));
}

function fbm(ns, u, v) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < ns.length; i++) {
    sum += ns[i](u, v) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function samplePalette(pal, t) {
  const x = clamp(t, 0, 0.9999) * (pal.length - 1);
  const i = Math.floor(x);
  return mix(pal[i], pal[i + 1], x - i);
}

function put(o, c) {
  o[0] = c[0];
  o[1] = c[1];
  o[2] = c[2];
}

async function paintMulti(w, h, n, shade) {
  const canvases = [];
  const ctxs = [];
  const imgs = [];
  for (let k = 0; k < n; k++) {
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    canvases.push(c);
    ctxs.push(ctx);
    imgs.push(ctx.createImageData(w, h));
  }
  const outs = Array.from({ length: n }, () => [0, 0, 0, 255]);
  let t = performance.now();
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < n; k++) outs[k][3] = 255;
      shade((x + 0.5) / w, v, x, y, outs);
      const i = (y * w + x) * 4;
      for (let k = 0; k < n; k++) {
        const d = imgs[k].data;
        const o = outs[k];
        d[i] = o[0];
        d[i + 1] = o[1];
        d[i + 2] = o[2];
        d[i + 3] = o[3];
      }
    }
    if (performance.now() - t > 24) {
      await tick();
      t = performance.now();
    }
  }
  for (let k = 0; k < n; k++) ctxs[k].putImageData(imgs[k], 0, 0);
  return canvases;
}

function toTexture(canvas, color = true) {
  const tex = new THREE.CanvasTexture(canvas);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function heightCanvas(src) {
  const w = src.width;
  const h = src.height;
  const img = src.getContext("2d").getImageData(0, 0, w, h);
  const out = makeCanvas(w, h);
  const octx = out.getContext("2d");
  const dst = octx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const l = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
    dst.data[i] = dst.data[i + 1] = dst.data[i + 2] = l;
    dst.data[i + 3] = 255;
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

function craters(canvas, rand, count, strength, maxR) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  for (let i = 0; i < count; i++) {
    const v = 0.06 + rand() * 0.88;
    const x = rand() * w;
    const y = v * h;
    const r = 2 + maxR * Math.pow(rand(), 5.5);
    const stretch = 1 / Math.max(0.3, Math.sin(Math.PI * v));
    const s = strength * (0.5 + rand() * 0.5);
    for (const dx of [-w, 0, w]) {
      ctx.save();
      ctx.translate(x + dx, y);
      ctx.scale(stretch, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(0,0,0,${0.22 * s})`);
      g.addColorStop(0.4, `rgba(0,0,0,${0.14 * s})`);
      g.addColorStop(0.7, `rgba(0,0,0,${0.05 * s})`);
      g.addColorStop(0.9, `rgba(0,0,0,${0.01 * s})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

async function earthMaps() {
  const SEA = 0.56;
  const rand = mulberry(hashSeed("Earth"));
  const land = layers(rand, [4, 8, 16, 32, 64, 128, 256]);
  const warpA = layers(rand, [3, 6, 12]);
  const warpB = layers(rand, [3, 6, 12]);
  const biome = layers(rand, [5, 10, 20, 40]);
  const city = layers(rand, [6, 12, 24, 48]);
  const cloud = layers(rand, [4, 8, 16, 32, 64, 128]);
  const cloudWarp = layers(rand, [3, 6, 12]);
  const jungle = [28, 92, 48];
  const temperate = [70, 112, 56];
  const dry = [182, 154, 98];
  const tundra = [142, 144, 122];
  const mountain = [114, 100, 88];
  const snow = [244, 246, 250];
  const shallow = [36, 118, 154];
  const deep = [6, 26, 66];
  const [col, rough, lights, clouds] = await paintMulti(1536, 768, 4, (u, v, x, y, outs) => {
    const lat = Math.abs(v - 0.5) * 2;
    const wu = (fbm(warpA, u, v) - 0.5) * 0.28;
    const wv = (fbm(warpB, u, v) - 0.5) * 0.14;
    const n = fbm(land, u + wu, v + wv);
    const isLand = n > SEA;
    const iceEdge = lat + (fbm(biome, u * 3, v * 3) - 0.5) * 0.07;
    const ice = smooth(0.85, 0.91, iceEdge);
    let c;
    let r;
    if (isLand) {
      const e = clamp((n - SEA) / 0.2);
      const m = fbm(biome, u, v);
      const wet = clamp(1 - Math.abs(lat - 0.08) * 6);
      const band = smooth(0.12, 0.22, lat) * (1 - smooth(0.34, 0.48, lat));
      c = mix(temperate, jungle, wet * 0.9);
      c = mix(c, dry, band * smooth(0.44, 0.6, m));
      c = mix(c, tundra, smooth(0.6, 0.78, lat));
      c = mix(c, mountain, smooth(0.3, 0.7, e) * 0.85);
      c = mix(c, snow, smooth(0.72, 0.95, e));
      r = 225;
    } else {
      const d = clamp((SEA - n) / 0.25);
      c = mix(shallow, deep, Math.pow(d, 0.55));
      r = 80;
    }
    c = mix(c, snow, ice);
    if (ice > 0.5) r = 190;
    put(outs[0], c);
    outs[1][0] = outs[1][1] = outs[1][2] = r;
    let L = 0;
    if (isLand && n > SEA + 0.015 && lat < 0.78) {
      const density = smooth(0.52, 0.68, fbm(city, u, v));
      if (pixelHash(x, y) > 0.8) L = density * (0.55 + 0.45 * pixelHash(x + 7, y + 3));
    }
    outs[2][0] = 255 * L;
    outs[2][1] = 190 * L;
    outs[2][2] = 110 * L;
    const band = 0.07 * Math.cos(lat * Math.PI * 4);
    const cv = fbm(cloud, u + (fbm(cloudWarp, u, v) - 0.5) * 0.3, v) + band;
    const a = smooth(0.54, 0.68, cv);
    outs[3][0] = outs[3][1] = outs[3][2] = 255;
    outs[3][3] = a * 235;
  });
  return { map: toTexture(col), rough: toTexture(rough, false), lights: toTexture(lights), clouds: toTexture(clouds) };
}

async function jupiterMap(body) {
  const rand = mulberry(hashSeed(body.id));
  const turb = layers(rand, [4, 8, 16, 32]);
  const fine = layers(rand, [16, 48, 96, 192]);
  const pal = body.palette.map(hexToRgb);
  const spot = [176, 74, 48];
  const [c] = await paintMulti(1536, 768, 1, (u, v, x, y, outs) => {
    const w = fbm(turb, u * 3, v * 0.6) - 0.5;
    const jet = Math.sin(v * Math.PI * 22) * 0.012;
    const phase = v * Math.PI * 13 + w * 2.4 + 1.1 * Math.sin(v * Math.PI * 5);
    const shear = fbm(fine, u * 2 + jet, v * 14) - 0.5;
    const t = clamp(0.5 + 0.5 * Math.sin(phase) + shear * 0.55);
    let col = samplePalette(pal, t);
    const du = (u - 0.35) / 0.045;
    const dv = (v - 0.63) / 0.026;
    const d = du * du + dv * dv;
    if (d < 1.9) {
      const k = d < 1 ? Math.pow(1 - d, 0.45) : 0;
      col = mix(col, spot, k * 0.85);
      if (d >= 1) col = mix(col, [236, 220, 200], (1.9 - d) / 0.9 * 0.25);
    }
    put(outs[0], col);
  });
  return { map: toTexture(c) };
}

async function saturnMap(body) {
  const rand = mulberry(hashSeed(body.id));
  const turb = layers(rand, [4, 8, 16]);
  const fine = layers(rand, [16, 48, 96]);
  const pal = body.palette.map(hexToRgb);
  const [c] = await paintMulti(1024, 512, 1, (u, v, x, y, outs) => {
    const w = fbm(turb, u * 3, v * 0.6) - 0.5;
    const phase = v * Math.PI * 9 + w * 1.2;
    const t = clamp(0.55 + 0.25 * Math.sin(phase) + (fbm(fine, u * 2, v * 12) - 0.5) * 0.3);
    let col = samplePalette(pal, t);
    const pole = smooth(0.82, 1, Math.abs(v - 0.5) * 2);
    col = mix(col, [150, 160, 170], pole * 0.35);
    put(outs[0], col);
  });
  return { map: toTexture(c) };
}

async function venusMap(body) {
  const rand = mulberry(hashSeed(body.id));
  const st = layers(rand, [3, 6, 12, 24]);
  const sw = layers(rand, [8, 24, 64]);
  const pal = body.palette.map(hexToRgb);
  const [c] = await paintMulti(1024, 512, 1, (u, v, x, y, outs) => {
    const lat = (v - 0.5) * 2;
    const flow = fbm(st, u * 2 + Math.abs(lat) * 0.35, v * 0.9);
    const t = fbm(sw, u + flow * 0.5 + Math.sin(lat * 3) * 0.04, v * 1.4);
    put(outs[0], samplePalette(pal, clamp(t * 1.5 - 0.15)));
  });
  return { map: toTexture(c) };
}

async function iceGiantMap(body) {
  const rand = mulberry(hashSeed(body.id));
  const st = layers(rand, [4, 8, 16]);
  const sw = layers(rand, [16, 48, 96]);
  const pal = body.palette.map(hexToRgb);
  const neptune = body.id === "Neptune";
  const [c] = await paintMulti(1024, 512, 1, (u, v, x, y, outs) => {
    const band = Math.sin(v * Math.PI * (neptune ? 9 : 6) + fbm(st, u * 2, v) * 1.6) * 0.5 + 0.5;
    let col = samplePalette(pal, band * 0.55 + fbm(sw, u * 2, v * 8) * 0.45);
    if (neptune) {
      const du = (u - 0.6) / 0.07;
      const dv = (v - 0.58) / 0.045;
      const d = du * du + dv * dv;
      if (d < 1) col = mix(col, [20, 32, 90], (1 - d) * 0.8);
      const streak = fbm(sw, u * 6, v * 3);
      if (streak > 0.64 && Math.abs(v - 0.5) < 0.3) col = mix(col, [190, 210, 255], (streak - 0.64) * 3);
    } else {
      col = mix(col, [190, 238, 240], smooth(0.7, 1, 1 - Math.abs(v - 0.5) * 2) * 0.12);
    }
    put(outs[0], col);
  });
  return { map: toTexture(c) };
}

async function marsMap(body) {
  const rand = mulberry(hashSeed(body.id));
  const ns = layers(rand, [4, 8, 16, 32, 64, 128]);
  const alb = layers(rand, [3, 6, 12]);
  const pal = body.palette.map(hexToRgb);
  const dark = [76, 44, 36];
  const [c] = await paintMulti(1536, 768, 1, (u, v, x, y, outs) => {
    const n = fbm(ns, u, v);
    let col = samplePalette(pal.slice(0, 3), clamp(n * 1.3 - 0.1));
    const a = fbm(alb, u, v);
    col = mix(col, dark, smooth(0.54, 0.64, a) * 0.75);
    const lat = (v - 0.5) * 2;
    const cap = Math.abs(lat) > 0.9 - (lat < 0 ? 0.04 : 0) + (n - 0.5) * 0.06;
    if (cap) col = mix(col, pal[3], 0.95);
    const vm = Math.abs(v - (0.54 + 0.008 * Math.sin(u * 70)));
    if (u > 0.17 && u < 0.33 && vm < 0.007) col = mix(col, [60, 30, 24], 0.8);
    put(outs[0], col);
  });
  craters(c, rand, 140, 0.7, 26);
  return { map: toTexture(c), bump: toTexture(heightCanvas(c), false) };
}

async function moonMap(body) {
  const rand = mulberry(hashSeed(body.id));
  const ns = layers(rand, [4, 8, 16, 32, 64, 128]);
  const mare = layers(rand, [3, 5, 9]);
  const [c] = await paintMulti(1536, 768, 1, (u, v, x, y, outs) => {
    const n = fbm(ns, u, v);
    const hl = 150 + (n - 0.5) * 120;
    let col = [hl, hl, hl - 3];
    const near = 1 - smooth(0.18, 0.46, Math.abs(u - 0.5));
    const m = smooth(0.5, 0.58, fbm(mare, u, v)) * near;
    col = mix(col, [74, 74, 80], m * 0.9);
    put(outs[0], col);
  });
  craters(c, rand, 900, 0.9, 36);
  return { map: toTexture(c), bump: toTexture(heightCanvas(c), false) };
}

async function mercuryMap(body) {
  const rand = mulberry(hashSeed(body.id));
  const ns = layers(rand, [4, 8, 16, 32, 64, 128]);
  const pal = body.palette.map(hexToRgb);
  const [c] = await paintMulti(1024, 512, 1, (u, v, x, y, outs) => {
    const n = fbm(ns, u, v);
    put(outs[0], samplePalette(pal, clamp(n * 1.2 - 0.05)));
  });
  craters(c, rand, 800, 0.9, 34);
  return { map: toTexture(c), bump: toTexture(heightCanvas(c), false) };
}

async function plutoMap(body) {
  const rand = mulberry(hashSeed(body.id));
  const ns = layers(rand, [4, 8, 16, 32, 64]);
  const pal = body.palette.map(hexToRgb);
  const cream = [238, 226, 208];
  const [c] = await paintMulti(1024, 512, 1, (u, v, x, y, outs) => {
    const n = fbm(ns, u, v);
    let col = samplePalette(pal.slice(0, 3), clamp(n * 1.3 - 0.1));
    if (u > 0.66 && u < 0.98 && Math.abs(v - 0.55) < 0.08) col = mix(col, [86, 48, 42], 0.65 * smooth(0.45, 0.6, n));
    const hx = (u - 0.42) / 0.075;
    const hy = (0.5 - v) / 0.14 + 0.2;
    const f = Math.pow(hx * hx + hy * hy - 1, 3) - hx * hx * hy * hy * hy;
    if (f < 0) col = mix(col, cream, 0.9 * smooth(0, -0.4, f));
    put(outs[0], col);
  });
  craters(c, rand, 60, 0.5, 24);
  return { map: toTexture(c), bump: toTexture(heightCanvas(c), false) };
}

export async function buildMaps(body) {
  switch (body.kind) {
    case "earth":
      return earthMaps();
    case "jupiter":
      return jupiterMap(body);
    case "saturn":
      return saturnMap(body);
    case "cloud":
      return venusMap(body);
    case "smooth":
      return iceGiantMap(body);
    case "mars":
      return marsMap(body);
    case "moon":
      return moonMap(body);
    case "pluto":
      return plutoMap(body);
    default:
      return mercuryMap(body);
  }
}

export async function sunMap() {
  const rand = mulberry(7);
  const ns = layers(rand, [12, 32, 96, 192, 384]);
  const spots = layers(rand, [10, 20]);
  const pal = ["#ff7a12", "#ffa328", "#ffc85a", "#fff0b0"].map(hexToRgb);
  const [c] = await paintMulti(1536, 768, 1, (u, v, x, y, outs) => {
    const n = fbm(ns, u, v);
    let col = samplePalette(pal, clamp(n * 1.5 - 0.15));
    const lat = Math.abs(v - 0.5);
    if (lat > 0.08 && lat < 0.24) {
      const s = smooth(0.66, 0.74, fbm(spots, u, v));
      col = mix(col, [70, 24, 6], s * 0.85);
    }
    put(outs[0], col);
  });
  return toTexture(c);
}

export function ringTexture(rings) {
  const w = 2048;
  const canvas = makeCanvas(w, 4);
  const ctx = canvas.getContext("2d");
  const rand = mulberry(99);
  const span = rings.outerKm - rings.innerKm;
  for (let x = 0; x < w; x++) {
    const t = x / w;
    const km = rings.innerKm + ((x + 0.5) / w) * span;
    const band = rings.bands.find((r) => km >= r.fromKm && km < r.toKm);
    const gap = rings.gaps.find((g) => km >= g.fromKm && km < g.toKm);
    let a = 0;
    let c = [214, 196, 160];
    if (band) {
      if (band.name === "C") {
        a = 0.18 + rand() * 0.06;
        c = [150, 140, 125];
      } else if (band.name === "B") {
        a = 0.82 + 0.12 * Math.sin(t * 380) + rand() * 0.05;
        c = [236, 222, 190];
      } else if (band.name === "Cassini") {
        a = 0.05;
      } else {
        a = 0.6 + 0.1 * Math.sin(t * 700) + rand() * 0.05;
      }
    }
    if (gap) a = 0.02;
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${clamp(a)})`;
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
  g.addColorStop(0, "rgba(255,236,190,1)");
  g.addColorStop(0.18, "rgba(255,196,100,0.5)");
  g.addColorStop(0.45, "rgba(255,140,50,0.1)");
  g.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function loadManifest() {
  try {
    const res = await fetch("textures/manifest.json", { cache: "no-cache" });
    if (res.ok) return parseManifest(await res.json());
  } catch {
    return parseManifest(null);
  }
  return parseManifest(null);
}

export function disposeMaps(maps) {
  for (const tex of Object.values(maps)) if (tex && tex.dispose) tex.dispose();
}

export async function loadSurface(entry, wanted) {
  const picks = resolveFiles(entry, wanted);
  if (!picks.map) return null;
  const loader = new THREE.TextureLoader();
  const offset = centerLonOffset(entry.centerLon);
  const maps = {};
  await Promise.all(
    Object.entries(picks).map(async ([slot, pick]) => {
      try {
        const tex = await loader.loadAsync(`textures/${pick.file}`);
        tex.colorSpace = MASK_SLOTS.includes(slot) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        if (offset !== 0) {
          tex.wrapS = THREE.RepeatWrapping;
          tex.offset.x = offset;
        }
        maps[slot] = tex;
      } catch {
        return;
      }
    })
  );
  if (!maps.map) {
    disposeMaps(maps);
    return null;
  }
  return { maps, tier: picks.map.tier, key: surfaceKey(entry, wanted) };
}
