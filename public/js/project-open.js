import { createProgram } from './gl.js';

const VERTEX = `
attribute vec2 position;
attribute vec2 uv;
attribute vec4 aStart; 

uniform mat4 uProjection;
uniform float uCameraZ;
uniform vec4 uRect; 
uniform float a1;
uniform float a2;
uniform float p1;
uniform float uLift;
uniform float uStart; 

varying vec2 vUv;

float eq(float x) {
    return x < 0.5 ? 8. * x * x * x * x : 1. - pow(-2. * x + 2., 4.) / 2.;
}

void main() {
    vUv = uv;

    float aa = (1. - uv.x) + 1.;
    aa -= uv.y * p1 * 2.;
    aa = abs(aa);
    float ab = 0.05;
    float dt = distance(vec2(aa, ab), vec2(a1, a2));
    dt *= .25;
    dt *= 0.3;
    dt *= 4.5;
    float tr = min(1., dt + 0.3);
    float hl = eq(tr);
    float z = (210. - 210. * hl) * uLift;

    vec2 xy = position * uRect.zw + uRect.xy;
    gl_Position = uProjection * vec4(xy, z - uCameraZ, 1.0);

    if (uStart > 0.) {
        vec3 rect = gl_Position.xyz / gl_Position.w;
        vec3 card = aStart.xyz / aStart.w;
        gl_Position = vec4(mix(rect, card, uStart) * gl_Position.w, gl_Position.w);
    }
}`;

const FRAGMENT = `
precision highp float;

uniform sampler2D tex;
uniform sampler2D tex2;
uniform vec2 ns;
uniform vec2 ns2;
uniform vec2 ps;
uniform vec2 ps1;
uniform float p1;
uniform float z;
uniform vec3 uOverlayColor;
uniform float uOverlay;
uniform float uOldZoom; 
uniform float uOldScale; 

varying vec2 vUv;

vec2 gu(vec2 uv, vec2 ns, vec2 ps){
    vec2 tu = uv - vec2(0.5);

    float pa = ps.x/ps.y;
    float ta = ns.x/ns.y;
    if(pa<ta){
        tu = tu*vec2(pa/ta,1.);
    } else{
        tu = tu*vec2(1.,ta/pa);
    }

    tu += vec2(0.5);
    return tu;
}

void main(){
    vec2 uv1 = gu(vUv, ns, ps1);
    uv1 = .5 + (uv1 - .5) / uOldScale;
    uv1 = .5 + (uv1 - .5) * (1. - uOldZoom);
    vec2 uv2 = gu(vUv, ns2, ps);
    uv2 -= 0.5;
    uv2 *= 0.8 + (0.2 * z);
    uv2 += 0.5;
    vec3 t = texture2D(tex, uv1).rgb;
    t = mix(t, uOverlayColor, uOverlay);
    vec3 tb = texture2D(tex2, uv2).rgb;
    float x = 1. - vUv.x; 
    float f = smoothstep(0., 1. - vUv.y, (-x + 1. + x * p1) * p1);
    gl_FragColor = vec4(mix(t, tb, f), 1.);
}`;

export const SEGMENTS = 30;

function grid() {
  const data = [];
  for (let j = 0; j <= SEGMENTS; j++) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = i / SEGMENTS;
      const v = j / SEGMENTS;
      data.push(u - 0.5, v - 0.5, u, v);
    }
  }
  const index = [];
  const row = SEGMENTS + 1;
  for (let j = 0; j < SEGMENTS; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * row + i;
      index.push(a, a + 1, a + row, a + row, a + 1, a + row + 1);
    }
  }
  return { vertices: new Float32Array(data), indices: new Uint16Array(index) };
}

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export const CAMERA_Z = 600;

export class ProjectOpen {
  constructor(renderer, overlay) {
    this.renderer = renderer;
    this.overlay = overlay;
    const gl = (this.gl = renderer.gl);
    this.p = createProgram(gl, VERTEX, FRAGMENT);
    this.p.position = gl.getAttribLocation(this.p.program, 'position');
    this.p.uv = gl.getAttribLocation(this.p.program, 'uv');
    this.p.start = gl.getAttribLocation(this.p.program, 'aStart');
    this.startBuffer = gl.createBuffer();
    const { vertices, indices } = grid();
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.count = indices.length;
  }

  render(s, old, next) {
    const gl = this.gl;
    const p = this.p;
    const u = p.uniforms;
    const w = window.innerWidth;
    const h = window.innerHeight;
    gl.useProgram(p.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.enableVertexAttribArray(p.position);
    gl.vertexAttribPointer(p.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(p.uv);
    gl.vertexAttribPointer(p.uv, 2, gl.FLOAT, false, 16, 8);
    const fromCard = Boolean(s.startClip);
    if (fromCard) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.startBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, s.startClip, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(p.start);
      gl.vertexAttribPointer(p.start, 4, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(p.start);
      gl.vertexAttrib4f(p.start, 0, 0, 0, 1);
    }
    gl.uniform1f(u.uStart, fromCard ? 1 - s.move : 0);
    gl.uniform1f(u.uOldZoom, fromCard ? (s.oldZoom || 0) * (1 - s.move) : 0);
    gl.uniform1f(u.uOldScale, s.oldScale || 1);

    gl.uniformMatrix4fv(u.uProjection, false, perspective(2 * Math.atan(h / 2 / CAMERA_Z), w / h, 10, 2000));
    gl.uniform1f(u.uCameraZ, CAMERA_Z);
    const r = s.rect;
    gl.uniform4f(u.uRect, r.x + r.w / 2 - w / 2, h / 2 - (r.y + r.h / 2), r.w, r.h);
    gl.uniform1f(u.a1, s.a1);
    gl.uniform1f(u.a2, s.a2);
    gl.uniform1f(u.p1, s.p1);
    gl.uniform1f(u.z, s.z);
    gl.uniform1f(u.uLift, s.lift * (s.liftScale === undefined ? 1 : s.liftScale));
    gl.uniform2f(u.ns, old.width, old.height);
    gl.uniform2f(u.ns2, next.width, next.height);
    gl.uniform2f(u.ps, s.fit.w, s.fit.h);
    gl.uniform2f(u.ps1, s.from.w, s.from.h);
    gl.uniform3fv(u.uOverlayColor, this.overlay.color);
    gl.uniform1f(u.uOverlay, s.overlay);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, (old.uploaded && old.texture) || this.renderer.blank);
    gl.uniform1i(u.tex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, (next.uploaded && next.texture) || this.renderer.blank);
    gl.uniform1i(u.tex2, 1);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(p.uv);
    if (fromCard) gl.disableVertexAttribArray(p.start);
    gl.activeTexture(gl.TEXTURE0);
  }
}
