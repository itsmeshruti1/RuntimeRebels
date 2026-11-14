const VERTEX = `
attribute vec2 position;
varying vec2 vUv;

void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uTexture2;
uniform sampler2D uDisplacement;
uniform vec2 uRes;
uniform vec2 uAspect;
uniform vec2 uAspect2;
uniform float uZoom;
uniform float uZoom2;
uniform float uProgress;

uniform float uStrength;
uniform float uRgbShift;
uniform float uScale;

uniform vec3 uOverlayColor;
uniform float uOverlayOpacity;

uniform float uExtra;

varying vec2 vUv;

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

vec4 sampleRepeat(sampler2D tex, vec2 uv)
{
    return texture2D(tex, fract(uv));
}

void main()
{
    vec2 uv = vUv;
    vec3 outputColor;

    if (uProgress < 0.001) {
        vec2 fit = getFitUv(uv, uRes, uAspect, uZoom * (1.0 + uExtra));
        outputColor = texture2D(uTexture, fit).rgb;
    } else {
        float disp = texture2D(uDisplacement, uv).r;

        disp = mix(
            disp,
            disp * (sin(uv.y * 10.0 + uProgress * 6.28) * 0.5 + 0.5),
            0.3
        );

        vec2 uv0 = getFitUv(uv, uRes, uAspect, uZoom);
        vec2 uv1 = getFitUv(uv, uRes, uAspect2, uZoom2);

        float scaleEffect = 1.0 + uProgress * (1.0 - uProgress) * uScale;
        vec2 center = vec2(0.5);

        vec2 distortedUV0 =
            (uv0 - center) / scaleEffect +
            center +
            uProgress * disp * uStrength * vec2(1.0, 0.5);

        vec2 distortedUV1 =
            (uv1 - center) * scaleEffect +
            center -
            (1.0 - uProgress) * disp * uStrength * vec2(1.0, 0.5);

        float rgbOffset = uProgress * (1.0 - uProgress) * uRgbShift;

        vec3 tex0 = vec3(
            sampleRepeat(uTexture, distortedUV0 + vec2(rgbOffset, 0.0)).r,
            sampleRepeat(uTexture, distortedUV0).g,
            sampleRepeat(uTexture, distortedUV0 - vec2(rgbOffset, 0.0)).b
        );

        vec3 tex1 = vec3(
            sampleRepeat(uTexture2, distortedUV1 + vec2(rgbOffset, 0.0)).r,
            sampleRepeat(uTexture2, distortedUV1).g,
            sampleRepeat(uTexture2, distortedUV1 - vec2(rgbOffset, 0.0)).b
        );

        outputColor = mix(tex0, tex1, smoothstep(0.0, 1.0, uProgress));
    }

    outputColor = mix(outputColor, uOverlayColor, uOverlayOpacity);

    gl_FragColor = vec4(outputColor, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

export function createProgram(gl, vertex, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const { name } = gl.getActiveUniform(program, i);
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}

export class Renderer {
  constructor(canvas, { overlay }) {
    this.canvas = canvas;
    const options = { antialias: false, alpha: true, premultipliedAlpha: false };
    const gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
    if (!gl) throw new Error('WebGL is not supported');
    this.gl = gl;

    const { program, uniforms } = createProgram(gl, VERTEX, FRAGMENT);
    gl.useProgram(program);
    this.program = program;
    this.uniforms = uniforms;

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.quadPosition = gl.getAttribLocation(program, 'position');

    gl.clearColor(11 / 255, 11 / 255, 11 / 255, 1);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.blank = this.createTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));

    gl.uniform1i(this.uniforms.uTexture, 0);
    gl.uniform1i(this.uniforms.uTexture2, 1);
    gl.uniform1i(this.uniforms.uDisplacement, 2);
    gl.uniform3fv(this.uniforms.uOverlayColor, overlay.color);
    gl.uniform1f(this.uniforms.uOverlayOpacity, overlay.opacity);

    this.resize();
  }

  createTexture(wrap) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
    return texture;
  }

  setDisplacement(image) {
    const gl = this.gl;
    this.displacement = this.createTexture(gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  }

  upload(media) {
    const gl = this.gl;
    if (!media.texture) media.texture = this.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, media.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, media.el);
    media.uploaded = true;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setParams(p) {
    const gl = this.gl;
    const u = this.uniforms;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
    gl.useProgram(this.program);
    gl.uniform1f(u.uStrength, p.distortionStrength * motion);
    gl.uniform1f(u.uRgbShift, p.rgbShift * motion);
    gl.uniform1f(u.uScale, p.distortionScale * motion);
  }

  clear(transparent = false) {
    const gl = this.gl;
    if (transparent) gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (transparent) gl.clearColor(11 / 255, 11 / 255, 11 / 255, 1);
  }

  render({ from, to, progress, extra = 0 }) {
    const gl = this.gl;
    const u = this.uniforms;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.quadPosition);
    gl.vertexAttribPointer(this.quadPosition, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, (from.uploaded && from.texture) || this.blank);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, (to.uploaded && to.texture) || this.blank);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.displacement || this.blank);

    gl.uniform2f(u.uRes, this.width, this.height);
    gl.uniform2f(u.uAspect, from.width, from.height);
    gl.uniform2f(u.uAspect2, to.width, to.height);
    gl.uniform1f(u.uZoom, from.zoom);
    gl.uniform1f(u.uZoom2, to.zoom);
    gl.uniform1f(u.uProgress, progress);
    gl.uniform1f(u.uExtra, extra);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.activeTexture(gl.TEXTURE0);
  }
}
