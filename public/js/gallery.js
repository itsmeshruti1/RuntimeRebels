import { bezier } from './ease.js';
import { createProgram } from './gl.js';
import { meta } from './data.js';
import { isMobile } from './mobile.js';

const { gsap } = window;

export const EASE_ZOOM = bezier(0.87, 0, 0.13, 1);
export const EASE_SPHERE = bezier(1, 0, 1, 1);
export const EASE_HIDE = bezier(0.15, 0, 0.65, 0);
export const EASE_SHOW = bezier(0.16, 1, 0.3, 1);
export const SPHERE = { gallery: -250, slider: 400 };
export const bell = (t) => {
  const i = Math.abs(t - 0.5) / 0.5;
  return i > 1 ? 0 : 1 - i * i * (3 - 2 * i);
};
export function factor() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const wh = w / h;
  if (wh > 1) {
    if (w >= 1200) return 16 / 9 < wh ? h / 810 : w / 1440;
    return 1125 / 675 < wh ? h / 675 : w / 1125;
  }
  if (w >= 700) return 750 / 1073 < wh ? h / 1073 : w / 750;
  return 375 / 629 < wh ? h / 629 : w / 375;
}

const CARD = { w: 348, h: 226, gap: 12 };
const PAGE = [11 / 255, 11 / 255, 11 / 255];
const GREEN = [206 / 255, 228 / 255, 159 / 255];
export const DIVIDER = {
  top: 42,
  bottom: 55,
  color: PAGE.map((a, i) => a * 0.9 + Math.abs(a - GREEN[i]) * 0.1),
  draw: 1.4,
};
const LABEL_GAP = 12;

const TOUCH = {
  world: 2 * Math.tan((25 * Math.PI) / 180) * 8,
  side: 96,
  height: 4,
  gap: 0.1,
  drag: 0.012 * 0.4,
  swipe: 30,
  tap: 5,
  snap: { duration: 0.35, ease: 'power2.out' },
};

const CARD_VERTEX = `
attribute vec2 position;
attribute vec2 uv;

uniform mat4 uProjection;
uniform float uCameraZ;
uniform vec4 uRect; 
uniform vec2 uSphere; 
uniform float uCurve; 
uniform float uCurveFlat; 

varying vec2 vUv;
varying vec2 vFlat;

float j(float t) {
    float p = 2. * t * t;
    return t < .5 ? p : -p + (4. * t) - 1.;
}

void main() {
    vec3 pos = vec3(position, 0.0);

    vUv = uv;
    vFlat = position * uRect.zw + uRect.xy;
    if (uSphere.x > 0.) pos.z += j(1. - min(length(vFlat), uSphere.x) / uSphere.x) * uSphere.y;
    vec3 world = vec3(pos.xy * uRect.zw + uRect.xy, pos.z);
    world.z += j(abs((abs(world.x) - uCurveFlat) / uCurveFlat)) * uCurve;
    gl_Position = uProjection * vec4(world.xy, world.z - uCameraZ, 1.0);
}`;

const CARD_FRAGMENT = `
precision highp float;

uniform sampler2D uTexture;
uniform vec4 uRect;
uniform vec2 uAspect;
uniform float uZoom;
uniform vec3 uOverlayColor;
uniform float uOverlayOpacity;

uniform vec2 uMouse;
uniform vec2 uGlPerPx;
uniform float uTime;
uniform float uArea;
uniform float uAreaMax;

varying vec2 vUv;
varying vec2 vFlat;

float z(in vec2 q) { return fract(sin(dot(q.xy, vec2(12.9898, 78.233))) * 43758.5453123); }

float y(vec2 q) {
    vec2 i = floor(q);
    vec2 f = fract(q);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(z(i + vec2(0.0, 0.0)), z(i + vec2(1.0, 0.0)), u.x), mix(z(i + vec2(0.0, 1.0)), z(i + vec2(1.0, 1.0)), u.x), u.y);
}

float x(in vec2 q) {
    float v = 0.0;
    float a = 0.5;
    vec2 k = vec2(100.0);
    mat2 r = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
    for (int i = 0; i < 5; ++i) {
        v += a * y(q);
        q = r * q * 2.0 + k;
        a *= 0.5;
    }
    return v;
}

vec2 getFitUv(vec2 uv, vec2 containerSize, vec2 textureSize, float zoom)
{
    float containerAspect = containerSize.x / containerSize.y;
    float textureAspect = textureSize.x / textureSize.y;

    float wider = step(containerAspect, textureAspect);
    vec2 coverScale = mix(
        vec2(1.0, textureAspect / containerAspect),
        vec2(containerAspect / textureAspect, 1.0),
        wider
    );

    return (uv - 0.5) * coverScale / zoom + 0.5;
}

void main()
{
    vec2 t = getFitUv(vUv, uRect.zw, uAspect, uZoom);
    vec3 color = texture2D(uTexture, t).rgb;

    vec2 v = vFlat * uGlPerPx - uMouse;
    float e = sqrt((v.x * v.x) + (v.y * v.y));
    float f = uAreaMax * uArea;
    if (e < f) {
        vec2 w = vec2(t) * 20.0;
        float n = x(w + vec2(x(w + 1.0 * vec2(x(w)) + vec2(1.7, 9.2) + 0.15 * uTime / 1.8))) * (4.0 * e / f);
        vec4 i = texture2D(uTexture, t + y(t * 20.0 - uTime / 5.0) / 70.0);
        color = mix(i.rgb + 0.09, color, step(0.5, (n * n * n + .6 * n * n + .5 * n)));
    }

    gl_FragColor = vec4(mix(color, uOverlayColor, uOverlayOpacity), 1.0);
}`;

function planeGeometry(segments) {
  const vertices = [];
  const indices = [];
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const v = j / segments;
      vertices.push(u - 0.5, v - 0.5, u, v);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i;
      indices.push(a, a + 1, a + row, a + row, a + 1, a + row + 1);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

const lerp = (a, b, t) => (1 - t) * a + t * b;

const UNITS_PER_CARD = 10;
const IS_FIREFOX = /firefox/i.test(navigator.userAgent);

export class Gallery {
  constructor({ renderer, media, slides, params, zoomParams, hoverParams, overlay, labelsRoot }) {
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.media = media;
    this.slides = slides;
    this.count = slides.length;
    this.params = params;
    this.zoomParams = zoomParams;
    this.hoverParams = hoverParams;
    this.overlay = overlay;

    this.currentX = 0;
    this.lastX = 0;
    this.offX = 0;
    this.onX = 0;
    this.isDragging = false;
    this.latency = 0;
    this.enabled = false;
    this.wheelTimer = null;
    this.snapTarget = null;

    this.zoom = { value: 0, center: 0, t: 0, sphere: 0, sphereEase: 0 };
    this.opening = null;
    this.divider = { p: 1 };
    this.visible = false;

    this.mouse = null;
    this.areas = new Map();

    this.touch = null;

    this.initGL();
    this.buildLabels(labelsRoot);
    this.layout();
    this.bindEvents();
  }

  initGL() {
    const gl = this.gl;
    this.card = createProgram(gl, CARD_VERTEX, CARD_FRAGMENT);
    this.card.position = gl.getAttribLocation(this.card.program, 'position');
    this.card.uv = gl.getAttribLocation(this.card.program, 'uv');

    const geometry = planeGeometry(this.params.segments);
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    this.indexCount = geometry.indices.length;

    gl.useProgram(this.card.program);
    gl.uniform1i(this.card.uniforms.uTexture, 0);
    gl.uniform3fv(this.card.uniforms.uOverlayColor, this.overlay.color);
  }

  buildLabels(root) {
    this.hovered = -1;
    this.labels = this.slides.map((slide) => {
      const el = document.createElement('div');
      el.className = 'blend h3 gallery-label';
      const parts = [slide.title.join(' '), isMobile() ? slide.category : meta(slide)].map((text) => {
        const mask = document.createElement('span');
        mask.className = 'line';
        const inner = document.createElement('span');
        inner.className = 'line-inner';
        inner.textContent = text;
        mask.appendChild(inner);
        el.appendChild(mask);
        return inner;
      });
      gsap.set(parts, { yPercent: 100 });
      root.appendChild(el);
      return { el, parts, wrap: 0, shown: false };
    });
  }

  showLabel(index, wrap) {
    const label = this.labels[index];
    label.wrap = wrap;
    label.shown = true;
    gsap.to(label.parts, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: 1 / 15, overwrite: true });
  }

  hideLabel(index) {
    const label = this.labels[index];
    label.shown = false;
    gsap.to(label.parts, { yPercent: 100, duration: 1, ease: 'power4.out', stagger: 1 / 15, overwrite: true });
  }

  setHovered(index, wrap) {
    this.hoveredWrap = wrap;
    if (index === this.hovered) return;
    if (this.hovered >= 0) this.hideLabel(this.hovered);
    this.hovered = index;
    if (index >= 0) this.showLabel(index, wrap);
  }

  layout() {
    const oldSlot = this.slot;
    if (isMobile()) {
      const u = window.innerHeight / TOUCH.world;
      this.unit = u;
      this.px = window.innerWidth / 375;
      this.cardW = window.innerWidth - TOUCH.side;
      this.cardH = TOUCH.height * u;
      this.slot = this.cardW + TOUCH.gap * u;
    } else {
      const px = Math.min(Math.max(window.innerWidth, 1440), 2560) / 1440;
      this.unit = 0;
      this.px = px;
      this.cardW = CARD.w * px;
      this.cardH = CARD.h * px;
      this.slot = (CARD.w + CARD.gap) * px;
    }
    this.total = this.slot * this.count;
    if (oldSlot) {
      const k = this.slot / oldSlot;
      this.currentX *= k;
      this.lastX *= k;
      this.offX *= k;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fov = 2 * Math.atan(h / 2 / this.params.cameraZ);
    this.projection = perspective(fov, w / h, 10, 1000);
  }

  bindEvents() {
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: true });
    window.addEventListener('mousedown', (e) => e.button === 0 && !this.unit && this.onDown(e.clientX, e.target));
    window.addEventListener('mousemove', (e) => !this.unit && this.onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => !this.unit && this.onUp());
    window.addEventListener(
      'touchstart',
      (e) => (this.unit ? this.onTouchStart(e.touches[0], e.target) : this.onDown(e.touches[0].clientX, e.target)),
      { passive: true },
    );
    window.addEventListener('touchmove', (e) => (this.unit ? this.onTouchMove(e.touches[0]) : this.onMove(e.touches[0].clientX, null)), {
      passive: true,
    });
    window.addEventListener('touchend', (e) => (this.unit ? this.onTouchEnd(e.changedTouches[0]) : this.onUp()));
    this.pointer = null;
  }

  onTouchStart(p, target) {
    if (!this.enabled || (target && target.closest && target.closest('[data-ui]'))) return;
    if (this.snapTween) this.snapTween.kill();
    this.snapTarget = null;
    this.touch = { x: p.clientX, y: p.clientY, index: Math.round(this.currentX / this.slot), from: this.currentX };
  }

  onTouchMove(p) {
    const t = this.touch;
    if (!t || !this.enabled) return;
    this.currentX = t.from + (p.clientX - t.x) * TOUCH.drag * this.unit;
  }

  onTouchEnd(p) {
    const t = this.touch;
    if (!t) return;
    this.touch = null;
    if (!this.enabled) return;
    const dx = p.clientX - t.x;
    if (Math.abs(dx) <= TOUCH.tap && this.onOpen) {
      const hit = this.cardAt(t.x, t.y);
      if (hit && this.onOpen(hit.i + hit.wrap * this.count)) return;
    }
    let index = t.index;
    if (dx > TOUCH.swipe) index += 1;
    else if (dx < -TOUCH.swipe) index -= 1;
    this.snapTween = gsap.to(this, { currentX: index * this.slot, ...TOUCH.snap, overwrite: true });
  }

  cardAt(px, py) {
    const x = px - window.innerWidth / 2;
    const y = py - window.innerHeight / 2;
    if (Math.abs(y) > this.cardH / 2) return null;
    for (let i = 0; i < this.count; i++) {
      for (const wrap of this.wraps(i)) {
        if (Math.abs(x - this.cardX(i, wrap)) <= this.cardW / 2) return { i, wrap };
      }
    }
    return null;
  }

  onWheel(e) {
    if (!this.enabled) return;
    const x = e.wheelDeltaX || -e.deltaX;
    const y = e.wheelDeltaY || -e.deltaY;
    let d = Math.abs(x) >= Math.abs(y) ? x : y;
    if (IS_FIREFOX && e.deltaMode === 1) d *= 60;
    d *= this.params.wheelScale;
    this.snapTarget = null;
    this.currentX += ((this.params.wheel * d) / UNITS_PER_CARD) * this.slot;
    this.offX = this.currentX;
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => this.onWheelEnd(), this.params.wheelEnd * 1000);
  }

  onWheelEnd() {
    this.startSnap();
  }

  startSnap() {
    this.snapTarget = -Math.round(-this.currentX / this.slot) * this.slot;
  }

  onDown(x, target) {
    if (!this.enabled || (target && target.closest && target.closest('[data-ui]'))) return;
    this.snapTarget = null;
    this.isDragging = true;
    this.onX = x;
    this.offX = this.currentX;
  }

  onMove(x, y) {
    if (y !== null) this.pointer = { x, y };
    if (!this.isDragging) return;
    this.currentX = this.offX + ((x - this.onX) * this.params.drag * this.slot) / UNITS_PER_CARD;
  }

  onUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    const moved = this.currentX !== this.offX;
    this.offX = this.currentX;
    if (!moved && this.hovered >= 0 && this.onOpen && this.onOpen(this.hovered + this.hoveredWrap * this.count)) return;
    this.startSnap();
  }

  get position() {
    return -this.lastX / this.slot;
  }

  cardRect(index) {
    const x = index * this.slot + this.lastX;
    return {
      x: window.innerWidth / 2 + x - this.cardW / 2,
      y: (window.innerHeight - this.cardH) / 2,
      w: this.cardW,
      h: this.cardH,
    };
  }

  setPosition(index) {
    clearTimeout(this.wheelTimer);
    if (this.snapTween) this.snapTween.kill();
    this.touch = null;
    this.prevX = undefined;
    this.snapTarget = null;
    this.isDragging = false;
    this.currentX = this.lastX = this.offX = -index * this.slot;
    this.latency = 0;
  }

  cardX(i, wrap) {
    return i * this.slot + this.lastX + wrap * this.total;
  }

  wraps(i) {
    const reach = window.innerWidth / 2 + this.cardW / 2;
    const base = Math.round(-(i * this.slot + this.lastX) / this.total);
    return [base - 1, base, base + 1].filter((w) => Math.abs(this.cardX(i, w)) < reach);
  }

  visibleMedia() {
    if (!this.visible) return [];
    return this.media.filter((m, i) => this.wraps(i).length > 0 || this.zoom.value < 1);
  }

  runZoom(to, onComplete) {
    const z = this.zoomParams;
    const from = this.zoom.value;
    const camera = window.innerHeight / 2 / Math.tan((22.5 * Math.PI) / 180);
    const end = (to === 1 ? SPHERE.gallery : SPHERE.slider) * factor() * (this.params.cameraZ / camera);
    const start = this.zoom.sphere;
    this.zoom.sphereEase = 0;
    gsap.fromTo(
      this.zoom,
      { t: 0 },
      {
        t: 1,
        duration: z.duration,
        ease: 'none',
        overwrite: true,
        onUpdate: () => {
          const t = this.zoom.t;
          this.zoom.value = from + (to - from) * EASE_ZOOM(t);
          const s = EASE_SPHERE(bell(t));
          if (Math.abs(s - this.zoom.sphereEase) < 0.5 || t === 0) {
            this.zoom.sphereEase = s;
            this.zoom.sphere = (t < 0.5 ? start : 0) + (end - (t < 0.5 ? start : 0)) * s;
          }
        },
        onComplete,
      },
    );
  }

  zoomOut(index, onComplete) {
    this.setPosition(index);
    this.zoom.center = index;
    this.visible = true;
    this.runZoom(1, onComplete);
  }

  showAt(index) {
    this.setPosition(index);
    Object.assign(this.zoom, { value: 1, center: index, t: 1, sphere: 0, sphereEase: 0 });
    this.visible = true;
  }

  resetZoom() {
    gsap.killTweensOf(this.zoom);
    Object.assign(this.zoom, { value: 0, t: 0, sphere: 0, sphereEase: 0 });
    this.visible = false;
  }

  zoomIn(onComplete, index = Math.round(this.position)) {
    this.enabled = false;
    this.isDragging = false;
    clearTimeout(this.wheelTimer);
    if (this.snapTween) this.snapTween.kill();
    this.touch = null;
    this.prevX = undefined;
    this.snapTarget = null;
    this.currentX = this.offX = -index * this.slot;
    this.zoom.center = index;
    this.hideLabels();
    this.runZoom(0, () => {
      this.visible = false;
      onComplete();
    });
    return index;
  }

  hideLabels() {
    const index = this.hovered;
    this.hovered = -1;
    if (index < 0) return;
    const label = this.labels[index];
    label.shown = false;
    gsap.to(label.parts, {
      yPercent: -110,
      duration: 0.7,
      ease: EASE_HIDE,
      overwrite: true,
      onComplete: () => gsap.set(label.parts, { yPercent: 100 }),
    });
  }

  update(dt) {
    if (!this.visible) return;
    const frames = dt / (1000 / 60);
    const damp = (a, b, t) => a + (b - a) * (1 - Math.pow(1 - t, frames));
    if (this.snapTarget !== null) {
      this.currentX = damp(this.currentX, this.snapTarget, this.params.snap);
      if (Math.abs(this.snapTarget - this.currentX) < 0.01) {
        this.currentX = this.offX = this.snapTarget;
        this.snapTarget = null;
      }
      this.offX = this.currentX;
    }
    let lag;
    if (this.unit) {
      const step = this.prevX === undefined || frames <= 0 ? 0 : (this.currentX - this.prevX) / frames;
      this.prevX = this.lastX = this.currentX;
      lag = (step * (1 - this.params.ease)) / this.params.ease;
    } else {
      this.lastX = damp(this.lastX, this.currentX, this.params.ease);
      if (Math.abs(this.currentX - this.lastX) < 0.01) this.lastX = this.currentX;
      lag = this.currentX - this.lastX;
    }
    const units = (lag / this.slot) * UNITS_PER_CARD;
    this.latency = damp(this.latency, Math.min(Math.abs(this.params.latency * units), this.params.latencyMax), this.params.latencyEase);

    if (this.unit) this.updateCentre();
    else this.updateHover();
    this.updateLabels();
    this.updateAreas(frames);
  }

  updateCentre() {
    if (!this.enabled || this.zoom.value < 1) {
      if (this.hovered >= 0 && !this.enabled) this.setHovered(-1);
      return;
    }
    if (this.touch || (this.snapTween && this.snapTween.isActive())) return;
    const centre = Math.round(this.position);
    const i = ((centre % this.count) + this.count) % this.count;
    this.setHovered(i, Math.round((centre - i) / this.count));
  }

  updateAreas(frames) {
    const damp = (a, b, t) => a + (b - a) * (1 - Math.pow(1 - t, frames));
    const p = this.pointer;
    if (p) {
      if (!this.mouse) this.mouse = { x: p.x, y: p.y };
      this.mouse.x = damp(this.mouse.x, p.x, this.hoverParams.mouse);
      this.mouse.y = damp(this.mouse.y, p.y, this.hoverParams.mouse);
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cards = this.cards();
    cards.forEach(({ key }) => !this.areas.has(key) && this.areas.set(key, { targ: 0, curr: 0, currR: 0 }));
    this.areas.forEach((area, key) => {
      const card = cards.find((c) => c.key === key);
      let inside = false;
      if (card && p && this.enabled) {
        const [cx, cy, cw, ch] = card.rect;
        const left = w / 2 + cx - cw / 2;
        const top = h / 2 - cy - ch / 2;
        inside = p.x >= left && p.x <= left + cw && p.y >= top && p.y <= top + ch;
      }
      area.targ = inside ? 1 : 0;
      area.curr = damp(area.curr, area.targ, this.hoverParams.area);
      area.currR = Math.round(area.curr * 100) / 100;
      if (!card && area.currR === 0) this.areas.delete(key);
    });
  }

  updateHover() {
    if (!this.enabled || !this.pointer || this.zoom.value < 1) {
      if (this.hovered >= 0 && !this.enabled) this.setHovered(-1);
      return;
    }
    const hit = this.cardAt(this.pointer.x, this.pointer.y);
    this.setHovered(hit ? hit.i : -1, hit ? hit.wrap : 0);
  }

  updateLabels() {
    const below = window.innerHeight / 2 + this.cardH / 2;
    this.labels.forEach((label, i) => {
      if (!label.shown && gsap.getProperty(label.parts[label.parts.length - 1], 'yPercent') >= 100) return;
      const top = below + (this.unit ? TOUCH.gap * this.unit : LABEL_GAP * this.px);
      const left = window.innerWidth / 2 + this.cardX(i, label.wrap) - this.cardW / 2;
      label.el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      label.el.style.width = `${this.cardW}px`;
    });
  }

  zoomRect(i, wrap) {
    const e = this.zoom.value;
    const k = i + wrap * this.count - this.zoom.center;
    let x = this.cardX(i, wrap);
    if (k === 0) {
      return [x * e, 0, lerp(window.innerWidth, this.cardW, e), lerp(window.innerHeight, this.cardH, e)];
    }
    x += Math.sign(k) * (2 * Math.abs(k) + 1) * this.slot * (1 - e);
    return [x, 0, this.cardW, this.cardH];
  }

  cards() {
    const e = this.zoom.value;
    const list = [];
    const centre = ((this.zoom.center % this.count) + this.count) % this.count;
    for (let i = 0; i < this.count; i++) {
      const wraps = e < 1 ? [Math.round((this.zoom.center - i) / this.count)] : this.wraps(i);
      wraps.forEach((wrap) => {
        const key = i + wrap * this.count;
        const rect = e < 1 ? this.zoomRect(i, wrap) : [this.cardX(i, wrap), 0, this.cardW, this.cardH];
        if (this.opening && e >= 1) {
          const k = key - this.opening.index;
          if (k === 0) return;
          const end = Math.sign(k) * (3 * Math.abs(k) + 1) * this.slot;
          rect[0] = lerp(rect[0], end, this.opening.spread);
        }
        list.push({ i, key, rect, centre: e < 1 && i === centre });
      });
    }
    return list.sort((a, b) => a.centre - b.centre);
  }

  revealDivider() {
    gsap.fromTo(this.divider, { p: 0 }, { p: 1, duration: DIVIDER.draw, ease: EASE_SHOW, overwrite: true });
  }

  dividerBox() {
    const c = window.innerHeight / 2;
    const top = DIVIDER.top * this.px;
    const bottom = window.innerHeight - DIVIDER.bottom * this.px;
    const p = this.divider.p;
    return { x: Math.round(window.innerWidth / 2 - 0.5), top: c - (c - top) * p, bottom: c + (bottom - c) * p };
  }

  drawDivider() {
    if (this.opening && !this.opening.reveal) return;
    const gl = this.gl;
    const k = gl.canvas.width / window.innerWidth;
    const { top, bottom } = this.dividerBox();
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.round((window.innerWidth / 2 - 0.5) * k), Math.round((window.innerHeight - bottom) * k), Math.max(1, Math.round(k)), Math.round((bottom - top) * k));
    gl.clearColor(...DIVIDER.color, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.clearColor(...PAGE, 1);
    gl.disable(gl.SCISSOR_TEST);
  }

  render(now) {
    if (!this.visible) return;
    this.drawDivider();
    const gl = this.gl;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const e = this.zoom.value;

    const u = this.card.uniforms;
    gl.useProgram(this.card.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.enableVertexAttribArray(this.card.position);
    gl.vertexAttribPointer(this.card.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.card.uv);
    gl.vertexAttribPointer(this.card.uv, 2, gl.FLOAT, false, 16, 8);
    gl.uniformMatrix4fv(u.uProjection, false, this.projection);
    gl.uniform1f(u.uCameraZ, this.params.cameraZ);
    const camera = h / 2 / Math.tan((22.5 * Math.PI) / 180);
    gl.uniform1f(u.uCurve, this.params.curve * (h / 1080) * this.latency * (this.params.cameraZ / camera) * e);
    gl.uniform1f(u.uCurveFlat, this.params.curveFlat * w);
    gl.activeTexture(gl.TEXTURE0);

    const hp = this.hoverParams;
    const mouse = this.mouse || { x: -1e4, y: -1e4 };
    gl.uniform2f(u.uGlPerPx, hp.winGl / w, hp.winGl / h);
    gl.uniform2f(u.uMouse, (mouse.x - w / 2) * (hp.winGl / w), (h / 2 - mouse.y) * (hp.winGl / h));
    gl.uniform1f(u.uTime, now / 300);
    gl.uniform1f(u.uAreaMax, hp.dmax);

    this.cards().forEach(({ i, key, rect, centre }) => {
      const m = this.media[i];
      gl.bindTexture(gl.TEXTURE_2D, (m.uploaded && m.texture) || this.renderer.blank);
      gl.uniform4f(u.uRect, rect[0], rect[1], rect[2], rect[3]);
      gl.uniform2f(u.uSphere, Math.abs(this.zoom.sphere) > 0.01 ? rect[2] : 0, this.zoom.sphere);
      gl.uniform2f(u.uAspect, m.width, m.height);
      gl.uniform1f(u.uZoom, centre ? lerp(m.zoom, 1, e) : 1);
      gl.uniform1f(u.uOverlayOpacity, centre ? lerp(this.overlay.opacity, 0, e) : 0);
      const area = this.areas.get(key);
      gl.uniform1f(u.uArea, area ? area.currR : 0);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    });
  }
}
