const VERTEX = `
precision mediump float;

attribute vec2 uv;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform float u_progress;
uniform vec4 u_from;
uniform vec4 u_to;
uniform vec2 u_viewport;
uniform vec2 u_cam;

varying vec2 vUv;
varying vec2 vRes;
varying float vShape;
varying float vParab;

const float PI = 3.14159265;

void main() {
	vUv = uv;

	vec2 dir = vec2(
		(u_to.x + u_to.z * 0.5) - (u_from.x + u_from.z * 0.5),
		-((u_to.y + u_to.w * 0.5) - (u_from.y + u_from.w * 0.5))
	);

	float sx0 = step(0.0, dir.x);
	float sy0 = step(0.0, dir.y);
	float ax = mix(1.0 - uv.x, uv.x, sx0);
	float ay = mix(1.0 - uv.y, uv.y, sy0);
	float activation = 1.0 - sqrt(ax * ax * 0.6 + ay * ay * 0.4);

	vec2 uvScreen = vec2(uv.x, 1.0 - uv.y);
	vec2 fromPixel = u_from.xy + uvScreen * u_from.zw;
	vec2 toPixel = u_to.xy + uvScreen * u_to.zw;

	float lead = 1.0 - activation;
	float stagger = 0.225;

	float vertexProgress = clamp(u_progress / max(1.0 - lead * stagger, 0.001), 0.0, 1.0);
	vertexProgress = 1.0 - (1.0 - vertexProgress) * (1.0 - vertexProgress);

	vec2 pixel = mix(fromPixel, toPixel, vertexProgress);

	float parab = u_progress * (1.0 - u_progress) * 4.0;
	float dome = sin(uv.x * PI) * sin(uv.y * PI);
	float shape = dome * 0.5 + lead * 0.5;
	float lift = parab * shape * 8.0;

	vShape = shape;
	vParab = parab;

	vec3 worldPos = vec3(
		u_cam.x * (pixel.x / u_viewport.x - 0.5),
		u_cam.y * (0.5 - pixel.y / u_viewport.y),
		lift
	);

	gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);

	vRes = mix(u_from.zw, u_to.zw, vertexProgress);
}`;

const FRAGMENT = `
precision mediump float;

uniform vec2 u_size;
uniform sampler2D u_texture;
uniform float u_alpha;

varying vec2 vUv;
varying vec2 vRes;
varying float vShape;
varying float vParab;

vec2 uvCover(vec2 screenSize, vec2 imageSize, vec2 uv) {
	float screenRatio = screenSize.x / screenSize.y;
	float imageRatio = imageSize.x / imageSize.y;

	vec2 newSize = screenRatio < imageRatio
		? vec2(imageSize.x * (screenSize.y / imageSize.y), screenSize.y)
		: vec2(screenSize.x, imageSize.y * (screenSize.x / imageSize.x));
	vec2 newOffset = (screenRatio < imageRatio
		? vec2((newSize.x - screenSize.x) / 2.0, 0.0)
		: vec2(0.0, (newSize.y - screenSize.y) / 2.0)) / newSize;

	return uv * screenSize / newSize + newOffset;
}

void main() {
	vec2 uv = uvCover(vRes, u_size, vUv);
	vec4 tex = texture2D(u_texture, uv);

	vec3 col = tex.rgb;

	float shade = vParab * (vShape - 0.5) * 2.0;
	col *= 1.0 + shade * 0.22;

	gl_FragColor = vec4(col, tex.a * u_alpha);
}`;

const FOV = 45;
const NEAR = 0.1;
const FAR = 2000;
const CAMERA_Z = 50;
const SEGMENTS = { x: 32, y: 16 };

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function grid() {
  const cols = SEGMENTS.x + 1;
  const uvs = [];
  for (let iy = 0; iy <= SEGMENTS.y; iy++) {
    for (let ix = 0; ix <= SEGMENTS.x; ix++) uvs.push(ix / SEGMENTS.x, 1 - iy / SEGMENTS.y);
  }
  const index = [];
  for (let iy = 0; iy < SEGMENTS.y; iy++) {
    for (let ix = 0; ix < SEGMENTS.x; ix++) {
      const a = ix + cols * iy;
      const b = ix + cols * (iy + 1);
      const c = ix + 1 + cols * (iy + 1);
      const d = ix + 1 + cols * iy;
      index.push(a, b, d, b, c, d);
    }
  }
  return { uvs: new Float32Array(uvs), index: new Uint16Array(index) };
}

export class FlipRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL is not supported');
    this.gl = gl;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    this.program = program;
    gl.useProgram(program);
    this.u = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const { name } = gl.getActiveUniform(program, i);
      this.u[name] = gl.getUniformLocation(program, name);
    }

    const { uvs, index } = grid();
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    const uv = gl.getAttribLocation(program, 'uv');
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    this.count = index.length;

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.uniform1i(this.u.u_texture, 0);
    gl.uniform1f(this.u.u_alpha, 1);
    gl.uniformMatrix4fv(this.u.viewMatrix, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -CAMERA_Z, 1]));

    this.resize();
  }

  resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    const aspect = this.width / this.height;
    const f = 1 / Math.tan((FOV * Math.PI) / 360);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(
      this.u.projectionMatrix,
      false,
      new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (FAR + NEAR) / (NEAR - FAR), -1, 0, 0, (2 * FAR * NEAR) / (NEAR - FAR), 0]),
    );
    const camY = 2 * Math.tan((FOV * Math.PI) / 360) * CAMERA_Z;
    gl.uniform2f(this.u.u_cam, camY * aspect, camY);
    gl.uniform2f(this.u.u_viewport, this.width, this.height);
  }

  upload(media) {
    const gl = this.gl;
    if (!media.texture) {
      media.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, media.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, media.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media.el);
    media.uploaded = true;
  }

  clear() {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  render({ media, from, to, progress }) {
    const gl = this.gl;
    const u = this.u;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, media.texture);
    gl.uniform2f(u.u_size, media.width, media.height);
    gl.uniform4f(u.u_from, from.x, from.y, from.w, from.h);
    gl.uniform4f(u.u_to, to.x, to.y, to.w, to.h);
    gl.uniform1f(u.u_progress, progress);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  }
}
