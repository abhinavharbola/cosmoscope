function parseColor(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) throw new Error(`Unsupported color ${c}`);
  const p = m[1].split(",").map((s) => parseFloat(s));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

function gradientAt(g, t) {
  const s = g.stops;
  if (t <= s[0].o) return s[0].c;
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i].o) {
      const a = s[i - 1];
      const b = s[i];
      const k = (t - a.o) / (b.o - a.o || 1);
      return [0, 1, 2, 3].map((j) => a.c[j] + (b.c[j] - a.c[j]) * k);
    }
  }
  return s[s.length - 1].c;
}

function blend(data, i, c) {
  const sa = c[3];
  if (sa <= 0) return;
  const da = data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  for (let k = 0; k < 3; k++) data[i + k] = (c[k] * sa + data[i + k] * da * (1 - sa)) / oa;
  data[i + 3] = oa * 255;
}

class Context2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.stack = [];
    this.t = { tx: 0, ty: 0, sx: 1 };
    this.fillStyle = "rgba(0,0,0,1)";
    this.path = null;
  }

  createImageData(w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  getImageData(x, y, w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(this.canvas.data) };
  }

  putImageData(img) {
    this.canvas.data.set(img.data);
  }

  save() {
    this.stack.push({ ...this.t });
  }

  restore() {
    this.t = this.stack.pop();
  }

  translate(x, y) {
    this.t.tx += x * this.t.sx;
    this.t.ty += y;
  }

  scale(a) {
    this.t.sx *= a;
  }

  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    return {
      cx: x1,
      cy: y1,
      r: r1,
      stops: [],
      addColorStop(o, c) {
        this.stops.push({ o, c: parseColor(c) });
      },
    };
  }

  beginPath() {
    this.path = null;
  }

  arc(x, y, r) {
    this.path = { x, y, r };
  }

  colorAt(lx, ly) {
    const f = this.fillStyle;
    if (typeof f === "string") return parseColor(f);
    return gradientAt(f, Math.hypot(lx - f.cx, ly - f.cy) / f.r);
  }

  fill() {
    const { x, y, r } = this.path;
    const t = this.t;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = t.tx + x * t.sx;
    const cy = t.ty + y;
    const x0 = Math.max(0, Math.floor(cx - r * t.sx));
    const x1 = Math.min(w - 1, Math.ceil(cx + r * t.sx));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    const data = this.canvas.data;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const lx = (px + 0.5 - t.tx) / t.sx;
        const ly = py + 0.5 - t.ty;
        if (Math.hypot(lx - x, ly - y) > r) continue;
        blend(data, (py * w + px) * 4, this.colorAt(lx, ly));
      }
    }
  }

  fillRect(x, y, rw, rh) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const data = this.canvas.data;
    for (let py = Math.max(0, y); py < Math.min(h, y + rh); py++) {
      for (let px = Math.max(0, x); px < Math.min(w, x + rw); px++) {
        blend(data, (py * w + px) * 4, this.colorAt(px + 0.5, py + 0.5));
      }
    }
  }
}

class StubCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.data = null;
    this.ctx = null;
  }

  getContext() {
    if (!this.ctx) {
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      this.ctx = new Context2D(this);
    }
    return this.ctx;
  }
}

export function installCanvas() {
  globalThis.document = { createElement: () => new StubCanvas() };
}
