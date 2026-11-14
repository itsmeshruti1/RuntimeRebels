import * as THREE from 'three';
import { o6 } from './ease.js';
import { GLYPH } from './glyph-a.js';

const BASE_INK = 90;
const MARK_SIZE = 40;
const STEPS = 72;

const Y3D = {
  depth: 10.02,
  bevelThickness: 0.72,
  bevelSize: 0.72,
  markBevel: 0.1,
  bevelSegments: 12,
  curveSegments: 96,
  crease: 40,
  distance: 4.7,
  introDuration: 2,
  introFrom: 0,
  introTurns: 2,
  turn: 5.05,
  scrollBoost: 0.007,
  spinEase: 0.05,
  f0: 0.6,
  ambient: 0,
  grain: 0.12,
  grainScale: 0.9,
  green: '#cee49f',
  greenFrom: 0.45,
  greenTo: 0.85,
  exposure: 1.15,
  horizon: 3,
  env: {
    top: [
      180, 140, 128, 120, 120, 110, 100, 90, 80, 70, 60, 60,
      150, 235, 255, 255, 210, 120, 20, 10, 8, 8, 8, 10,
      60, 110, 118, 110, 70, 20, 12, 12, 12, 12, 12, 12,
      12, 12, 12, 12, 12, 12, 12, 12, 10, 15, 30, 60,
      100, 110, 100, 80, 60, 55, 40, 15, 12, 12, 15, 25,
      50, 90, 120, 120, 120, 130, 150, 170, 190, 200, 210, 230,
    ],
    bottom: [
      60, 92, 90, 88, 82, 78, 72, 68, 64, 56, 50, 46,
      44, 44, 36, 28, 20, 12, 11, 11, 11, 11, 11, 11,
      11, 6, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
      3, 3, 3, 3, 3, 3, 3, 3, 4, 10, 12, 15,
      18, 18, 18, 16, 12, 12, 10, 10, 10, 10, 10, 10,
      10, 12, 14, 12, 14, 16, 18, 20, 18, 16, 15, 20,
    ],
  },
  dpi: 3,
};

const VERTEX = `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

void main() {
  vLocalPos = position;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FRAGMENT = `
#define STEPS ${STEPS}
uniform float uTop[STEPS];
uniform float uBottom[STEPS];
uniform float uHorizon;
uniform float uTurn;
uniform float uF0;
uniform float uAmbient;
uniform float uGrain;
uniform float uGrainScale;
uniform vec3 uGreen;
uniform float uGreenFrom;
uniform float uGreenTo;
uniform float uOpacity;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float env(vec3 R) {
  float c = cos(uTurn);
  float s = sin(uTurn);
  R = vec3(R.x * c - R.z * s, R.y, R.x * s + R.z * c);
  float a = atan(-R.x, R.z) / 6.28318530718;
  a = fract(a) * float(STEPS);
  int i = int(floor(a)) % STEPS;
  int j = i + 1 == STEPS ? 0 : i + 1;
  float f = a - floor(a);
  float top = mix(uTop[i], uTop[j], f);
  float bottom = mix(uBottom[i], uBottom[j], f);
  float e = degrees(asin(clamp(R.y, -1.0, 1.0)));
  return mix(bottom, top, smoothstep(-uHorizon, uHorizon, e));
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 R = reflect(-V, N);

  float light = uAmbient + env(R);
  light *= 1.0 + uGrain * (vnoise(vLocalPos * uGrainScale) - 0.5) * 2.0;

  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float F = uF0 + (1.0 - uF0) * pow(1.0 - NdV, 5.0);
  float v = pow(clamp(F * light, 0.0, 1.0), 1.0 / 2.2);

  vec3 color = mix(vec3(v), uGreen * min(v / uGreenTo, 1.0), smoothstep(uGreenFrom, uGreenTo, v));
  gl_FragColor = vec4(color, uOpacity);
}
`;

function shapePath(d) {
  const path = new THREE.ShapePath();
  const t = d.match(/[MLHVCQZ]|-?\d*\.?\d+(?:e-?\d+)?/g);
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  const n = () => parseFloat(t[i++]);
  while (i < t.length) {
    if (/[A-Z]/.test(t[i])) cmd = t[i++];
    if (cmd === 'Z') continue;
    if (cmd === 'M') {
      path.moveTo((x = n()), (y = n()));
      cmd = 'L';
    } else if (cmd === 'L') path.lineTo((x = n()), (y = n()));
    else if (cmd === 'H') path.lineTo((x = n()), y);
    else if (cmd === 'V') path.lineTo(x, (y = n()));
    else if (cmd === 'C') {
      const c = [n(), n(), n(), n()];
      path.bezierCurveTo(...c, (x = n()), (y = n()));
    } else if (cmd === 'Q') {
      const c = [n(), n()];
      path.quadraticCurveTo(...c, (x = n()), (y = n()));
    }
  }
  return path;
}

function creaseNormals(geometry, angle) {
  const pos = geometry.attributes.position;
  const count = pos.count;
  const faces = new Float32Array(count);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    c.sub(b);
    a.sub(b);
    c.cross(a);
    faces[i] = c.x;
    faces[i + 1] = c.y;
    faces[i + 2] = c.z;
  }
  const unit = new Float32Array(count);
  for (let i = 0; i < count; i += 3) {
    const l = Math.hypot(faces[i], faces[i + 1], faces[i + 2]) || 1;
    unit[i] = faces[i] / l;
    unit[i + 1] = faces[i + 1] / l;
    unit[i + 2] = faces[i + 2] / l;
  }
  const groups = new Map();
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  }
  const limit = Math.cos((angle * Math.PI) / 180);
  const normals = new Float32Array(count * 3);
  groups.forEach((group) => {
    group.forEach((i) => {
      const f = i - (i % 3);
      let x = 0;
      let y = 0;
      let z = 0;
      group.forEach((j) => {
        const g = j - (j % 3);
        if (unit[f] * unit[g] + unit[f + 1] * unit[g + 1] + unit[f + 2] * unit[g + 2] < limit) return;
        x += faces[g];
        y += faces[g + 1];
        z += faces[g + 2];
      });
      const l = Math.hypot(x, y, z) || 1;
      normals[i * 3] = x / l;
      normals[i * 3 + 1] = y / l;
      normals[i * 3 + 2] = z / l;
    });
  });
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

export function createYMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new Float32Array(STEPS) },
      uBottom: { value: new Float32Array(STEPS) },
      uHorizon: { value: 1 },
      uTurn: { value: 0 },
      uF0: { value: 0 },
      uAmbient: { value: 0 },
      uGrain: { value: 0 },
      uGrainScale: { value: 0 },
      uGreen: { value: new THREE.Vector3() },
      uGreenFrom: { value: 0 },
      uGreenTo: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: true,
  });
}

export function applyY3D(material, lightTurn = 0) {
  const u = material.uniforms;
  const light = (d) => (Math.pow(d / 255, 2.2) * Y3D.exposure) / Y3D.f0;
  for (let i = 0; i < STEPS; i++) {
    u.uTop.value[i] = light(Y3D.env.top[i]);
    u.uBottom.value[i] = light(Y3D.env.bottom[i]);
  }
  u.uHorizon.value = Y3D.horizon;
  u.uTurn.value = lightTurn;
  const green = parseInt(Y3D.green.slice(1), 16);
  u.uGreen.value.set(((green >> 16) & 255) / 255, ((green >> 8) & 255) / 255, (green & 255) / 255);
  u.uGreenFrom.value = Y3D.greenFrom;
  u.uGreenTo.value = Y3D.greenTo;
  u.uF0.value = Y3D.f0;
  u.uAmbient.value = Y3D.ambient;
  u.uGrain.value = Y3D.grain;
  u.uGrainScale.value = Y3D.grainScale;
}

export class YModel {
  constructor(material) {
    this.material = material;
    this.shapes = GLYPH.paths.flatMap((d) => shapePath(d).toShapes(true));
    this.object = new THREE.Group();
    this.key = '';
  }

  update() {
    const key = [Y3D.depth, Y3D.bevelThickness, Y3D.bevelSize, Y3D.markBevel, Y3D.bevelSegments, Y3D.curveSegments, Y3D.crease].join();
    if (key === this.key) return false;
    this.key = key;
    const k = GLYPH.inkHeight / BASE_INK;
    const options = (thickness, bevel) => ({
      depth: Y3D.depth * k,
      bevelEnabled: true,
      bevelThickness: thickness * k,
      bevelSize: bevel * k,
      bevelOffset: -bevel * k,
      bevelSegments: Math.round(Y3D.bevelSegments),
      curveSegments: Math.round(Y3D.curveSegments),
    });
    const logo = this.object;
    logo.children.slice().forEach((mesh) => {
      mesh.geometry.dispose();
      logo.remove(mesh);
    });
    logo.position.set(0, 0, 0);
    const box = new THREE.Box2();
    const extent = new THREE.Vector2();
    this.shapes.forEach((shape) => {
      box.setFromPoints(shape.getPoints()).getSize(extent);
      const mark = Math.max(extent.x, extent.y) < MARK_SIZE;
      const o = mark ? options(Y3D.markBevel, Y3D.markBevel) : options(Y3D.bevelThickness, Y3D.bevelSize);
      logo.add(new THREE.Mesh(creaseNormals(new THREE.ExtrudeGeometry(shape, o), Y3D.crease), this.material));
    });
    const centre = new THREE.Box3().setFromObject(logo).getCenter(new THREE.Vector3());
    logo.position.copy(centre).negate();
    return true;
  }
}

export class Y3d {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false }));
    renderer.setClearColor(0, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(10, 1, 1, 100000);

    this.material = createYMaterial();

    this.model = new YModel(this.material);
    this.logo = this.model.object;
    this.group = new THREE.Group();
    this.group.add(this.logo);
    this.scene.add(this.group);

    this.angle = 0;
    this.speed = (Math.PI * 2) / Y3D.turn;
    this.way = 1;
    this.scroll = null;
    this.last = null;
    this.paused = false;
    this.intro = { scale: Y3D.introFrom, turn: 0 };

    this.resize();
  }

  geometry() {
    this.model.update();
  }

  resize() {
    const { canvas, renderer, camera } = this;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, Y3D.dpi));
    renderer.setSize(w, h, false);
    const designH = Number(getComputedStyle(canvas).getPropertyValue('--y-h'));
    const distance = Y3D.distance * GLYPH.inkHeight;
    camera.aspect = w / h;
    camera.fov = (2 * Math.atan(designH / 2 / distance) * 180) / Math.PI;
    camera.position.set(0, 0, distance);
    camera.updateProjectionMatrix();
  }

  show(instant) {
    if (instant) {
      Object.assign(this.intro, { scale: 1, turn: 0 });
      return;
    }
    this.angle += this.intro.turn;
    window.gsap.fromTo(
      this.intro,
      { scale: Y3D.introFrom, turn: 0 },
      {
        scale: 1,
        turn: this.way * Y3D.introTurns * Math.PI * 2,
        duration: Y3D.introDuration,
        ease: o6,
        overwrite: true,
      },
    );
  }

  update(now, scroll) {
    const dt = this.last === null ? 0 : Math.min(now - this.last, 100) / 1000;
    this.last = now;
    const velocity = this.scroll === null || dt === 0 ? 0 : (scroll - this.scroll) / dt;
    this.scroll = scroll;
    if (velocity !== 0) this.way = Math.sign(velocity);
    if (!this.paused) {
      const target = this.way * ((Math.PI * 2) / Y3D.turn + Math.abs(velocity) * Y3D.scrollBoost);
      this.speed += (target - this.speed) * (1 - Math.exp(-dt / Y3D.spinEase));
      this.angle += this.speed * dt;
    }
    this.group.rotation.y = this.angle + this.intro.turn;
    this.group.scale.setScalar(this.intro.scale);

    this.canvas.style.transform = `translate3d(0, ${-scroll}px, 0)`;
    if (this.canvas.offsetTop + this.canvas.offsetHeight - scroll <= 0) return;

    this.geometry();
    applyY3D(this.material);

    this.renderer.render(this.scene, this.camera);
  }
}
