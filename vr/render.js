/** WebGL2 rendering: planet, atmosphere, clouds, extruded entities. */

import { m4, m4ident, m4mul, m4trs, m3fromM4rot, clamp, lerp } from './math.js';
import { N, NF, NC, NV, VPF, warp, facePoint, dirToCell, DIR, NBR } from './sphere.js';
import { W } from './world.js';
import { ENT, MAX_ENT } from './agents.js';
import { showErr } from './math.js';

export let gl = null;
export let canvas = null;

const V_HEAD = '#version 300 es\nprecision highp float;\n';
const F_HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

function sh(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function prog(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const nm = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[nm] = gl.getUniformLocation(p, nm);
  }
  p.u = u;
  return p;
}
function upload(b, arr, usage) {
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, arr, usage || gl.STATIC_DRAW);
}

/* ---------- geometry lattice ---------- */
export const vDir = new Float32Array(NV * 3);
export const vCell = new Int32Array(NV);
export const vPos = new Float32Array(NV * 3);
export const vNrm = new Float32Array(NV * 3);
export const vDat = new Uint8Array(NV * 4);
export let vIdx;

(function buildLattice() {
  const p = [0, 0, 0];
  let k = 0;
  for (let f = 0; f < 6; f++) for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++, k++) {
    const s = i / N * 2 - 1, t = j / N * 2 - 1;
    facePoint(f, warp(s), warp(t), p);
    vDir[k * 3] = p[0]; vDir[k * 3 + 1] = p[1]; vDir[k * 3 + 2] = p[2];
    vCell[k] = dirToCell(p[0], p[1], p[2]);
  }
  const idx = new Uint32Array(6 * N * N * 6);
  let m = 0;
  for (let f = 0; f < 6; f++) {
    const o = f * VPF;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = o + j * (N + 1) + i, b = a + 1, c = a + (N + 1), d = c + 1;
      // CCW when viewed from outside — previous order showed the interior of the far side
      idx[m++] = a; idx[m++] = b; idx[m++] = c;
      idx[m++] = b; idx[m++] = d; idx[m++] = c;
    }
  }
  vIdx = idx;
})();

const weldGroups = (function () {
  const map = new Map(), out = [];
  for (let f = 0; f < 6; f++) for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    if (i !== 0 && i !== N && j !== 0 && j !== N) continue;
    const k = f * VPF + j * (N + 1) + i;
    const key = Math.round(vDir[k * 3] * 1e6) + ',' + Math.round(vDir[k * 3 + 1] * 1e6) + ',' + Math.round(vDir[k * 3 + 2] * 1e6);
    let a = map.get(key);
    if (!a) { a = []; map.set(key, a); }
    a.push(k);
  }
  for (const a of map.values()) if (a.length > 1) out.push(a);
  return out;
})();

/* ---------- sprites / atlas ---------- */
const SPRITES = [
  [['M28 64 L28 38 L36 38 L36 64 Z', '#6b4a2f'], ['M32 6 C13 6 6 21 6 30 C6 41 17 48 32 48 C47 48 58 41 58 30 C58 21 51 6 32 6 Z', '#3f9450'], ['M32 10 C20 10 14 20 14 27 C14 34 21 39 32 39 Z', '#4fae5f']],
  [['M29 64 L29 50 L35 50 L35 64 Z', '#5a3f28'], ['M32 30 L57 58 L7 58 Z', '#2f7046'], ['M32 16 L52 44 L12 44 Z', '#387f52'], ['M32 3 L47 30 L17 30 Z', '#2f7046']],
  [['M30 64 L21 33 L26 34 L33 64 Z', '#7fa04a'], ['M33 64 L44 36 L47 40 L37 64 Z', '#8fb055'], ['M32 64 L31 26 L35 28 L36 64 Z', '#9cbe61']],
  [['M25 64 L25 20 C25 13 39 13 39 20 L39 64 Z', '#3f8452'], ['M25 42 L13 42 C8 42 8 33 13 33 L25 33 Z', '#3f8452'], ['M39 36 L50 36 C55 36 55 27 50 27 L39 27 Z', '#3f8452']],
  [['M5 64 L13 38 L28 29 L47 36 L59 64 Z', '#7d7d87'], ['M13 38 L28 29 L34 47 Z', '#9a9aa6']],
  [['M13 64 L13 41 L51 41 L51 64 Z', '#bd9463'], ['M4 44 L32 17 L60 44 Z', '#8c5b3d'], ['M27 64 L27 50 L37 50 L37 64 Z', '#5d4530']],
  [['M32 2 L46 64 L18 64 Z', '#a9dcef'], ['M32 2 L39 64 L32 64 Z', '#e2f5fd']],
  [['M2 64 C2 36 18 22 32 22 C47 22 62 36 62 64 L47 64 C47 44 40 36 32 36 C22 36 17 44 17 64 Z', '#c4884f'], ['M17 64 C17 46 22 38 32 38 L32 22 C18 22 2 36 2 64 Z', '#a86e3c']],
  [['M12 64 C4 44 17 27 33 30 C51 33 58 49 54 64 Z', '#d9b276'], ['M24 64 C20 51 28 42 38 45 C47 48 49 56 47 64 Z', '#eccb97']],
  [['M6 64 C6 53 18 48 27 53 C34 42 52 46 52 57 L55 64 Z', '#8c6fae'], ['M20 64 C20 57 28 54 33 58 L36 64 Z', '#a98ac9']],
  [['M2 64 C10 49 24 44 32 44 C43 44 55 49 62 64 Z', '#8a8a94'], ['M18 64 C23 55 41 55 46 64 Z', '#6b6b76']],
  [['M25 64 L25 5 L39 5 L39 64 Z', '#23232b'], ['M25 5 L39 5 L39 13 L25 13 Z', '#6ee0ff']],
  /* 12 black daisy */ [['M32 32 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0', '#1a1a22'], ['M32 32 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0', '#3a3a48']],
  /* 13 white daisy */ [['M32 32 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0', '#f2f4f8'], ['M32 32 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0', '#e8c84a']],
  /* 14 reef */ [['M10 64 L18 40 L28 55 L38 32 L48 58 L54 44 L58 64 Z', '#2a8a8a'], ['M22 64 L30 48 L40 64 Z', '#3cb0a0']],
  /* 15 fish */ [['M8 40 L32 22 L56 40 L32 52 Z', '#4a8ab8'], ['M56 40 L62 36 L62 44 Z', '#4a8ab8']],
];
const ATLAS_COLS = 4, TILE = 128;

function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS_COLS * TILE;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  SPRITES.forEach((sp, n) => {
    const tx = (n % ATLAS_COLS) * TILE, ty = Math.floor(n / ATLAS_COLS) * TILE;
    g.save();
    g.translate(tx, ty);
    g.scale(TILE / 64, TILE / 64);
    for (const [d, fill] of sp) { g.fillStyle = fill; g.fill(new Path2D(d)); }
    g.restore();
  });
  return cv;
}

/* ---------- programs / buffers ---------- */
let planetProg, atmoProg, cloudProg, entProg, starProg, flatProg, healthProg;
let buf, atlasTex, SPH_COUNT = 0, GRID_COUNT = 0, CELL_GRID_COUNT = 0, NSTAR = 1400;
const MVP = m4(), MODEL = m4(), NRM = new Float32Array(9), TMP = m4();
let _cellGrid = null;
let _localRim = null;
let LOCAL_RIM_COUNT = 0;
let _localSet = null;
let _localFocus = -1;
let _localWash = false;
let _localRimOn = false;
let _localKey = '';

export function initGL(cvs) {
  canvas = cvs;
  gl = canvas.getContext('webgl2', { xrCompatible: true, antialias: true, alpha: false, depth: true });
  if (!gl) { showErr('WebGL2 is not available.'); throw new Error('no webgl2'); }

  planetProg = prog(V_HEAD + `
in vec3 aPos; in vec3 aNrm; in vec4 aDat;
uniform mat4 uMVP, uModel; uniform mat3 uNrmMat;
out vec3 vN; out vec4 vD; out vec3 vW;
void main(){
  vN = normalize(uNrmMat*aNrm);
  vD = aDat; vW = (uModel*vec4(aPos,1.0)).xyz;
  gl_Position = uMVP*vec4(aPos,1.0);
}`, F_HEAD + `
in vec3 vN; in vec4 vD; in vec3 vW;
uniform vec3 uSun, uCam, uAtmo; uniform float uDetail, uAtmoK, uNight, uDaisy, uOpacity, uXRay;
out vec4 o;
vec3 climate(float t){
  vec3 a=vec3(0.15,0.22,0.55), b=vec3(0.2,0.55,0.72), c=vec3(0.28,0.62,0.38);
  vec3 d=vec3(0.82,0.72,0.32), e=vec3(0.75,0.35,0.22);
  if(t<0.25) return mix(a,b,t/0.25);
  if(t<0.50) return mix(b,c,(t-0.25)/0.25);
  if(t<0.75) return mix(c,d,(t-0.50)/0.25);
  return mix(d,e,clamp((t-0.75)/0.25,0.0,1.0));
}
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(uCam-vW);
  // X-ray cutaway: discard front-facing fragments so interior shows through
  float facing = max(dot(N, V), 0.0);
  if(uXRay > 0.01 && facing > (1.0 - uXRay)) discard;
  vec3 biome=vD.rgb;
  float greenDom = biome.g - max(biome.r, biome.b);
  float lifeGreen = smoothstep(0.08, 0.35, greenDom) * smoothstep(0.35, 0.7, biome.g) * (1.0 - uDaisy);
  float lum = (biome.r+biome.g+biome.b)/3.0;
  float daisyBW = max(smoothstep(0.72, 0.9, lum), smoothstep(0.32, 0.12, lum));
  float lifeShow = max(lifeGreen, daisyBW * uDaisy + daisyBW * (1.0 - uDaisy) * 0.5);
  // Daisyworld: always prefer raw albedo over climate bands
  float show = max(uDetail, max(lifeShow, uDaisy * 0.92));
  vec3 base=mix(climate(vD.a), biome, show);
  float nl=max(dot(N,uSun),0.0);
  float wrap=max(dot(N,uSun)*0.5+0.5,0.0);
  // Higher night-side ambient so the globe reads solid against space
  float ambient = 0.18 + 0.12*wrap*wrap;
  vec3 col = base*(ambient + nl*0.92);
  col += vec3(0.015,0.025,0.055)*(1.0-nl);
  col += vec3(0.12,0.55,0.08)*lifeGreen*(0.45+0.55*nl);
  col = mix(col, biome * (0.55 + 0.7*nl), lifeGreen * 0.55);
  col = mix(col, biome * (0.25 + 1.05*nl), daisyBW * max(uDaisy, 0.35));
  col += vec3(1.0,0.85,0.55)*uNight*pow(1.0-nl,3.0)*vD.b*0.15*(1.0-uDaisy);
  float rim=pow(1.0-max(dot(N,V),0.0),3.0);
  vec3 ray = uAtmo * rim * uAtmoK * (0.2+0.8*nl);
  vec3 mie = vec3(1.0,0.85,0.6) * pow(max(dot(V,-uSun),0.0),8.0) * rim * 0.25 * uAtmoK;
  col += ray + mie;
  col = col/(1.0+max(vec3(0.0),col-0.82)*0.9);
  o=vec4(col, uOpacity);
}`);

  atmoProg = prog(V_HEAD + `
in vec3 aPos; uniform mat4 uMVP, uModel; uniform mat3 uNrmMat;
out vec3 vN; out vec3 vW;
void main(){ vN=normalize(uNrmMat*aPos); vW=(uModel*vec4(aPos,1.0)).xyz; gl_Position=uMVP*vec4(aPos,1.0); }
`, F_HEAD + `
in vec3 vN; in vec3 vW;
uniform vec3 uSun, uCam, uAtmo; uniform float uAtmoK;
out vec4 o;
void main(){
  vec3 N=normalize(vN), V=normalize(uCam-vW);
  float f=pow(1.0-abs(dot(N,V)),3.2);
  // Dimmer on night side so the rim doesn't read as a hollow soap-bubble
  float lit=clamp(dot(N,uSun)*0.6+0.4,0.0,1.0);
  float mie=pow(max(dot(V,-uSun),0.0),6.0);
  vec3 col=uAtmo*f*lit*uAtmoK*0.85 + vec3(1.0,0.7,0.4)*mie*f*0.35*uAtmoK;
  o=vec4(col,1.0);
}`);

  cloudProg = prog(V_HEAD + `
in vec3 aPos; in float aCov;
uniform mat4 uMVP, uModel;
out float vC; out vec3 vN; out vec3 vW;
void main(){
  vec3 p=normalize(aPos)*(1.0+0.02*aCov);
  vN=normalize(aPos); vW=(uModel*vec4(p,1.0)).xyz; vC=aCov;
  gl_Position=uMVP*vec4(p,1.0);
}`, F_HEAD + `
in float vC; in vec3 vN; in vec3 vW;
uniform vec3 uSun, uCam;
out vec4 o;
void main(){
  if(vC<0.08) discard;
  float nl=max(dot(normalize(vN),uSun),0.0);
  float a=smoothstep(0.08,0.55,vC)*0.72;
  vec3 col=mix(vec3(0.75,0.78,0.85), vec3(1.0), nl);
  o=vec4(col,a);
}`);

  // Extruded vector entities: two quads (front+back) with thickness along normal
  entProg = prog(V_HEAD + `
in vec3 aCorner; in vec3 iPos; in float iScale; in float iTile; in vec3 iTint;
uniform mat4 uMVP; uniform vec3 uCamLocal; uniform float uCols; uniform float uXRay;
out vec2 vUV; out vec3 vTint; out vec3 vUp; out float vHide;
void main(){
  vec3 up=normalize(iPos);
  vec3 toCam=normalize(uCamLocal-iPos);
  // Hide far-side sprites — they must not show through the globe
  float hemi=dot(up, normalize(uCamLocal));
  vHide = hemi < 0.02 ? 1.0 : 0.0;
  // Match planet X-ray cutaway (N·V) so trees don't float in the hole
  float facing=max(dot(up, toCam), 0.0);
  if(uXRay > 0.01 && facing > (1.0 - uXRay)) vHide = 1.0;
  // Blend toward camera-facing when looking nearly along radial (nadir fix)
  float along=abs(dot(up,toCam));
  vec3 faceDir=mix(toCam, up*0.001+toCam, smoothstep(0.85,0.98,along));
  faceDir=normalize(faceDir);
  vec3 r=cross(up,faceDir);
  if(dot(r,r)<1e-7) r=cross(up,vec3(0.0,0.0,1.0));
  r=normalize(r);
  vec3 f=cross(r,up);
  // aCorner: x=side, y=up, z=extrusion (-0.5..0.5)
  float thick=iScale*0.18;
  vec3 p=iPos + r*aCorner.x*iScale + up*aCorner.y*iScale + f*aCorner.z*thick;
  gl_Position=uMVP*vec4(p,1.0);
  float tx=mod(iTile,uCols), ty=floor(iTile/uCols);
  vUV=(vec2(aCorner.x+0.5, 1.0-aCorner.y)+vec2(tx,ty))/uCols;
  vTint=iTint; vUp=up;
}`, F_HEAD + `
in vec2 vUV; in vec3 vTint; in vec3 vUp; in float vHide;
uniform sampler2D uTex; uniform vec3 uSun; uniform float uFade;
out vec4 o;
void main(){
  if(vHide > 0.5) discard;
  vec4 t=texture(uTex,vUV);
  if(t.a<0.45 || uFade<0.01) discard;
  float lit=0.42+0.58*clamp(dot(normalize(vUp),uSun)*0.5+0.5,0.0,1.0);
  o=vec4(t.rgb*vTint*lit, t.a*uFade);
}`);

  starProg = prog(V_HEAD + `
in vec3 aPos; in float aMag; uniform mat4 uVP; out float vM;
void main(){ gl_Position=uVP*vec4(aPos,1.0); gl_PointSize=aMag*2.6; vM=aMag; }
`, F_HEAD + `
in float vM; out vec4 o;
void main(){ vec2 d=gl_PointCoord-0.5; float a=smoothstep(0.5,0.05,length(d)); o=vec4(vec3(0.78,0.84,1.0)*vM*a,a); }`);

  flatProg = prog(V_HEAD + `
in vec3 aPos; uniform mat4 uMVP; void main(){ gl_Position=uMVP*vec4(aPos,1.0); }
`, F_HEAD + `
uniform vec4 uCol; out vec4 o; void main(){ o=uCol; }`);

  healthProg = prog(V_HEAD + `
in vec3 aPos; uniform mat4 uMVP; uniform float uScale;
void main(){ gl_Position=uMVP*vec4(aPos*uScale,1.0); }
`, F_HEAD + `
uniform vec3 uCol; out vec4 o; void main(){ o=vec4(uCol,0.85); }`);

  buf = {
    pos: gl.createBuffer(), nrm: gl.createBuffer(), dat: gl.createBuffer(), idx: gl.createBuffer(),
    inst: gl.createBuffer(), quad: gl.createBuffer(),
    star: gl.createBuffer(), starMag: gl.createBuffer(),
    sph: gl.createBuffer(), sphIdx: gl.createBuffer(), grid: gl.createBuffer(),
    cellGrid: gl.createBuffer(),
    localRim: gl.createBuffer(),
    cloud: gl.createBuffer(), cloudCov: gl.createBuffer(),
  };
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, vIdx, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.dat);
  gl.bufferData(gl.ARRAY_BUFFER, vDat.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.inst);
  gl.bufferData(gl.ARRAY_BUFFER, ENT.data.byteLength, gl.DYNAMIC_DRAW);

  // Extruded quad: 2 slabs × 2 tris — corners as vec3
  const corners = [];
  const zvals = [-0.5, 0.5];
  for (const z of zvals) {
    corners.push(-0.5, 0, z, 0.5, 0, z, -0.5, 1, z);
    corners.push(0.5, 0, z, 0.5, 1, z, -0.5, 1, z);
  }
  upload(buf.quad, new Float32Array(corners));

  // sphere shell
  (function () {
    const M = 16, vp = [], ix = [], p = [0, 0, 0];
    for (let f = 0; f < 6; f++) for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) {
      facePoint(f, warp(i / M * 2 - 1), warp(j / M * 2 - 1), p);
      vp.push(p[0], p[1], p[2]);
    }
    const per = (M + 1) * (M + 1);
    for (let f = 0; f < 6; f++) {
      const o = f * per;
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        const a = o + j * (M + 1) + i, b = a + 1, c = a + (M + 1), d = c + 1;
        ix.push(a, c, b, b, c, d);
      }
    }
    upload(buf.sph, new Float32Array(vp));
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(ix), gl.STATIC_DRAW);
    SPH_COUNT = ix.length;
    // cloud mesh uses same positions; coverage per vertex from nearest cell
    const cov = new Float32Array(vp.length / 3);
    upload(buf.cloud, new Float32Array(vp));
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.cloudCov);
    gl.bufferData(gl.ARRAY_BUFFER, cov.byteLength, gl.DYNAMIC_DRAW);
    buf._cloudCov = cov;
    buf._cloudPos = new Float32Array(vp);
  })();

  (function () {
    const sp = new Float32Array(NSTAR * 3), mg = new Float32Array(NSTAR);
    for (let i = 0; i < NSTAR; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sp[i * 3] = r * Math.cos(th) * 260; sp[i * 3 + 1] = u * 260; sp[i * 3 + 2] = r * Math.sin(th) * 260;
      mg[i] = 0.25 + Math.pow(Math.random(), 2.6) * 0.95;
    }
    upload(buf.star, sp); upload(buf.starMag, mg);
  })();

  (function () {
    const v = [], R = 4.0, S = 0.25;
    for (let x = -R; x <= R + 1e-6; x += S) { v.push(x, 0, -R, x, 0, R); v.push(-R, 0, x, R, 0, x); }
    upload(buf.grid, new Float32Array(v)); GRID_COUNT = v.length / 3;
  })();

  atlasTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildAtlas());
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  rebuildGeometry();
  return gl;
}

export function rebuildGeometry() {
  const sea = W.seaLevel, relief = W.rule.relief;
  for (let k = 0; k < NV; k++) {
    const c = vCell[k];
    const e = Math.max(W.h[c], sea);
    const build = W.build?.[c] || 0;
    // Settlements extrude as blocky towers above the terrain
    const r = 1 + (e - sea) * relief + build * 0.14;
    vPos[k * 3] = vDir[k * 3] * r;
    vPos[k * 3 + 1] = vDir[k * 3 + 1] * r;
    vPos[k * 3 + 2] = vDir[k * 3 + 2] * r;
  }
  vNrm.fill(0);
  for (let t = 0; t < vIdx.length; t += 3) {
    const a = vIdx[t] * 3, b = vIdx[t + 1] * 3, c = vIdx[t + 2] * 3;
    const ux = vPos[b] - vPos[a], uy = vPos[b + 1] - vPos[a + 1], uz = vPos[b + 2] - vPos[a + 2];
    const wx = vPos[c] - vPos[a], wy = vPos[c + 1] - vPos[a + 1], wz = vPos[c + 2] - vPos[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    vNrm[a] += nx; vNrm[a + 1] += ny; vNrm[a + 2] += nz;
    vNrm[b] += nx; vNrm[b + 1] += ny; vNrm[b + 2] += nz;
    vNrm[c] += nx; vNrm[c + 1] += ny; vNrm[c + 2] += nz;
  }
  for (const g of weldGroups) {
    let nx = 0, ny = 0, nz = 0;
    for (const k of g) { nx += vNrm[k * 3]; ny += vNrm[k * 3 + 1]; nz += vNrm[k * 3 + 2]; }
    for (const k of g) { vNrm[k * 3] = nx; vNrm[k * 3 + 1] = ny; vNrm[k * 3 + 2] = nz; }
  }
  for (let k = 0; k < NV; k++) {
    const o = k * 3, l = Math.hypot(vNrm[o], vNrm[o + 1], vNrm[o + 2]) || 1;
    vNrm[o] /= l; vNrm[o + 1] /= l; vNrm[o + 2] /= l;
  }
  if (gl) { upload(buf.pos, vPos); upload(buf.nrm, vNrm); }
  uploadCellGrid();
  refreshColours(1);
}

/** Cell-edge wireframe following terrain relief — for View → Grid. */
function uploadCellGrid() {
  // 6 faces × (N rows of N segs horiz + N cols of N segs vert) × 2 verts × 3 floats
  const segs = 6 * (N * (N + 1) + N * (N + 1));
  if (!_cellGrid || _cellGrid.length < segs * 6) _cellGrid = new Float32Array(segs * 6);
  const out = _cellGrid;
  let m = 0;
  const lift = 1.003; // sit slightly above the surface to avoid z-fighting
  for (let f = 0; f < 6; f++) {
    const o = f * VPF;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i < N; i++) {
        const a = (o + j * (N + 1) + i) * 3, b = a + 3;
        out[m++] = vPos[a] * lift; out[m++] = vPos[a + 1] * lift; out[m++] = vPos[a + 2] * lift;
        out[m++] = vPos[b] * lift; out[m++] = vPos[b + 1] * lift; out[m++] = vPos[b + 2] * lift;
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i <= N; i++) {
        const a = (o + j * (N + 1) + i) * 3, c = a + (N + 1) * 3;
        out[m++] = vPos[a] * lift; out[m++] = vPos[a + 1] * lift; out[m++] = vPos[a + 2] * lift;
        out[m++] = vPos[c] * lift; out[m++] = vPos[c + 1] * lift; out[m++] = vPos[c + 2] * lift;
      }
    }
  }
  CELL_GRID_COUNT = m / 3;
  if (gl) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.cellGrid);
    gl.bufferData(gl.ARRAY_BUFFER, out.subarray(0, m), gl.DYNAMIC_DRAW);
  }
}

function cellSurfPos(c, lift = 1.005) {
  const buildLift = (W.build[c] || 0) * 0.12;
  const rr = (1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * W.rule.relief + buildLift) * lift;
  return [DIR[c * 3] * rr, DIR[c * 3 + 1] * rr, DIR[c * 3 + 2] * rr];
}

/**
 * Sync local-window highlight on the globe.
 * mode: 'off' | 'rim' | 'wash' | 'both'
 * patch: { focus, cells, side, radius, cellSet } from unwrapPatch / drawLocalView
 */
export function updateLocalHighlight(patch, mode = 'off') {
  const wantWash = mode === 'wash' || mode === 'both';
  const wantRim = mode === 'rim' || mode === 'both';
  _localWash = wantWash;
  _localRimOn = wantRim;
  _localSet = wantWash || wantRim ? (patch?.cellSet || null) : null;
  _localFocus = patch?.focus ?? -1;

  if (!wantRim || !patch?.cells) {
    LOCAL_RIM_COUNT = 0;
    _localKey = '';
    return;
  }

  const key = `${patch.focus}:${patch.radius}:${mode}`;
  // Rebuild rim whenever focus/radius changes (relief drifts slowly — rebuild each call is fine for ~100 segs)
  const { cells, side, radius, focus } = patch;
  const maxSegs = side * 4 + 8; // perimeter + focus cross
  if (!_localRim || _localRim.length < maxSegs * 6) _localRim = new Float32Array(maxSegs * 6);
  const out = _localRim;
  let m = 0;
  const emit = (a, b) => {
    out[m++] = a[0]; out[m++] = a[1]; out[m++] = a[2];
    out[m++] = b[0]; out[m++] = b[1]; out[m++] = b[2];
  };

  // Square perimeter in unwrap space (outer ring of cells)
  const ring = [];
  for (let i = 0; i < side; i++) ring.push(cells[0 * side + i]);
  for (let j = 1; j < side; j++) ring.push(cells[j * side + (side - 1)]);
  for (let i = side - 2; i >= 0; i--) ring.push(cells[(side - 1) * side + i]);
  for (let j = side - 2; j >= 1; j--) ring.push(cells[j * side + 0]);
  const pts = ring.filter((c) => c >= 0).map((c) => cellSurfPos(c));
  for (let i = 0; i < pts.length; i++) {
    emit(pts[i], pts[(i + 1) % pts.length]);
  }

  // Focus crosshair on globe
  if (focus >= 0) {
    const f = cellSurfPos(focus, 1.008);
    const arms = [];
    for (let k = 0; k < 4; k++) {
      const n = NBR[focus * 4 + k];
      if (n >= 0) arms.push(cellSurfPos(n, 1.008));
    }
    for (const a of arms) emit(f, a);
  }

  LOCAL_RIM_COUNT = m / 3;
  _localKey = key;
  if (gl && buf?.localRim) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.localRim);
    gl.bufferData(gl.ARRAY_BUFFER, out.subarray(0, m), gl.DYNAMIC_DRAW);
  }
}

export function refreshColours(alpha = 1) {
  const R = W.rule;
  const sea = W.seaLevel;
  for (let k = 0; k < NV; k++) {
    const c = vCell[k];
    const temp = lerp(W.prevTemp[c], W.temp[c], alpha);
    const life = lerp(W.prevLife[c], W.life[c], alpha);
    const ice = lerp(W.prevIce[c], W.ice[c], alpha);
    let col;
    if (W.h[c] < sea) {
      const d = clamp((sea - W.h[c]) * 1.9, 0, 1);
      // depth-based water shading — floor bright enough to read on night side
      const deep = [
        lerp(48, 22, d),
        lerp(100, 45, d),
        lerp(155, 75, d),
      ];
      const base = R.ocean(1 - d);
      col = ice > 0.5 ? [222, 234, 246] : [
        lerp(base[0], deep[0], 0.5),
        lerp(base[1], deep[1], 0.5),
        lerp(base[2], deep[2], 0.5),
      ];
      // Phytoplankton / reef blooms — turquoise patches readable from orbit
      const bloom = Math.max(life * (W.h[c] < sea && (sea - W.h[c]) < 0.14 ? 1 : 0.35), W.reef[c]);
      if (bloom > 0.12) {
        const k = clamp((bloom - 0.12) / 0.7, 0, 1);
        col = [
          lerp(col[0], 20, k * 0.85),
          lerp(col[1], 210, k * 0.9),
          lerp(col[2], 160, k * 0.75),
        ];
      }
    } else {
      const e = (W.h[c] - sea) / (1 - sea + 1e-6);
      const extra = R.daisyworld ? { black: W.blackDaisy[c], white: W.whiteDaisy[c] } : null;
      col = R.land(temp, W.moist[c], life, e, ice, extra);
      // Force neon life through any ruleset wash — orbit-readable blooms
      if (!R.daisyworld && life > 0.06 && ice < 0.7) {
        const k = clamp((life - 0.06) / 0.55, 0, 1);
        const neon = [lerp(22, 4, k), lerp(255, 150, k), lerp(12, 42, k)];
        const mix = clamp(0.55 + k * 0.45, 0, 1) * (1 - clamp((ice - 0.35) / 0.5, 0, 1) * 0.6);
        col = [lerp(col[0], neon[0], mix), lerp(col[1], neon[1], mix), lerp(col[2], neon[2], mix)];
      }
      // Settlements — stone / timber blocks punch through green
      const build = W.build?.[c] || 0;
      if (!R.daisyworld && build > 0.12) {
        const k = clamp((build - 0.12) / 0.7, 0, 1);
        const stone = [
          lerp(168, 92, k),
          lerp(148, 88, k),
          lerp(120, 78, k),
        ];
        col = [
          lerp(col[0], stone[0], 0.55 + k * 0.4),
          lerp(col[1], stone[1], 0.55 + k * 0.4),
          lerp(col[2], stone[2], 0.55 + k * 0.4),
        ];
      }
      // snowball / greenhouse tints (keep living cells greener)
      if (W.state === 'snowball' && life < 0.2) col = [lerp(col[0], 230, 0.5), lerp(col[1], 235, 0.5), lerp(col[2], 245, 0.5)];
      if (W.state === 'moist-greenhouse' && life < 0.2) col = [lerp(col[0], 200, 0.3), lerp(col[1], 100, 0.3), lerp(col[2], 60, 0.3)];
    }
    // Dust veil
    if (W.dust[c] > 0.1) {
      const d = W.dust[c];
      col = [lerp(col[0], 180, d), lerp(col[1], 140, d), lerp(col[2], 90, d)];
    }
    // Local patch wash — amber window matching the flat view
    if (_localWash && _localSet && _localSet.has(c)) {
      const k = c === _localFocus ? 0.55 : 0.28;
      col = [
        lerp(col[0], 255, k),
        lerp(col[1], 210, k * 0.75),
        lerp(col[2], 90, k * 0.4),
      ];
    }
    const o = k * 4;
    vDat[o] = col[0] | 0; vDat[o + 1] = col[1] | 0; vDat[o + 2] = col[2] | 0;
    vDat[o + 3] = clamp(temp, 0, 1) * 255 | 0;
  }
  if (gl) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.dat);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vDat);
  }
  // cloud coverage upload
  if (buf._cloudCov) {
    const pos = buf._cloudPos;
    for (let i = 0; i < buf._cloudCov.length; i++) {
      const c = dirToCell(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      buf._cloudCov[i] = W.clouds[c];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.cloudCov);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf._cloudCov);
  }
}

export function uploadEntities() {
  if (!gl) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.inst);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, ENT.data.subarray(0, ENT.n * 8));
}

function disableAll() { for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i); }

function bindPlanetAttribs(p) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.pos);
  const a0 = gl.getAttribLocation(p, 'aPos');
  gl.enableVertexAttribArray(a0); gl.vertexAttribPointer(a0, 3, gl.FLOAT, false, 0, 0);
  const a1 = gl.getAttribLocation(p, 'aNrm');
  if (a1 >= 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.nrm);
    gl.enableVertexAttribArray(a1); gl.vertexAttribPointer(a1, 3, gl.FLOAT, false, 0, 0);
  }
  const a2 = gl.getAttribLocation(p, 'aDat');
  if (a2 >= 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.dat);
    gl.enableVertexAttribArray(a2); gl.vertexAttribPointer(a2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
  }
}

export function drawScene(proj, view, camPos, inXR, S, hands) {
  const R = W.rule;
  const sun = [Math.cos(S.sunAng), 0.34 + Math.sin(W.season || 0) * W.obliquity * 0.5, Math.sin(S.sunAng)];
  const sl = Math.hypot(...sun); sun[0] /= sl; sun[1] /= sl; sun[2] /= sl;

  const scale = inXR ? S.scaleXR : 1;
  const px = inXR ? S.posXR[0] : 0, py = inXR ? S.posXR[1] : 0, pz = inXR ? S.posXR[2] : 0;
  m4trs(MODEL, S.q, px, py, pz, scale);
  m3fromM4rot(NRM, MODEL, 1 / scale);
  m4mul(TMP, view, MODEL); m4mul(MVP, proj, TMP);

  const dx = camPos[0] - px, dy = camPos[1] - py, dz = camPos[2] - pz;
  const qc = S.q, ix = -qc[0], iy = -qc[1], iz = -qc[2], iw = qc[3];
  const rot = (vx, vy, vz) => {
    const tx = 2 * (iy * vz - iz * vy), ty = 2 * (iz * vx - ix * vz), tz = 2 * (ix * vy - iy * vx);
    return [vx + iw * tx + (iy * tz - iz * ty), vy + iw * ty + (iz * tx - ix * tz), vz + iw * tz + (ix * ty - iy * tx)];
  };
  const camLocal = rot(dx / scale, dy / scale, dz / scale);

  /* stars */
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.useProgram(starProg);
  m4mul(TMP, proj, view); gl.uniformMatrix4fv(starProg.u.uVP, false, TMP);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.star);
  let l = gl.getAttribLocation(starProg, 'aPos');
  gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.starMag);
  l = gl.getAttribLocation(starProg, 'aMag');
  gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 1, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.drawArrays(gl.POINTS, 0, NSTAR);
  disableAll();
  gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);

  if (inXR) {
    gl.useProgram(flatProg);
    m4ident(TMP); gl.uniformMatrix4fv(flatProg.u.uMVP, false, m4mul(m4(), proj, view));
    gl.uniform4f(flatProg.u.uCol, 0.28, 0.36, 0.55, 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.grid);
    l = gl.getAttribLocation(flatProg, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.LINES, 0, GRID_COUNT);
    gl.disable(gl.BLEND); disableAll();
  }

  /* interior core + mantle — only when X-ray cutaway is active */
  const xray = S.xray || 0;
  const opacity = S.opacity != null ? S.opacity : 1;
  if (xray > 0.01) {
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.sph);
    l = gl.getAttribLocation(healthProg, 'aPos');
    // Mantle shell
    m4trs(TMP, S.q, px, py, pz, scale * 0.72);
    gl.useProgram(healthProg);
    gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
    gl.uniform1f(healthProg.u.uScale, 1);
    gl.uniform3fv(healthProg.u.uCol, [0.55, 0.22, 0.08]);
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
    gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    // Inner core
    m4trs(TMP, S.q, px, py, pz, scale * 0.32);
    gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
    gl.uniform3fv(healthProg.u.uCol, [0.95, 0.45, 0.12]);
    gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    disableAll();
  }

  /* planet */
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  gl.useProgram(planetProg);
  bindPlanetAttribs(planetProg);
  gl.uniformMatrix4fv(planetProg.u.uMVP, false, MVP);
  gl.uniformMatrix4fv(planetProg.u.uModel, false, MODEL);
  gl.uniformMatrix3fv(planetProg.u.uNrmMat, false, NRM);
  gl.uniform3fv(planetProg.u.uSun, sun);
  gl.uniform3fv(planetProg.u.uCam, camPos);
  gl.uniform3fv(planetProg.u.uAtmo, R.atmo);
  gl.uniform1f(planetProg.u.uAtmoK, R.atmoStrength * (1 + (W.gases.dust || 0)));
  gl.uniform1f(planetProg.u.uDetail, S.detail);
  gl.uniform1f(planetProg.u.uNight, W.meanLife > 0.25 ? W.meanLife : 0);
  gl.uniform1f(planetProg.u.uDaisy, R.daisyworld ? 1 : 0);
  gl.uniform1f(planetProg.u.uOpacity, opacity);
  gl.uniform1f(planetProg.u.uXRay, xray);
  // Only alpha-blend when surface is intentionally translucent — X-ray uses discard, not blend
  const translucent = opacity < 0.999;
  if (translucent) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idx);
  gl.drawElements(gl.TRIANGLES, vIdx.length, gl.UNSIGNED_INT, 0);
  if (translucent) {
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  disableAll();

  /* cell grid overlay */
  const gridAmt = S.grid || 0;
  if (gridAmt > 0.01 && CELL_GRID_COUNT > 0) {
    gl.useProgram(flatProg);
    gl.uniformMatrix4fv(flatProg.u.uMVP, false, MVP);
    const a = 0.15 + gridAmt * 0.75;
    gl.uniform4f(flatProg.u.uCol, 0.55, 0.78, 1.0, a);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.cellGrid);
    l = gl.getAttribLocation(flatProg, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.LINES, 0, CELL_GRID_COUNT);
    gl.depthMask(true); gl.disable(gl.BLEND);
    disableAll();
  }

  /* local patch rim on globe */
  if (_localRimOn && LOCAL_RIM_COUNT > 0) {
    gl.useProgram(flatProg);
    gl.uniformMatrix4fv(flatProg.u.uMVP, false, MVP);
    gl.uniform4f(flatProg.u.uCol, 1.0, 0.82, 0.35, 0.92);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.localRim);
    l = gl.getAttribLocation(flatProg, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.lineWidth?.(2);
    gl.drawArrays(gl.LINES, 0, LOCAL_RIM_COUNT);
    gl.depthMask(true); gl.disable(gl.BLEND);
    disableAll();
  }

  /* clouds */
  if (R.atmoStrength > 0.2) {
    m4trs(TMP, S.q, px, py, pz, scale * 1.02);
    const mv = m4mul(m4(), view, TMP), mvp = m4mul(m4(), proj, mv);
    gl.useProgram(cloudProg);
    gl.uniformMatrix4fv(cloudProg.u.uMVP, false, mvp);
    gl.uniformMatrix4fv(cloudProg.u.uModel, false, TMP);
    gl.uniform3fv(cloudProg.u.uSun, sun);
    gl.uniform3fv(cloudProg.u.uCam, camPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.cloud);
    l = gl.getAttribLocation(cloudProg, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.cloudCov);
    l = gl.getAttribLocation(cloudProg, 'aCov');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 1, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
    gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    gl.depthMask(true); gl.disable(gl.BLEND);
    disableAll();
  }

  /* entities */
  if (S.entFade > 0.01 && ENT.n > 0) {
    gl.useProgram(entProg);
    gl.uniformMatrix4fv(entProg.u.uMVP, false, MVP);
    gl.uniform3fv(entProg.u.uCamLocal, camLocal);
    gl.uniform3fv(entProg.u.uSun, sun);
    gl.uniform1f(entProg.u.uFade, S.entFade);
    gl.uniform1f(entProg.u.uCols, ATLAS_COLS);
    gl.uniform1f(entProg.u.uXRay, xray);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(entProg.u.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.quad);
    const ac = gl.getAttribLocation(entProg, 'aCorner');
    gl.enableVertexAttribArray(ac); gl.vertexAttribPointer(ac, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(ac, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.inst);
    const defs = [['iPos', 3, 0], ['iScale', 1, 12], ['iTile', 1, 16], ['iTint', 3, 20]];
    for (const [nm, sz, off] of defs) {
      const li = gl.getAttribLocation(entProg, nm);
      gl.enableVertexAttribArray(li); gl.vertexAttribPointer(li, sz, gl.FLOAT, false, 32, off); gl.vertexAttribDivisor(li, 1);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 12, ENT.n);
    gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
    for (const [nm] of defs) { const li = gl.getAttribLocation(entProg, nm); gl.vertexAttribDivisor(li, 0); }
    disableAll();
  }

  /* atmosphere */
  if (R.atmoStrength > 0.05) {
    m4trs(TMP, S.q, px, py, pz, scale * 1.055);
    m3fromM4rot(NRM, TMP, 1 / (scale * 1.055));
    const mv = m4mul(m4(), view, TMP), mvp = m4mul(m4(), proj, mv);
    gl.useProgram(atmoProg);
    gl.uniformMatrix4fv(atmoProg.u.uMVP, false, mvp);
    gl.uniformMatrix4fv(atmoProg.u.uModel, false, TMP);
    gl.uniformMatrix3fv(atmoProg.u.uNrmMat, false, NRM);
    gl.uniform3fv(atmoProg.u.uSun, sun);
    gl.uniform3fv(atmoProg.u.uCam, camPos);
    gl.uniform3fv(atmoProg.u.uAtmo, R.atmo);
    gl.uniform1f(atmoProg.u.uAtmoK, R.atmoStrength);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.sph);
    l = gl.getAttribLocation(atmoProg, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false); gl.cullFace(gl.FRONT);
    gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    gl.cullFace(gl.BACK); gl.depthMask(true); gl.disable(gl.BLEND);
    disableAll();
  }

  /* diegetic health orb — small sphere near planet */
  {
    const hx = px + (inXR ? 0.28 : 1.35), hy = py + (inXR ? 0.15 : 0.9), hz = pz + (inXR ? -0.1 : 0);
    m4trs(TMP, [0, 0, 0, 1], hx, hy, hz, inXR ? 0.025 : 0.08);
    const hCol = [
      lerp(0.8, 0.2, W.health),
      lerp(0.2, 0.75, W.health),
      lerp(0.25, 0.55, W.health),
    ];
    if (W.state === 'snowball') { hCol[0] = 0.7; hCol[1] = 0.85; hCol[2] = 1; }
    if (W.state === 'moist-greenhouse') { hCol[0] = 1; hCol[1] = 0.4; hCol[2] = 0.1; }
    gl.useProgram(healthProg);
    gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
    gl.uniform1f(healthProg.u.uScale, 1);
    gl.uniform3fv(healthProg.u.uCol, hCol);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.sph);
    l = gl.getAttribLocation(healthProg, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    gl.disable(gl.BLEND); disableAll();
  }

  if (inXR && hands) {
    gl.useProgram(flatProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.sph);
    l = gl.getAttribLocation(flatProg, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
    for (const h of hands) {
      if (!h.active) continue;
      m4trs(TMP, [0, 0, 0, 1], h.pos[0], h.pos[1], h.pos[2], h.grab ? 0.017 : 0.011);
      gl.uniformMatrix4fv(flatProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
      if (h.grab) gl.uniform4f(flatProg.u.uCol, 0.55, 0.78, 1.0, 1.0);
      else gl.uniform4f(flatProg.u.uCol, 0.30, 0.36, 0.48, 1.0);
      gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    }
    disableAll();
  }
}

export { vIdx as planetIndexCount };
