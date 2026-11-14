import { bezier } from './ease.js';

const { gsap } = window;

const DURATION = 1.3;
const TILE_ORDER = [20, 19, 2, 12, 8, 18, 3, 9, 14, 13, 5, 16, 10, 1, 6, 11, 4, 17, 15, 7];
const PSD_WIDTH = 1600;

const easeIn = bezier(0.8, 0, 0.1, 1);
const easeZoom = bezier(0.72, 0, 0.11, 1);
const iLerp = (a, b, v) => Math.min(Math.max((v - a) / (b - a), 0), 1);
const lerp = (a, b, t) => a * (1 - t) + b * t;

export function shouldPreload() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1' || window.location.pathname.startsWith('/home')) {
    return false;
  }
  return !document.documentElement.classList.contains('is-preloaded');
}

export async function loadBytes(srcs, onProgress) {
  const loaded = srcs.map(() => 0);
  const total = srcs.map(() => 0);
  const known = srcs.map(() => false);
  const finished = srcs.map(() => false);
  let shown = 0;
  const report = () => {
    if (!known.every(Boolean)) return;
    const sizes = total.filter((t) => t > 0);
    const guess = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 1;
    let sum = 0;
    let got = 0;
    total.forEach((t, i) => {
      const size = t > 0 ? t : guess;
      sum += size;
      got += t > 0 ? Math.min(loaded[i], t) : finished[i] ? size : 0;
    });
    shown = Math.max(shown, sum > 0 ? got / sum : 0);
    onProgress(shown);
  };
  const results = await Promise.all(
    srcs.map(async (src, i) => {
      try {
        const response = await fetch(src);
        const length = Number(response.headers.get('content-length')) || 0;
        total[i] = length;
        known[i] = true;
        report();
        if (!response.body || !length) {
          const blob = await response.blob();
          finished[i] = true;
          report();
          return URL.createObjectURL(blob);
        }
        const reader = response.body.getReader();
        const chunks = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded[i] += value.length;
          report();
        }
        finished[i] = true;
        const type = response.headers.get('content-type') || '';
        return URL.createObjectURL(new Blob(chunks, { type }));
      } catch {
        known[i] = finished[i] = true;
        report();
        return src;
      }
    }),
  );
  onProgress(1);
  return results;
}

const VERTEX = `
attribute vec2 position;
uniform vec4 uRect; 
uniform vec2 uRes;
varying vec2 vUv;

void main() {
    vUv = vec2(position.x, 1.0 - position.y);
    vec2 px = uRect.xy + position * uRect.zw;
    gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uCover;
uniform float uScale;
uniform vec3 uOverlayColor;
uniform float uOverlayOpacity;
varying vec2 vUv;

void main() {
    vec2 uv = (vUv - 0.5) / (uCover * uScale) + 0.5;
    vec3 color = texture2D(uTexture, uv).rgb;
    gl_FragColor = vec4(mix(color, uOverlayColor, uOverlayOpacity), 1.0);
}`;

function program(gl, vs, fs) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const { name } = gl.getActiveUniform(p, i);
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u, position: gl.getAttribLocation(p, 'position') };
}

export class Preloader {
  constructor({ root, renderer, media, overlay }) {
    this.root = root;
    this.no = root.querySelector('[data-load-no]');
    this.bg = root.querySelector('[data-load-bg]');
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.media = media;
    this.overlay = overlay;
    this.active = false;
    this.progress = 0;
    this.shown = -1;

    this.cells = [];
    for (let t = 0; t < 25; t++) this.cells.push({ t, work: 0 });
    this.tiles = [];

    this.prog = program(this.gl, VERTEX, FRAGMENT);
    this.quad = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quad);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), this.gl.STATIC_DRAW);

    if (this.no) gsap.set(this.no, { y: 0, yPercent: 0 });
  }

  setProgress(p) {
    const value = Math.max(Math.round(p * 100), this.shown);
    if (value === this.shown) return;
    this.shown = value;
    if (this.no) this.no.textContent = `${value}%`;
  }

  layout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    let s = (30 * W) / PSD_WIDTH;
    const r = (W - 4 * s) / 4;
    const a = (r * H) / W;
    const h = a + s;
    const l = r + s;
    const o = 0.5 * h;
    const n = H + 0.5 * (5 * a + 4 * s - H);
    const p = 12 * a;
    const d = W + 2;
    const c = H + 2;
    s = (s * d) / r;
    const g = c + s;
    const u = d + s;
    this.full = { w: d, h: c };
    this.cells.forEach((cell) => {
      const { t } = cell;
      const m = t === 12;
      let v = Math.floor(t / 5);
      const f = v % 2 === 1;
      v -= 2;
      const R = Math.abs(v);
      const x = t % 5;
      const w = x - 2;
      cell.y = f ? -(n - o + (4 - x) * p + R * a + 20) : n + x * p + R * a + 20;
      const cellX = 0.5 * (W - r) + v * l;
      cell.lerp = { x: 0.5 * (W - d) + v * u, y: 0.5 * (H - c) + w * g - (f ? 0.5 * g : 0) };
      cell.from = {
        x: cellX - cell.lerp.x,
        y: 0.5 * (H - a) + w * h - (f ? o : 0) - cell.lerp.y,
        w: r - d,
        h: a - c,
        scale: m ? 0.5 : 0,
      };
    });
  }

  assign() {
    this.pool = [...this.media, ...this.tiles];
    const n = this.media.length;
    const works = { 12: 0, 1: 1, 15: 2, 23: 3, 22: 4 };
    const free = this.cells.filter((cell) => !(cell.t in works));
    this.cells.forEach((cell) => {
      if (cell.t in works) cell.work = works[cell.t];
    });
    free.forEach((cell, i) => {
      cell.work = n + TILE_ORDER[i] - 1;
    });
  }

  play(onDone) {
    this.assign();
    this.layout();
    this.active = true;
    this.progress = 0;
    if (this.no) gsap.to(this.no, { autoAlpha: 0, duration: 1, ease: 'power2' });
    if (this.bg) gsap.set(this.bg, { opacity: 0 });
    if (this.root) this.root.style.pointerEvents = 'none';
    gsap.to(this, {
      progress: 1,
      duration: DURATION,
      ease: 'none',
      onComplete: () => {
        this.active = false;
        onDone();
      },
    });
  }

  render() {
    if (!this.active) return;
    const gl = this.gl;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const t = this.progress;
    const e = easeIn(iLerp(0, 0.65, t));
    const i = easeZoom(iLerp(0.4, 1, t));

    gl.useProgram(this.prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.prog.position);
    gl.vertexAttribPointer(this.prog.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(this.prog.u.uRes, W, H);
    gl.uniform1i(this.prog.u.uTexture, 0);
    gl.uniform3fv(this.prog.u.uOverlayColor, this.overlay.color);
    gl.activeTexture(gl.TEXTURE0);

    this.cells.forEach((cell) => {
      const x = cell.lerp.x + lerp(cell.from.x, 0, i);
      const y = cell.lerp.y + lerp(cell.from.y, 0, i) + lerp(cell.y, 0, e);
      const w = this.full.w + lerp(cell.from.w, 0, i);
      const h = this.full.h + lerp(cell.from.h, 0, i);
      if (x > W || x + w < 0 || y > H || y + h < 0 || w <= 0 || h <= 0) return;
      const scale = 1 + lerp(cell.from.scale, 0, i);
      const m = this.pool[cell.work];
      const centre = cell.t === 12;
      let cx = m.width / m.height / (w / h);
      let cy = 1;
      if (cx < 1) {
        cy = 1 / cx;
        cx = 1;
      }
      const zoom = centre ? lerp(1, m.zoom, i) : 1;
      gl.bindTexture(gl.TEXTURE_2D, (m.uploaded && m.texture) || this.renderer.blank);
      gl.uniform4f(this.prog.u.uRect, x, y, w, h);
      gl.uniform2f(this.prog.u.uCover, cx, cy);
      gl.uniform1f(this.prog.u.uScale, scale * zoom);
      gl.uniform1f(this.prog.u.uOverlayOpacity, centre ? lerp(0, this.overlay.opacity, i) : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
  }
}

export function maskUI(elements) {
  return elements.map((el) => {
    const inner = document.createElement('span');
    inner.className = 'ui-in';
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);
    el.classList.add('ui-mask');
    gsap.set(inner, { yPercent: 110 });
    return inner;
  });
}

export function revealUI(inners, delay, onDone) {
  const n = inners.length;
  const total = 1.5 / (1 - (n - 1) * 0.05);
  gsap.to(inners, {
    yPercent: 0,
    duration: 1.5,
    ease: 'expo.out',
    delay,
    stagger: total * 0.05,
    onComplete: () => {
      inners.forEach((inner) => {
        if (gsap.getProperty(inner, 'yPercent') === 0) inner.parentElement.classList.remove('ui-mask');
      });
      if (onDone) onDone();
    },
  });
}
