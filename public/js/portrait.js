import { isMobile } from './mobile.js';

const VERTEX = `precision highp float;
attribute vec4 a_p;
uniform float u_w;
attribute vec2 a_t;
varying vec2 t;
varying vec2 p;
void main() {
  gl_Position = vec4(a_p.xy / u_w, 0.0, 1.0);
  t = a_t;
  p = a_p.xy;
}`;

const FRAGMENT = `precision highp float;varying vec2 p;varying vec2 t;uniform sampler2D a;uniform vec2 u_a;uniform float u_b;uniform float u_c;uniform float u_d;uniform float u_e;uniform float u_f;uniform float u_g;float z(in vec2 q){return fract(sin(dot(q.xy,vec2(12.9898,78.233)))*43758.5453123);}float y(vec2 q){vec2 i=floor(q);vec2 f=fract(q);vec2 u=f*f*(3.0-2.0*f);return mix(mix(z(i+vec2(0.0,0.0)),z(i+vec2(1.0,0.0)),u.x),mix(z(i+vec2(0.0,1.0)),z(i+vec2(1.0,1.0)),u.x),u.y);}float x(in vec2 q){float v=0.0;float a=0.5;vec2 k=vec2(100.0);mat2 r=mat2(cos(0.5),sin(0.5),-sin(0.5),cos(0.50));for(int i=0;i<5;++i){v+=a*y(q);q=r*q*2.0+k;a*=0.5;}return v;}void main(){vec4 d=mix(vec4(u_c,u_c,u_c,1.0),texture2D(a,t),u_b);vec2 v=vec2(p.x-u_a.x,p.y-u_a.y);float e=sqrt((v.x*v.x)+(v.y*v.y));float f=u_g*u_e;if(e<f){vec2 w=vec2(t)*20.0;float f=x(w+vec2(x(w+1.0*vec2(x(w))+vec2(1.7,9.2)+0.15*u_d/1.8)))*(4.0*e/f);vec4 i=texture2D(a,t+y(t*20.0-u_d/5.0)/70.0);d=mix(mix(vec4(vec3(i.rgb+0.09),1.0),vec4(0.0),u_f),d,step(0.5,(f*f*f+.6*f*f+.5*f)));}gl_FragColor=d;}`;

const PORTRAIT = {
  speed: 1,
  dmax: 1.8129,
  mouseDamp: 0.07,
  areaDamp: 0.05,
  dpr: 2,
  reveal: { duration: 2.2, to: 20, grid: 16, margin: 1.2 },
  click: 6,
  intro: { duration: 1.6, rise: 100, zoom: 0.17 },
  color: 11 / 255,
};

const WIN_GL = 2 * Math.tan((45 * Math.PI) / 180 / 2) * 5;
const FRAME = 1000 / 60;

const lerp = (a, b, t) => a * (1 - t) + b * t;
const damp = (a, b, k, rd) => lerp(a, b, 1 - Math.exp(Math.log(1 - k) * rd));
const round = (v) => Math.round(v * 100) / 100;
const o6 = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));
const o4 = (t) => 1 - (t - 1) ** 4;

const fract = (v) => v - Math.floor(v);
const hash = (x, y) => fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123);
function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
const COS = Math.cos(0.5);
const SIN = Math.sin(0.5);
function fbm(x, y) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 5; i++) {
    v += a * noise(x, y);
    const nx = (COS * x - SIN * y) * 2 + 100;
    y = (SIN * x + COS * y) * 2 + 100;
    x = nx;
    a *= 0.5;
  }
  return v;
}
function cut(tx, ty, e, area, time) {
  if (e >= area) return false;
  const wx = tx * 20;
  const wy = ty * 20;
  const k = (0.15 * time) / 1.8;
  const s1 = fbm(wx, wy);
  const s2 = fbm(wx + s1 + 1.7 + k, wy + s1 + 9.2 + k);
  const f = fbm(wx + s2, wy + s2) * ((4 * e) / area);
  return f * f * f + 0.6 * f * f + 0.5 * f < 0.5;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export class Portrait {
  constructor(canvas, slot, images) {
    this.canvas = canvas;
    this.slot = slot;
    const gl = (this.gl = canvas.getContext('webgl2', { antialias: true, alpha: true }) || canvas.getContext('webgl', { antialias: true, alpha: true }));
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);
    this.loc = {
      p: gl.getAttribLocation(program, 'a_p'),
      t: gl.getAttribLocation(program, 'a_t'),
    };
    this.u = Object.fromEntries(['w', 'a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => [k, gl.getUniformLocation(program, `u_${k}`)]));
    this.posBuffer = gl.createBuffer();
    this.texBuffer = gl.createBuffer();

    this.textures = images.map((img) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const mips = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      if (mips) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return { tex, ratio: img.naturalWidth / img.naturalHeight };
    });

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(this.u.w, WIN_GL / 2);

    this.mouse = { curr: { x: 0, y: -3 }, targ: { x: 0, y: -3 } };
    this.pointer = { x: 0, y: -3 };
    this.area = { curr: 0, currR: 0, targ: 0 };
    this.start = null;
    this.last = null;
    this.intro = { prog: 0, opacity: 0, tr: 0, scale: 1 };

    this.top = 0;
    this.revealing = false;
    this.waitLeave = false;
    this.down = null;
    window.addEventListener('mousemove', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      if (this.revealing) return;
      this.mouse.targ.x = e.clientX;
      this.mouse.targ.y = e.clientY;
    });
    window.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }));
    slot.addEventListener('click', (e) => {
      const d = this.down;
      if (d && Math.max(Math.abs(e.clientX - d.x), Math.abs(e.clientY - d.y)) > PORTRAIT.click) return;
      if (isMobile() && !this.revealing) {
        this.pointer.x = this.mouse.targ.x = this.mouse.curr.x = e.clientX;
        this.pointer.y = this.mouse.targ.y = this.mouse.curr.y = e.clientY;
      }
      this.reveal();
    });
    this.resize();
  }

  resize(scrollY = 0) {
    const { canvas, gl } = this;
    const ratio = Math.min(window.devicePixelRatio || 1, PORTRAIT.dpr);
    const w = Math.round(canvas.clientWidth * ratio);
    const h = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    const r = this.slot.getBoundingClientRect();
    this.box = { x: r.left, y: r.top + scrollY, w: r.width, h: r.height };
    this.win = { w: window.innerWidth, h: window.innerHeight };
    this.size = [canvas.width, canvas.height, this.box.x, this.box.y, this.box.w, this.box.h, this.win.w, this.win.h].join();
  }

  show(instant = false) {
    const { intro } = this;
    const set = () => {
      const e = 1 - o6(intro.prog);
      intro.tr = PORTRAIT.intro.rise * e;
      intro.opacity = o4(intro.prog);
      intro.scale = 1 + PORTRAIT.intro.zoom * e;
    };
    if (instant) {
      intro.prog = 1;
      set();
      return;
    }
    window.gsap.to(intro, { prog: 1, duration: PORTRAIT.intro.duration, ease: 'none', onUpdate: set });
  }

  reveal() {
    if (this.revealing) return;
    this.revealing = true;
    this.revealFrom = 0;
    this.waitLeave = true;
    const { area } = this;
    const from = area.currR;
    const tween = { p: 0 };
    this.revealTween = window.gsap.to(tween, {
      p: 1,
      duration: PORTRAIT.reveal.duration,
      ease: 'none',
      onUpdate: () => (area.currR = lerp(from, PORTRAIT.reveal.to, tween.p)),
      onComplete: () => this.endReveal(),
    });
  }

  endReveal() {
    const { area, mouse, pointer } = this;
    this.revealTween.kill();
    this.top = 1 - this.top;
    area.curr = area.currR = area.targ = 0;
    mouse.targ.x = mouse.curr.x = pointer.x;
    mouse.targ.y = mouse.curr.y = pointer.y;
    this.revealing = false;
  }

  revealed(mx, my, scrollY, time) {
    const g = this.geometry(this.textures[this.top].ratio, scrollY);
    const [left, bottom, right] = g.pos;
    const top = g.pos[5];
    const [u0, vBottom, u1] = g.tex;
    const vTop = g.tex[5];
    const half = WIN_GL / 2;
    const area = PORTRAIT.dmax * this.area.currR;
    const cols = Math.ceil(this.box.w / PORTRAIT.reveal.grid) + 1;
    const rows = Math.ceil(this.box.h / PORTRAIT.reveal.grid) + 1;
    const count = cols * rows;
    for (let n = 0; n < count; n++) {
      const index = (this.revealFrom + n) % count;
      const sx = (index % cols) / (cols - 1);
      const sy = Math.floor(index / cols) / (rows - 1);
      const px = lerp(left, right, sx);
      const py = lerp(top, bottom, sy);
      if (px > half || px < -half || py > half || py < -half) continue;
      const e = Math.hypot(px - mx, py - my) * PORTRAIT.reveal.margin;
      if (!cut(lerp(u0, u1, sx), lerp(vTop, vBottom, sy), e, area, time)) {
        this.revealFrom = index;
        return false;
      }
    }
    return true;
  }

  geometry(ratio, scrollY) {
    const { box, win } = this;
    const kx = WIN_GL / win.w;
    const ky = WIN_GL / win.h;
    const half = WIN_GL / 2;
    const left = box.x * kx - half;
    const right = left + box.w * kx;
    const top = half - (box.y + this.intro.tr - scrollY * PORTRAIT.speed) * ky;
    const bottom = top - box.h * ky;

    const shape = box.w / box.h;
    const scale = this.intro.scale;
    const sw = ratio < shape ? scale : (scale * ratio) / shape;
    const sh = ratio < shape ? (scale / ratio) * shape : scale;
    const u0 = (1 - 1 / sw) / 2;
    const u1 = 1 / sw + u0;
    const v0 = (1 - 1 / sh) / 2;
    const vTop = v0;
    const vBottom = 1 - v0;

    return {
      pos: [left, bottom, right, bottom, left, top, left, top, right, bottom, right, top],
      tex: [u0, vBottom, u1, vBottom, u0, vTop, u0, vTop, u1, vBottom, u1, vTop],
    };
  }

  draw(index, scrollY, area) {
    const { gl } = this;
    const g = this.geometry(this.textures[index].ratio, scrollY);
    gl.uniform1f(this.u.e, area);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[index].tex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.tex), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.loc.t);
    gl.vertexAttribPointer(this.loc.t, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.pos), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.loc.p);
    gl.vertexAttribPointer(this.loc.p, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  update(now, scrollY) {
    if (this.start === null) this.start = now;
    const rd = this.last === null ? 1 : (now - this.last) / FRAME;
    this.last = now;
    const { gl, mouse, pointer, area, box, win } = this;

    const ty = pointer.y + scrollY * PORTRAIT.speed;
    const hit = pointer.x >= box.x && pointer.x <= box.x + box.w && ty >= box.y && ty <= box.y + box.h;
    if (!hit) this.waitLeave = false;
    if (!this.revealing) {
      mouse.curr.x = damp(mouse.curr.x, mouse.targ.x, PORTRAIT.mouseDamp, rd);
      mouse.curr.y = damp(mouse.curr.y, mouse.targ.y, PORTRAIT.mouseDamp, rd);
      const over = hit && !this.waitLeave && !isMobile();
      if (over && area.targ === 0) area.targ = 1;
      else if (!over && area.targ === 1) area.targ = 0;
      area.curr = damp(area.curr, area.targ, PORTRAIT.areaDamp, rd);
      area.currR = round(area.curr);
    }
    const mx = (mouse.curr.x * WIN_GL) / win.w - WIN_GL / 2;
    const my = ((win.h - mouse.curr.y) * WIN_GL) / win.h - WIN_GL / 2;
    const time = (now - this.start) / 300;
    if (this.revealing && this.revealed(mx, my, scrollY, time)) this.endReveal();

    const y = box.y + this.intro.tr - scrollY * PORTRAIT.speed;
    const offscreen = y > win.h || y + box.h < 0;
    const { intro } = this;
    const key = offscreen ? 'off' : area.currR > 0 ? null : `${this.top}|${scrollY}|${intro.tr}|${intro.opacity}|${intro.scale}|${this.size}`;
    if (key !== null && key === this.drawn) return;
    this.drawn = key;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (offscreen) return;

    gl.uniform2f(this.u.a, mx, my);
    gl.uniform1f(this.u.b, this.intro.opacity);
    gl.uniform1f(this.u.c, PORTRAIT.color);
    gl.uniform1f(this.u.d, time);
    gl.uniform1f(this.u.f, 1);
    gl.uniform1f(this.u.g, PORTRAIT.dmax);
    this.draw(1 - this.top, scrollY, 0);
    this.draw(this.top, scrollY, area.currR);
  }
}
