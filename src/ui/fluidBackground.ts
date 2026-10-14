/**
 * 流動背景：用 WebGL 把專輯封面當成顏料，持續以多層雜訊扭曲取樣座標，
 * 讓顏色像液體一樣緩慢地拉伸、捲動、互相混合（不是單純旋轉）。
 *
 * - 以低解析度繪製（視窗的 1/6），再由 CSS 放大＋模糊，成本很低。
 * - 換歌時兩張封面在 shader 內交叉淡入。
 * - 分頁隱藏時暫停；prefers-reduced-motion 時只畫靜態的一張。
 * - 沒有 WebGL 時回傳 null，由呼叫端改用 CSS 圖層。
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMix;
uniform float uTime;
uniform vec2 uRes;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main() {
  vec2 p = vUv;
  p.x *= uRes.x / uRes.y;
  float t = uTime * 0.45; // 流動速度

  // 兩層 domain warping：q 扭曲 p，r 再扭曲一次，形成液體般的流線
  vec2 q = vec2(fbm(p * 1.4 + vec2(0.0, t * 0.07)),
                fbm(p * 1.4 + vec2(5.2, 1.3) - t * 0.06));
  vec2 r = vec2(fbm(p * 1.4 + 2.6 * q + vec2(1.7, 9.2) + t * 0.09),
                fbm(p * 1.4 + 2.6 * q + vec2(8.3, 2.8) - t * 0.08));

  // 放大取樣封面中段，再依扭曲量推動座標
  vec2 uv = vec2(0.5) + (vUv - 0.5) * 0.5 + (r - 0.5) * 0.6;
  vec3 a = texture2D(uA, uv).rgb;
  vec3 b = texture2D(uB, uv).rgb;
  vec3 c = mix(a, b, uMix);

  // 提高飽和度、壓暗，並用扭曲量做些許明暗起伏，讓流動更明顯
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.1);
  c *= 0.6 + 0.3 * smoothstep(0.15, 0.95, r.x);
  gl_FragColor = vec4(c, 1.0);
}`;

// 封面縮得很小：細節被合併成幾大塊主色，背景的顏色比較單純（2 的次方才能用 MIRRORED_REPEAT）
const TEX_SIZE = 8;
const SCALE = 1 / 6;
const FADE_MS = 1600;

export interface FluidBackground {
  setImage(url: string | null): void;
  destroy(): void;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('流動背景 shader 編譯失敗：', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function makeTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  // 預設深灰色，封面載入前也有東西可畫
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([42, 42, 53, 255]));
  return tex;
}

/** 把封面縮成 64×64 的方形畫布（順便讓取樣更柔和）。 */
function loadSquare(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = (): void => {
      const c = document.createElement('canvas');
      c.width = c.height = TEX_SIZE;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.drawImage(img, 0, 0, TEX_SIZE, TEX_SIZE);
      resolve(c);
    };
    img.onerror = (): void => reject(new Error('封面載入失敗'));
    img.src = url;
  });
}

export function createFluidBackground(canvas: HTMLCanvasElement): FluidBackground | null {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uA = gl.getUniformLocation(prog, 'uA');
  const uB = gl.getUniformLocation(prog, 'uB');
  const uMix = gl.getUniformLocation(prog, 'uMix');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uRes = gl.getUniformLocation(prog, 'uRes');

  // 兩張貼圖輪流：front 是目前顯示的，back 是淡入中的新封面
  const textures = [makeTexture(gl), makeTexture(gl)];
  if (!textures[0] || !textures[1]) return null;
  let front = 0;
  let fadeStart = -1;
  let lastUrl: string | null = null;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const t0 = performance.now();
  let raf = 0;
  let lastFrame = 0;

  const resize = (): void => {
    const w = Math.max(32, Math.round(window.innerWidth * SCALE));
    const h = Math.max(32, Math.round(window.innerHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };

  const draw = (now: number): void => {
    let mix = 0;
    if (fadeStart >= 0) {
      mix = Math.min(1, (now - fadeStart) / FADE_MS);
      mix = mix * mix * (3 - 2 * mix);
      if (mix >= 1) {
        front = 1 - front;
        fadeStart = -1;
        mix = 0;
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[front]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures[1 - front]);
    gl.uniform1i(uA, 0);
    gl.uniform1i(uB, 1);
    gl.uniform1f(uMix, mix);
    gl.uniform1f(uTime, reduced ? 0 : (now - t0) / 1000);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const loop = (now: number): void => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    // 30fps 就很順，省一半 GPU
    if (now - lastFrame < 33) return;
    lastFrame = now;
    draw(now);
  };

  resize();
  window.addEventListener('resize', resize);
  if (reduced) draw(performance.now());
  else raf = requestAnimationFrame(loop);

  return {
    setImage(url: string | null): void {
      if (url === lastUrl) return;
      lastUrl = url;
      if (url === null) return;
      loadSquare(url)
        .then((square) => {
          if (lastUrl !== url) return;
          const back = 1 - front;
          gl.bindTexture(gl.TEXTURE_2D, textures[back]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, square);
          fadeStart = performance.now();
          if (reduced) draw(fadeStart + FADE_MS);
        })
        .catch((e) => console.warn('流動背景：', e));
    },
    destroy(): void {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}
