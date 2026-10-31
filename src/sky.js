import * as THREE from "three";
import { galacticBasis } from "./frame.js";

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

function noiseGrid(rand, size) {
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rand();
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
    const a = g[y0 * size + x0];
    const b = g[y0 * size + x1];
    const c = g[y1 * size + x0];
    const d = g[y1 * size + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export function milkyWayTexture() {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const rand = mulberry(2026);
  const ns = [noiseGrid(rand, 6), noiseGrid(rand, 14), noiseGrid(rand, 32), noiseGrid(rand, 80)];
  const dust = [noiseGrid(rand, 8), noiseGrid(rand, 20), noiseGrid(rand, 50)];
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const b = (0.5 - v) * Math.PI;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const l = (u - 0.5) * Math.PI * 2;
      const core = Math.exp(-Math.pow(l / 1.1, 2));
      const width = 0.16 + 0.2 * core;
      const band = Math.exp(-Math.pow(b / width, 2));
      let n = 0;
      let amp = 0.5;
      let norm = 0;
      for (let i = 0; i < ns.length; i++) {
        n += ns[i](u, v) * amp;
        norm += amp;
        amp *= 0.55;
      }
      n /= norm;
      let dn = 0;
      amp = 0.5;
      norm = 0;
      for (let i = 0; i < dust.length; i++) {
        dn += dust[i](u * 1.5, v) * amp;
        norm += amp;
        amp *= 0.55;
      }
      dn /= norm;
      const lane = Math.exp(-Math.pow((b - 0.02) / 0.05, 2)) * Math.max(0, dn - 0.46) * 3.2;
      let I = band * (0.35 + 0.9 * n) * (0.55 + 0.9 * core);
      I *= Math.max(0, 1 - lane);
      I += Math.exp(-Math.pow(b / 0.7, 2)) * 0.015;
      const warm = Math.min(1, core * 1.2);
      const r = (0.62 + 0.38 * warm) * I;
      const g = (0.66 + 0.2 * warm) * I;
      const bl = (0.85 - 0.3 * warm) * I;
      const i4 = (y * w + x) * 4;
      img.data[i4] = Math.min(255, r * 255 * 0.55);
      img.data[i4 + 1] = Math.min(255, g * 255 * 0.55);
      img.data[i4 + 2] = Math.min(255, bl * 255 * 0.55);
      img.data[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const STAR_COLORS = [
  [0.62, 0.72, 1.0],
  [0.8, 0.86, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.95, 0.8],
  [1.0, 0.82, 0.6],
  [1.0, 0.66, 0.48],
];

function starLayer(rand, count, size, galactic, brightness) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let b;
    if (rand() < galactic) {
      b = (rand() + rand() + rand() - 1.5) * 0.55;
    } else {
      b = Math.asin(rand() * 2 - 1);
    }
    const l = rand() * Math.PI * 2;
    const cb = Math.cos(b);
    pos[i * 3] = 3000 * cb * Math.cos(l);
    pos[i * 3 + 1] = 3000 * Math.sin(b);
    pos[i * 3 + 2] = 3000 * cb * Math.sin(l);
    const k = Math.min(STAR_COLORS.length - 1, Math.floor(Math.pow(rand(), 0.7) * STAR_COLORS.length));
    const c = STAR_COLORS[k];
    const f = brightness * (0.55 + 0.45 * rand());
    col[i * 3] = c[0] * f;
    col[i * 3 + 1] = c[1] * f;
    col[i * 3 + 2] = c[2] * f;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(
    g,
    new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true })
  );
  p.frustumCulled = false;
  return p;
}

export function createSky() {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const g = galacticBasis();
  tilt.setRotationFromMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3(...g.x), new THREE.Vector3(...g.y), new THREE.Vector3(...g.z))
  );
  root.add(tilt);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3500, 64, 32),
    new THREE.MeshBasicMaterial({ map: milkyWayTexture(), side: THREE.BackSide, depthWrite: false, fog: false })
  );
  dome.renderOrder = -20;
  dome.frustumCulled = false;
  tilt.add(dome);

  const rand = mulberry(77);
  const faint = starLayer(rand, 7000, 1.0, 0.65, 0.55);
  const mid = starLayer(rand, 1400, 1.6, 0.5, 0.8);
  const bright = starLayer(rand, 180, 2.6, 0.25, 1.0);
  [faint, mid, bright].forEach((s) => {
    s.renderOrder = -10;
    tilt.add(s);
  });

  return {
    object: root,
    follow(position) {
      root.position.copy(position);
    },
  };
}
