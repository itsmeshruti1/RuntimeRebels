import * as THREE from 'three';
import { bell, DIVIDER, EASE_HIDE, EASE_SHOW, EASE_SPHERE, EASE_ZOOM, factor } from './gallery.js';
import { applyY3D, createYMaterial, YModel } from './y3d.js';

export const RINGS = {
  fov: 55,
  rings: 7,
  perRing: 10,
  ringGap: 1.35,
  radius: 2.35,
  radiusJitter: 0,
  angleJitter: 0,
  cardWidth: 1.25,
  cardAspect: 360 / 224,
  curve: 0.06,
  segments: 15,
  drift: 0.00045,
  driftSpeed: 0.0016,
  minDrift: 0.0008,
  camera: { w0: 375, r0: 6.8, w1: 1440, r1: 4.1 },
  lookDown: 0.25,
  pullBack: 5,
  mouse: { x: 0.2, y: 0.1, damp: 0.08, shift: 1.25, turn: 0.45 },
  logo: { y: -0.2, height: 2.2032 * 0.45, centre: 0.058, turn: 1.6 },
};

export const MORPH = {
  long: 2.4,
  othersDelay: 0.8,
  othersIn: 1.4,
  othersOut: 0.7,
  logoFrom: -Math.PI,
  logoTo: Math.PI / 2,
};

const MOTION = {
  wheel: 0.556,
  step: 0.011,
  follow: 0.075,
  speed: 0.18,
  bend: 0.00675,
  spin: 0.00016875,
  live: 3,
  liveKeep: 1,
  liveMix: 0.08,
  frame: 0.5,
  touch: 3,
  unit: 2.15 / 21,
  fade: 0.6,
  fadeFrom: -10,
  fadeTo: 0,
  lift: 1.4,
  liftEase: 0.12,
  zoom: 0.05,
};

const PAGE = [11 / 255, 11 / 255, 11 / 255];
const TAU = Math.PI * 2;

const damp = (a, b, t, dt) => a + (b - a) * (1 - Math.exp(-t * 0.05 * dt));
const be = (a, b, t, n) => a + (b - a) * -Math.expm1(Math.log(1 - t) * n);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

function random(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return (a = 0, b = 1) => {
    s = (s * 48271) % 2147483647;
    return a + (b - a) * ((s - 1) / 2147483646);
  };
}

const VERTEX =  `
uniform float uBend;
uniform float uMorph;
uniform vec4 uRect;
uniform vec2 uScreen;
uniform float uDepth;
uniform vec3 uSphere;
varying vec2 vUv;
varying float vDepth;

float j(float t) {
  float p = 2. * t * t;
  return t < .5 ? p : -p + (4. * t) - 1.;
}

void main() {
  vUv = uv;
  vec3 pos = position;
  pos.x += sin(uv.y * 3.14159) * uBend;
  vec3 world = (modelMatrix * vec4(pos, 1.)).xyz;
  vec3 back = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  if (uMorph < 1.) {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec2 px = vec2(uRect.x + (1. - uv.x) * uRect.z, uRect.y + (1. - uv.y) * uRect.w);
    vec2 ndc = vec2(px.x / uScreen.x * 2. - 1., 1. - px.y / uScreen.y * 2.);
    vec3 flatPos = cameraPosition - back * uDepth
      + right * (ndc.x * uDepth / projectionMatrix[0][0])
      + up * (ndc.y * uDepth / projectionMatrix[1][1]);
    world = mix(flatPos, world, uMorph);
  }
  if (uSphere.x > 0.) {
    vec4 view = viewMatrix * vec4(world, 1.);
    vec4 clip = projectionMatrix * view;
    vec2 s = clip.xy / clip.w * uScreen * .5;
    world += back * j(1. - min(length(s), uSphere.x) / uSphere.x) * uSphere.y * -view.z / uSphere.z;
  }
  vec4 view = viewMatrix * vec4(world, 1.);
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}`;

const FRAGMENT =  `
uniform sampler2D uMap;
uniform sampler2D uLive;
uniform float uMix;
uniform float uAlpha;
uniform float uMorph;
uniform vec2 uFit; 
uniform vec2 uCover; 
uniform vec3 uOverlayColor;
uniform float uOverlay; 
uniform vec3 uFade; 
uniform float uHover; 
uniform sampler2D uNext;
uniform vec2 uNextCover;
uniform float uWipe;
uniform float uWipeZoom;
varying vec2 vUv;
varying float vDepth;

void main() {
  vec2 q = vec2(1. - vUv.x, vUv.y);
  vec2 base = .5 + (q - .5) * (1. - uHover);
  vec2 uv = mix((base - .5) * uFit + .5, (base - .5) * uCover + .5, uMorph);
  vec3 color = mix(texture2D(uMap, uv).rgb, texture2D(uLive, uv).rgb, uMix);
  if (uWipe > 0.) {
    vec2 n = mix((base - .5) * uFit + .5, (base - .5) * uNextCover + .5, uMorph);
    n = .5 + (n - .5) * (.8 + .2 * uWipeZoom);
    float x = 1. - q.x;
    float f = smoothstep(0., 1. - q.y, (-x + 1. + x * uWipe) * uWipe);
    color = mix(color, texture2D(uNext, n).rgb, f);
  }
  color = mix(color, uOverlayColor, uOverlay * (1. - uMorph));
  float fade = mix(1., uFade.x, smoothstep(uFade.y, uFade.z, vDepth));
  gl_FragColor = vec4(color, uAlpha * mix(1., fade, uMorph)); 
}`;

function arc(w, sag) {
  const s = w * 0.5;
  const o = new THREE.Vector2(-s, 0);
  const a = new THREE.Vector2(0, sag);
  const l = new THREE.Vector2(s, 0);
  const c = new THREE.Vector2().subVectors(o, a);
  const u = new THREE.Vector2().subVectors(a, l);
  const hh = new THREE.Vector2().subVectors(o, l);
  const d = (c.length() * u.length() * hh.length()) / (2 * Math.abs(c.cross(hh)));
  const f = new THREE.Vector2(0, sag - d);
  const g = (new THREE.Vector2().subVectors(o, f).angle() - Math.PI * 0.5) * 2;
  return (b, out) => out.copy(l).rotateAround(f, g * b);
}

function curvedPlane(w, h, sag) {
  const geo = new THREE.PlaneGeometry(w, h, RINGS.segments, RINGS.segments);
  const point = arc(w, sag);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  const t = new THREE.Vector2();
  for (let m = 0; m < uv.count; m++) {
    const v = pos.getY(m);
    point(1 - uv.getX(m), t);
    pos.setXYZ(m, t.x, v, -t.y);
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

function blankTexture() {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

let logo = null;

export function buildLogo() {
  if (!logo) {
    logo = new YModel(createYMaterial());
    logo.update();
  }
  return logo;
}

export class Orbit {
  constructor({ canvas, media, pictures = [], overlay, dividerBox }) {
    this.canvas = canvas;
    this.media = media;
    this.pictures = pictures;
    this.overlay = overlay;
    this.dividerBox = dividerBox;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    renderer.setClearColor(0, 0);
    renderer.autoClear = false;
    this.scene = new THREE.Scene();

    this.camBase = new THREE.Object3D();
    this.cam = new THREE.PerspectiveCamera(RINGS.fov, 1, 0.1, 100);
    this.camBase.add(this.cam);
    this.scene.add(this.camBase);
    this.mx = 0;
    this.my = 0;
    this.pointer = null;

    this.spin = new THREE.Group();
    this.shift = new THREE.Group();
    this.spin.add(this.shift);
    this.scene.add(this.spin);

    this.blank = blankTexture();
    this.textures = media.map((m) => this.textureFor(m));
    this.pictureTextures = pictures.map(() => ({ still: this.blank, live: null }));
    this.loadPictures();
    this.bend = { value: 0 };
    this.screen = { value: new THREE.Vector2(1, 1) };
    this.overlayColor = { value: new THREE.Vector3(...overlay.color) };
    this.depthFade = { value: new THREE.Vector3(1, 0, 1) };
    this.buildCards();

    this.yModel = buildLogo();
    this.yMaterial = this.yModel.material;
    const box = new THREE.Box3().setFromObject(this.yModel.object);
    this.yHeight = box.max.y - box.min.y;
    this.logo = new THREE.Group();
    this.turn = new THREE.Group();
    this.turn.add(this.yModel.object);
    this.logo.add(this.turn);
    this.scene.add(this.logo);

    this.k = 0;
    this.O = 0;
    this.P = 0;
    this.M = 0;
    this.j = 0;
    this.T = 0;
    this.busy = false;
    this.lastY = 0;
    this.pull = 0;

    this.active = false;
    this.enabled = false;
    this.canHover = false;
    this.ready = false;
    this.fade = 1;
    this.yAlpha = 1;
    this.morph = null;
    this.opened = null;
    this.hovered = null;
    this.onHover = null;
    this.live = new Set();

    this.raycaster = new THREE.Raycaster();
    this.bindEvents();
    this.resize();
  }

  textureFor(m) {
    const t = { still: this.blank, live: null };
    const set = () => {
      if (m.isVideo) {
        if (m.still) {
          t.still = new THREE.CanvasTexture(m.still);
        }
        t.live = new THREE.VideoTexture(m.el);
      } else {
        t.still = new THREE.Texture(m.el);
        t.still.needsUpdate = true;
      }
      [t.still, t.live].forEach((x) => {
        if (!x || x === this.blank) return;
        x.colorSpace = THREE.NoColorSpace;
        x.minFilter = x === t.live ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
      });
      const slide = this.media.indexOf(m);
      if (this.cards) this.cards.filter((c) => c.slide === slide).forEach((c) => this.applyTexture(c));
    };
    m.ready.then(set);
    return t;
  }

  loadPictures() {
    const queue = [];
    let pumping = false;
    const pump = () => {
      const job = queue.shift();
      if (job) {
        const t = new THREE.Texture(job.img);
        t.colorSpace = THREE.NoColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.needsUpdate = true;
        this.renderer.initTexture(t);
        this.pictureTextures[job.k].still = t;
        if (this.cards) this.cards.filter((c) => c.picture === job.k).forEach((c) => this.applyTexture(c));
      }
      if (queue.length) requestAnimationFrame(pump);
      else pumping = false;
    };
    this.pictures.forEach((p, k) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = p.src;
      img
        .decode()
        .then(() => {
          queue.push({ k, img });
          if (!pumping) {
            pumping = true;
            requestAnimationFrame(pump);
          }
        })
        .catch(() => {});
    });
  }

  applyTexture(card) {
    const t = card.picture !== null ? this.pictureTextures[card.picture] : this.textures[card.slide];
    card.uniforms.uMap.value = t.still;
    card.uniforms.uLive.value = t.live || this.blank;
  }

  buildCards() {
    this.rings = [];
    this.cards = [];
    const rings = Math.round(RINGS.rings);
    const count = this.media.length;
    const perRing = Math.max(count * 2, Math.round(RINGS.perRing));

    for (let r = 0; r < rings; r++) {
      const ring = { y: (r - Math.floor(rings / 2)) * RINGS.ringGap, speed: (r % 2 === 0 ? 1 : -1) * 0.35, cards: [] };
      ring.y0 = ring.y;
      const middle = r === Math.floor(rings / 2);
      if (middle) this.middle = ring;
      this.rings.push(ring);

      for (let i = 0; i < perRing; i++) {
        // Endless loop of the same 5 projects across all rings
        const slide = i % count;
        const picture = null;
        const m = this.media[slide];
        const w = RINGS.cardWidth;
        const h = w / RINGS.cardAspect;
        const ta = m.width / m.height;
        const cover = ta >= RINGS.cardAspect ? [RINGS.cardAspect / ta, 1] : [1, ta / RINGS.cardAspect];
        const radius = RINGS.radius;

        const uniforms = {
          uMap: { value: this.blank },
          uLive: { value: this.blank },
          uMix: { value: 0 },
          uAlpha: { value: 0 },
          uBend: this.bend,
          uMorph: { value: 1 },
          uRect: { value: new THREE.Vector4() },
          uScreen: this.screen,
          uDepth: { value: 1 },
          uSphere: { value: new THREE.Vector3() },
          uFit: { value: new THREE.Vector2(1, 1) },
          uCover: { value: new THREE.Vector2(...cover) },
          uOverlayColor: this.overlayColor,
          uOverlay: { value: 0 },
          uFade: this.depthFade,
          uHover: { value: 0 },
          uNext: { value: this.blank },
          uNextCover: { value: new THREE.Vector2(1, 1) },
          uWipe: { value: 0 },
          uWipeZoom: { value: 0 },
        };
        const material = new THREE.ShaderMaterial({
          uniforms,
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          transparent: true,
          side: THREE.DoubleSide,
        });
        const sag = radius * RINGS.curve;
        const mesh = new THREE.Mesh(curvedPlane(w, h, sag), material);
        mesh.frustumCulled = false;

        const rowOffset = (r % 2 === 0 ? 0 : Math.PI / perRing);
        const angle = (i * TAU) / perRing + rowOffset;
        const card = {
          slide,
          picture,
          ring,
          mesh,
          uniforms,
          radius,
          jitter: 0,
          angle,
          index: i,
          dy: -w / 2,
          alpha: 0,
          mix: 0,
          mixTo: 0,
          lift: 0,
          flat: null,
          h,
          arc: arc(w, sag),
        };
        mesh.userData.card = card;
        this.applyTexture(card);
        this.shift.add(mesh);
        ring.cards.push(card);
        this.cards.push(card);
      }
    }
    this.meshes = this.cards.map((c) => c.mesh);
  }

  bindEvents() {
    let isDown = false;
    let startX = 0, startY = 0;
    let lastX = 0, lastY = 0;

    window.addEventListener('mousemove', (e) => {
      this.pointer = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 };
    });

    window.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      isDown = true;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.enabled || !isDown) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.spin.rotation.y += dx * 0.0035;
      this.T += dy * -0.7;
    });

    const endDrag = () => {
      isDown = false;
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 30;
        this.T += MOTION.wheel * dy;
        if (Math.abs(e.deltaX) > 0.5) {
          this.spin.rotation.y -= e.deltaX * 0.002;
        }
      },
      { passive: true },
    );
    let touchY = null;
    let touchX = null;
    window.addEventListener('touchstart', (e) => {
      touchY = e.touches[0].clientY;
      touchX = e.touches[0].clientX;
    }, { passive: true });
    window.addEventListener(
      'touchmove',
      (e) => {
        const y = e.touches[0].clientY;
        const x = e.touches[0].clientX;
        if (this.enabled && touchY !== null) {
          this.T += MOTION.wheel * -(y - touchY) * MOTION.touch;
        }
        if (this.enabled && touchX !== null) {
          this.spin.rotation.y += (x - touchX) * 0.004;
        }
        touchY = y;
        touchX = x;
      },
      { passive: true },
    );
  }

  async prepare() {
    await Promise.race([Promise.all(this.media.map((m) => m.ready)), new Promise((resolve) => setTimeout(resolve, 1500))]);
    const r = this.renderer;
    new Set(this.cards.flatMap((c) => [c.uniforms.uMap.value, c.uniforms.uLive.value])).forEach((t) => r.initTexture(t));
    r.compile(this.scene, this.cam);
    r.render(this.scene, this.cam);
    r.clear();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.screen.value.set(w, h);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  resetScroll() {
    this.k = this.O = this.P = this.M = this.j = this.T = 0;
    this.lastY = this.pull = 0;
    this.shift.position.y = 0;
    this.spin.rotation.y = 0;
    this.lastSpin = 0;
    this.turn.rotation.y = 0;
    this.rings.forEach((ring) => (ring.y = ring.y0));
  }

  morphIn({ sources, centre, duration, sphere, divider, onComplete }) {
    const { gsap } = window;
    this.killTweens();
    this.active = true;
    this.enabled = false;
    this.canHover = false;
    this.ready = false;
    this.fade = 1;
    this.yAlpha = 1;
    this.resetScroll();
    const count = this.middle.cards.length;
    this.middle.cards.forEach((c, idx) => (c.angle = (-(idx - centre) * TAU) / count));
    this.updateCamera(0);
    this.place(0);
    const moving = new Set();
    sources.forEach((src) => {
      const card = this.middle.cards.find((c) => c.slide === src.slide && !moving.has(c));
      if (!card) return;
      moving.add(card);
      card.flat = src;
    });
    this.cards.forEach((c) => {
      if (moving.has(c)) {
        c.alpha = 1;
        c.mix = c.mixTo = c.picture === null && this.media[c.slide].isVideo ? 1 : 0;
      } else {
        c.alpha = 0;
        c.mix = c.mixTo = 0;
        c.flat = null;
        gsap.to(c, { alpha: 1, duration: MORPH.othersIn, ease: EASE_SHOW, delay: MORPH.othersDelay });
      }
    });
    gsap.fromTo(this.logo.rotation, { y: MORPH.logoFrom }, { y: MORPH.logoTo, duration, ease: EASE_ZOOM });
    this.morph = { p: 0, out: false, sphere, divider };
    gsap.to(this.morph, {
      p: 1,
      duration,
      ease: 'none',
      onComplete: () => {
        this.cards.forEach((c) => (c.flat = null));
        this.morph = null;
        this.enabled = true;
        this.canHover = true;
        this.ready = true;
        if (onComplete) onComplete();
      },
    });
  }

  nearestCard() {
    this.scene.updateMatrixWorld();
    const camPos = this.cam.getWorldPosition(new THREE.Vector3());
    const v = new THREE.Vector3();
    let best = null;
    let bestD = Infinity;
    this.cards.forEach((c) => {
      if (!c.mesh.visible || c.alpha < 0.5) return;
      v.setFromMatrixPosition(c.mesh.matrixWorld);
      const d = v.distanceTo(camPos);
      v.project(this.cam);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    });
    return best || this.middle.cards[0];
  }

  morphOut({ targets, centre, duration, wipe, sphere, divider, onComplete }) {
    const { gsap } = window;
    this.killTweens();
    this.enabled = false;
    this.canHover = false;
    this.ready = false;
    this.setHovered(null);
    const moving = new Set();
    targets.forEach((t, i) => {
      let card = i === 0 ? centre : null;
      if (!card) {
        const tx = t.rect.x + t.rect.w / 2;
        const ty = t.rect.y + t.rect.h / 2;
        let bestD = Infinity;
        this.cards.forEach((c) => {
          if (c.slide !== t.slide || c.picture !== null || moving.has(c) || !c.mesh.visible) return;
          const r = this.cardRect(c);
          const d = Math.hypot(r.x + r.w / 2 - tx, r.y + r.h / 2 - ty);
          if (d < bestD) {
            bestD = d;
            card = c;
          }
        });
      }
      if (!card) return;
      moving.add(card);
      card.flat = t;
    });
    this.cards.forEach((c) => {
      if (moving.has(c)) {
        c.alpha = 1;
        c.mixTo = c.picture === null && this.media[c.slide].isVideo ? 1 : 0;
      } else {
        c.flat = null;
        gsap.to(c, { alpha: 0, duration: MORPH.othersOut, ease: EASE_HIDE });
      }
    });
    this.media.forEach((m, i) => {
      if (!m.isVideo) return;
      if ([...moving].some((c) => c.slide === i)) {
        if (m.el.paused) {
          const p = m.el.play();
          if (p && p.catch) p.catch(() => {});
        }
      }
    });
    if (centre.picture !== null && wipe) this.wipeToCover(centre, wipe, duration);
    gsap.to(this, { yAlpha: 0, duration: MORPH.othersOut, ease: EASE_HIDE });
    gsap.to(this.logo.rotation, { y: MORPH.logoFrom, duration, ease: EASE_ZOOM });
    this.morph = { p: 0, out: true, sphere, divider };
    gsap.to(this.morph, { p: 1, duration, ease: 'none', onComplete });
  }

  wipeToCover(card, open, duration) {
    const { gsap } = window;
    const u = card.uniforms;
    const t = this.textures[card.slide];
    const m = this.media[card.slide];
    const ta = m.width / m.height;
    u.uNext.value = t.live || t.still;
    u.uNextCover.value.set(...(ta >= RINGS.cardAspect ? [RINGS.cardAspect / ta, 1] : [1, ta / RINGS.cardAspect]));
    const k = duration / (open.wipe.delay + open.wipe.duration);
    gsap.fromTo(u.uWipe, { value: 0 }, { value: 1, duration: open.wipe.duration * k, delay: open.wipe.delay * k, ease: open.wipe.ease });
    gsap.fromTo(u.uWipeZoom, { value: 0 }, { value: 1, duration: open.zoom.duration * k, delay: open.zoom.delay * k, ease: open.zoom.ease });
  }

  killTweens() {
    const wipes = this.cards.flatMap((c) => [c.uniforms.uWipe, c.uniforms.uWipeZoom]);
    window.gsap.killTweensOf([this, this.morph, this.logo.rotation, ...this.cards, ...wipes].filter(Boolean));
    wipes.forEach((w) => (w.value = 0));
  }

  leave() {
    this.killTweens();
    this.morph = null;
    this.cards.forEach((c) => (c.flat = null));
    this.active = false;
    this.enabled = false;
    this.setHovered(null);
    this.media.forEach((m) => m.isVideo && !m.el.paused && m.el.pause());
  }

  setHovered(card) {
    if (card === this.hovered) return;
    this.hovered = card;
    if (this.onHover) this.onHover(card);
  }

  cardRect(card) {
    this.scene.updateMatrixWorld();
    const pos = card.mesh.geometry.attributes.position;
    const v = new THREE.Vector3();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(card.mesh.matrixWorld).project(this.cam);
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: ((x0 + 1) / 2) * w, y: ((1 - y1) / 2) * h, w: ((x1 - x0) / 2) * w, h: ((y1 - y0) / 2) * h };
  }

  open(card) {
    this.opened = card;
    this.enabled = false;
    this.setHovered(null);
    card.mesh.visible = false;
  }

  close() {
    if (this.opened) this.opened.mesh.visible = true;
    this.opened = null;
    this.enabled = true;
    this.fade = 1;
  }

  surfaceClip(card, segments) {
    const row = segments + 1;
    if (!this.clip || this.clip.length !== row * row * 4) this.clip = new Float32Array(row * row * 4);
    const m = new THREE.Matrix4().multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse).multiply(card.mesh.matrixWorld);
    const t = new THREE.Vector2();
    const p = new THREE.Vector4();
    let k = 0;
    for (let j = 0; j <= segments; j++) {
      const v = j / segments;
      for (let i = 0; i <= segments; i++) {
        card.arc(i / segments, t);
        p.set(t.x + Math.sin(v * Math.PI) * this.bend.value, (v - 0.5) * card.h, -t.y, 1).applyMatrix4(m);
        this.clip[k++] = p.x;
        this.clip[k++] = p.y;
        this.clip[k++] = p.z;
        this.clip[k++] = p.w;
      }
    }
    return this.clip;
  }

  cardZoom(card) {
    return card.lift * MOTION.zoom;
  }

  cardFade(card) {
    const view = this.cam.matrixWorldInverse;
    const axis = -new THREE.Vector3().applyMatrix4(view).z;
    const depth = -card.mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(view).z;
    const t = clamp((depth - axis - MOTION.fadeFrom * MOTION.unit) / ((MOTION.fadeTo - MOTION.fadeFrom) * MOTION.unit), 0, 1);
    return card.alpha * this.fade * (1 + (MOTION.fade - 1) * t * t * (3 - 2 * t));
  }

  update(dt) {
    if (!this.active) return;
    const n = Math.min(dt / (1000 / 60), 4);

    if (this.T) {
      this.k += MOTION.step * this.T;
      this.P += this.T;
      this.T = 0;
    }
    this.O = be(this.O, this.k, MOTION.follow, n);
    this.busy = Math.abs(this.j) > 2 || Math.abs(this.k - this.O) > 0.02;
    this.M = be(this.M, this.P, MOTION.speed, n);
    this.j = be(this.j, this.P - this.M, MOTION.speed, n);
    this.bend.value = clamp(MOTION.bend * this.j, -1, 1) * MOTION.unit;
    this.spin.rotation.y -= MOTION.spin * this.j * n;
    const y = this.O * MOTION.unit;
    const loop = this.rings.length * RINGS.ringGap;
    this.shift.position.y = y;
    this.pull = (Math.abs(y - this.lastY) / Math.max(n, 1e-3)) * RINGS.pullBack;
    this.lastY = y;

    this.rings.forEach((ring) => {
      const s = ring.y + y;
      if (s < -loop / 2) ring.y += loop;
      else if (s > loop / 2) ring.y -= loop;
    });
    this.place(n);
    this.updateCamera(dt);

    if (this.enabled && this.canHover && this.pointer) {
      this.scene.updateMatrixWorld();
      this.raycaster.setFromCamera(this.pointer, this.cam);
      const hit = this.raycaster.intersectObjects(this.meshes.filter((m) => m.visible), false)[0];
      this.setHovered(hit ? hit.object.userData.card : null);
    } else if (!this.enabled) {
      this.setHovered(null);
    }

    if (this.ready && !this.busy) this.syncLive();
    this.cards.forEach((c) => {
      if (c.mix !== c.mixTo) {
        c.mix = be(c.mix, c.mixTo, MOTION.liveMix, n);
        if (Math.abs(c.mixTo - c.mix) < 0.001) c.mix = c.mixTo;
      }
      const lift = c === this.hovered || c === this.opened ? 1 : 0;
      if (c.lift !== lift) {
        c.lift = be(c.lift, lift, MOTION.liftEase, n);
        if (Math.abs(lift - c.lift) < 0.001) c.lift = lift;
      }
    });
  }

  place(n) {
    this.rings.forEach((ring) => {
      let drift = RINGS.drift + ring.speed * RINGS.driftSpeed;
      if (Math.abs(drift) < RINGS.minDrift) drift = (drift < 0 ? -1 : 1) * RINGS.minDrift;
      const step = drift * n;
      ring.cards.forEach((c) => {
        c.angle += step;
        const r = c.radius + c.lift * MOTION.lift * MOTION.unit;
        const px = r * Math.cos(c.angle);
        const pz = r * Math.sin(c.angle);
        c.mesh.position.set(px, ring.y + c.dy, pz);
        c.mesh.rotation.set(0, Math.atan2(-px, -pz), 0);
      });
    });
  }

  updateCamera(dt) {
    const W = window.innerWidth;
    if (this.cam.fov !== RINGS.fov) {
      this.cam.fov = RINGS.fov;
      this.cam.updateProjectionMatrix();
    }
    const { w0, r0, w1, r1 } = RINGS.camera;
    const radius = r0 + (r1 - r0) * Math.min(Math.max((W - w0) / (w1 - w0), 0), 1) + this.pull;
    this.camBase.position.set(radius, 0, 0);
    this.camBase.lookAt(0, -RINGS.lookDown, 0);
    const p = this.pointer || { x: 0, y: 0 };
    const mo = RINGS.mouse;
    this.mx = damp(this.mx, p.x * mo.x, mo.damp, dt);
    this.my = damp(this.my, p.y * mo.y, mo.damp, dt);
    this.cam.rotation.set(-Math.PI - this.my * mo.turn, this.mx * mo.turn, Math.PI);
    this.cam.position.set(this.mx * mo.shift, -this.my * mo.shift, 0);
    this.scene.updateMatrixWorld();
  }

  syncLive() {
    this.scene.updateMatrixWorld();
    const camPos = this.cam.getWorldPosition(new THREE.Vector3());
    const v = new THREE.Vector3();
    const list = [];
    this.cards.forEach((c) => {
      if (c.picture !== null || !this.media[c.slide].isVideo || !c.mesh.visible) return;
      v.setFromMatrixPosition(c.mesh.matrixWorld);
      const near = v.distanceTo(camPos);
      v.project(this.cam);
      if (v.z > 1 || Math.abs(v.x) >= MOTION.frame || Math.abs(v.y) >= MOTION.frame) return;
      list.push({ slide: c.slide, near });
    });
    list.sort((a, b) => a.near - b.near);
    const live = new Set(this.opened ? [this.opened.slide] : []);
    list.forEach(({ slide }, r) => {
      if (live.has(slide)) return;
      if (r < MOTION.live || (r < MOTION.liveKeep && this.live.has(slide))) live.add(slide);
    });
    this.live = live;
    this.media.forEach((m, i) => {
      if (!m.isVideo) return;
      if (live.has(i)) {
        if (m.el.paused) {
          const p = m.el.play();
          if (p && p.catch) p.catch(() => {});
        }
      } else if (!m.el.paused) {
        m.el.pause();
      }
    });
    this.cards.forEach((c) => (c.mixTo = c.picture === null && live.has(c.slide) ? 1 : 0));
  }

  morphUniforms() {
    this.scene.updateMatrixWorld();
    const m = this.morph;
    const H = window.innerHeight;
    const T = m ? (m.out ? 1 - EASE_ZOOM(m.p) : EASE_ZOOM(m.p)) : 1;
    const depth = m ? m.sphere * factor() * EASE_SPHERE(bell(m.p)) : 0;
    const sphereCamera = H / 2 / Math.tan((22.5 * Math.PI) / 180);
    const v = new THREE.Vector3();
    this.cards.forEach((c) => {
      const u = c.uniforms;
      const f = c.flat;
      if (!m || !f) {
        u.uMorph.value = 1;
        u.uSphere.value.set(0, 0, 1);
        u.uOverlay.value = 0;
        return;
      }
      u.uMorph.value = T;
      u.uRect.value.set(f.rect.x, f.rect.y, f.rect.w, f.rect.h);
      v.setFromMatrixPosition(c.mesh.matrixWorld).applyMatrix4(this.cam.matrixWorldInverse);
      u.uDepth.value = Math.max(-v.z, 0.5);
      const media = this.media[c.slide];
      const ca = f.rect.w / f.rect.h;
      const ta = media.width / media.height;
      const k = f.zoom || 1;
      if (ta >= ca) u.uFit.value.set(ca / ta / k, 1 / k);
      else u.uFit.value.set(1 / k, ta / ca / k);
      u.uOverlay.value = f.overlay || 0;
      const radius = Math.abs(depth) > 0.01 ? f.rect.w + (this.cardRect(c).w - f.rect.w) * T : 0;
      u.uSphere.value.set(radius, depth, sphereCamera);
    });
    return { T, H };
  }

  render() {
    if (!this.active) return;
    const { T, H } = this.morphUniforms();
    const axis = -new THREE.Vector3().applyMatrix4(this.cam.matrixWorldInverse).z;
    this.depthFade.value.set(MOTION.fade, axis + MOTION.fadeFrom * MOTION.unit, axis + MOTION.fadeTo * MOTION.unit);
    this.cards.forEach((c) => {
      const a = c.alpha * this.fade;
      c.uniforms.uAlpha.value = a;
      c.uniforms.uMix.value = c.mix;
      c.uniforms.uHover.value = c.lift * MOTION.zoom;
      c.mesh.material.visible = a > 0.001;
      c.mesh.material.depthWrite = a > 0.999;
    });
    const r = this.renderer;
    r.setClearColor(0, 0);
    r.clear();
    if (this.morph && this.morph.divider && this.dividerBox) {
      const d = 1 - T;
      const b = this.dividerBox();
      const color = new THREE.Color().setRGB(...PAGE.map((a, i) => a + (DIVIDER.color[i] - a) * d), THREE.SRGBColorSpace);
      r.setScissorTest(true);
      r.setScissor(b.x, H - b.bottom, 1, b.bottom - b.top);
      r.setClearColor(color, 1);
      r.clear(true, false, false);
      r.setScissorTest(false);
      r.setClearColor(0, 0);
    }
    if (this.yModel.update()) {
      const box = new THREE.Box3().setFromObject(this.yModel.object);
      this.yHeight = box.max.y - box.min.y;
    }
    this.logo.scale.setScalar(RINGS.logo.height / this.yHeight);
    this.logo.position.y = RINGS.logo.y + RINGS.logo.centre;
    const spin = this.spin.rotation.y;
    if (this.lastSpin === undefined) this.lastSpin = spin;
    this.turn.rotation.y += (spin - this.lastSpin) * RINGS.logo.turn;
    this.lastSpin = spin;
    const yAlpha = this.fade * this.yAlpha;
    this.logo.visible = yAlpha > 0.001;
    this.yMaterial.uniforms.uOpacity.value = yAlpha;
    applyY3D(this.yMaterial, Math.PI / 2);
    r.render(this.scene, this.cam);
  }
}
