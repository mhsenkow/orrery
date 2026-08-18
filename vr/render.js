/** WebGL2 rendering: planet, atmosphere, clouds, extruded entities. */

import { m4, m4ident, m4mul, m4trs, m3fromM4rot, clamp, lerp } from './math.js';
import { N, NF, NC, VPF, warp, facePoint, dirToCell, sampleFaceField, DIR, NBR } from './sphere.js';
import { W } from './world.js';
import { ENT, MAX_ENT } from './agents.js';
import { showErr } from './math.js';
import { lifeRGB, oceanLifeRGB, GUILD_RGB, dominantGuildAt } from './sim/lifeColour.js';
import { GUILDS } from './sim/redox.js';
import { BIOMES } from './sim/ecology.js';
import { GROUND, presentTime, tidePhase, waterStage } from './sim/present.js';
import { getSpriteAtlas, ATLAS_COLS } from './sprites.js';
import { buildTransmittanceLUT, uploadScatterLUT, buildMultipleScatterLUT, updateScatterLUT } from './sim/scatter.js';
import { applyOverlay } from './sim/overlay.js';
import { fillFlowStreaks } from './sim/flowviz.js';
import { localSeaLevel, isSubmerged } from './sim/cellSurface.js';
import { meshForEntity } from './sim/mesh.js';
import { initGpgpu } from './sim/gpgpu/index.js';
import { slotWorldPos, tickTable } from './sim/orreryTable.js';

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

/* ---------- geometry lattice (globe mesh can be finer than sim N) ---------- */
export const GLOBE_SUBD_ALLOWED = [1, 2, 3, 4];
/** Cap globe lattice edge — keeps vertex count sane at N=192 × 4×. */
export const MAX_GN = 384;
export let GLOBE_SUBD = 2;
let GN = N * GLOBE_SUBD;
let GNV = 6 * (GN + 1) * (GN + 1);
let GVPF = (GN + 1) * (GN + 1);
let _cellDat = new Uint8Array(NC * 4);
let vMix0, vMix1, vMix2, vMix3;
let vMixC0, vMixC1, vMixC2, vMixC3;

export function globeN() { return GN; }
export function globeVertexCount() { return GNV; }
export function effectiveGlobeSubd(n = N) {
  return Math.max(1, Math.round(Math.min(n * GLOBE_SUBD, MAX_GN) / n));
}

/** Clamp globe mesh when sim N is very high. */
export function recommendGlobeSubd(n = N) {
  if (n >= 192) return 1;
  if (n >= 128) return 2;
  if (n >= 96) return 2;
  return GLOBE_SUBD;
}

export function setGlobeSubd(subd) {
  const s = GLOBE_SUBD_ALLOWED.includes(subd) ? subd : GLOBE_SUBD;
  if (s === GLOBE_SUBD) return s;
  GLOBE_SUBD = s;
  buildLatticeArrays();
  return s;
}

export let vDir = new Float32Array(GNV * 3);
export let vCell = new Int32Array(GNV);
export let vPos = new Float32Array(GNV * 3);
export let vNrm = new Float32Array(GNV * 3);
export let vDat = new Uint8Array(GNV * 4);
/** Per-vertex atlas UV into field textures (6N × N). Next backlog gbuf. */
export let vFieldUV = new Float32Array(GNV * 2);
let vFace = new Uint8Array(GNV);
let vGridI = new Uint16Array(GNV);
let vGridJ = new Uint16Array(GNV);
export let vIdx;

const GUILD_INDEX = Object.fromEntries(GUILDS.map((g, i) => [g.id, i]));
export let FIELD_W = 6 * N;
export let FIELD_H = N;
let fieldTex0 = null, fieldTex1 = null;
let fieldPix0 = null, fieldPix1 = null;
let bufFieldUV = null;
let scatterTex = null;
let scatterMsTex = null;
let scatterLut = null;
export let overlayMode = 'none';
export function setOverlayMode(m) { overlayMode = m || 'none'; }

let _flowBuf = null;
let FLOW_COUNT = 0;

let weldGroups = [];

function bindVertexMix() {
  vMix0 = new Float32Array(GNV);
  vMix1 = new Float32Array(GNV);
  vMix2 = new Float32Array(GNV);
  vMix3 = new Float32Array(GNV);
  vMixC0 = new Uint32Array(GNV);
  vMixC1 = new Uint32Array(GNV);
  vMixC2 = new Uint32Array(GNV);
  vMixC3 = new Uint32Array(GNV);
  for (let k = 0; k < GNV; k++) {
    const f = vFace[k], gi = vGridI[k], gj = vGridJ[k];
    const ci = (gi / GN) * N;
    const cj = (gj / GN) * N;
    const i0 = Math.floor(ci);
    const j0 = Math.floor(cj);
    const fu = ci - i0;
    const fv = cj - j0;
    const i1 = Math.min(i0 + 1, N - 1);
    const j1 = Math.min(j0 + 1, N - 1);
    const j0c = clamp(j0, 0, N - 1);
    const j1c = clamp(j1, 0, N - 1);
    const i0c = clamp(i0, 0, N - 1);
    const i1c = clamp(i1, 0, N - 1);
    vMixC0[k] = f * NF + j0c * N + i0c;
    vMixC1[k] = f * NF + j0c * N + i1c;
    vMixC2[k] = f * NF + j1c * N + i0c;
    vMixC3[k] = f * NF + j1c * N + i1c;
    vMix0[k] = (1 - fu) * (1 - fv);
    vMix1[k] = fu * (1 - fv);
    vMix2[k] = (1 - fu) * fv;
    vMix3[k] = fu * fv;
  }
}

function spreadVertexDat() {
  for (let k = 0; k < GNV; k++) {
    const o = k << 2;
    const b0 = vMixC0[k] << 2;
    const b1 = vMixC1[k] << 2;
    const b2 = vMixC2[k] << 2;
    const b3 = vMixC3[k] << 2;
    const w0 = vMix0[k], w1 = vMix1[k], w2 = vMix2[k], w3 = vMix3[k];
    vDat[o] = (w0 * _cellDat[b0] + w1 * _cellDat[b1] + w2 * _cellDat[b2] + w3 * _cellDat[b3]) | 0;
    vDat[o + 1] = (w0 * _cellDat[b0 + 1] + w1 * _cellDat[b1 + 1] + w2 * _cellDat[b2 + 1] + w3 * _cellDat[b3 + 1]) | 0;
    vDat[o + 2] = (w0 * _cellDat[b0 + 2] + w1 * _cellDat[b1 + 2] + w2 * _cellDat[b2 + 2] + w3 * _cellDat[b3 + 2]) | 0;
    vDat[o + 3] = (w0 * _cellDat[b0 + 3] + w1 * _cellDat[b1 + 3] + w2 * _cellDat[b2 + 3] + w3 * _cellDat[b3 + 3]) | 0;
  }
}

function buildLatticeArrays() {
  GN = Math.min(N * GLOBE_SUBD, MAX_GN);
  GNV = 6 * (GN + 1) * (GN + 1);
  GVPF = (GN + 1) * (GN + 1);
  _cellDat = new Uint8Array(NC * 4);
  vDir = new Float32Array(GNV * 3);
  vCell = new Int32Array(GNV);
  vPos = new Float32Array(GNV * 3);
  vNrm = new Float32Array(GNV * 3);
  vDat = new Uint8Array(GNV * 4);
  vFieldUV = new Float32Array(GNV * 2);
  vFace = new Uint8Array(GNV);
  vGridI = new Uint16Array(GNV);
  vGridJ = new Uint16Array(GNV);
  FIELD_W = 6 * N;
  FIELD_H = N;
  const p = [0, 0, 0];
  let k = 0;
  for (let f = 0; f < 6; f++) for (let j = 0; j <= GN; j++) for (let i = 0; i <= GN; i++, k++) {
    const s = i / GN * 2 - 1, t = j / GN * 2 - 1;
    facePoint(f, warp(s), warp(t), p);
    vDir[k * 3] = p[0]; vDir[k * 3 + 1] = p[1]; vDir[k * 3 + 2] = p[2];
    vFace[k] = f;
    vGridI[k] = i;
    vGridJ[k] = j;
    const c = dirToCell(p[0], p[1], p[2]);
    vCell[k] = c;
    const ci = (i / GN) * N;
    const cj = (j / GN) * N;
    vFieldUV[k * 2] = (f * N + ci + 0.5) / FIELD_W;
    vFieldUV[k * 2 + 1] = (cj + 0.5) / FIELD_H;
  }
  const idx = new Uint32Array(6 * GN * GN * 6);
  let m = 0;
  for (let f = 0; f < 6; f++) {
    const o = f * GVPF;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const a = o + j * (GN + 1) + i, b = a + 1, c = a + (GN + 1), d = c + 1;
      idx[m++] = a; idx[m++] = b; idx[m++] = c;
      idx[m++] = b; idx[m++] = d; idx[m++] = c;
    }
  }
  vIdx = idx;
  // Weld groups
  const map = new Map(), out = [];
  for (let f = 0; f < 6; f++) for (let j = 0; j <= GN; j++) for (let i = 0; i <= GN; i++) {
    if (i !== 0 && i !== GN && j !== 0 && j !== GN) continue;
    const kk = f * GVPF + j * (GN + 1) + i;
    const key = Math.round(vDir[kk * 3] * 1e6) + ',' + Math.round(vDir[kk * 3 + 1] * 1e6) + ',' + Math.round(vDir[kk * 3 + 2] * 1e6);
    let a = map.get(key);
    if (!a) { a = []; map.set(key, a); }
    a.push(kk);
  }
  for (const a of map.values()) if (a.length > 1) out.push(a);
  weldGroups = out;
  bindVertexMix();
}

buildLatticeArrays();

/** Remesh planet after setResolution(N). Reallocates GPU buffers. */
export function remeshPlanet() {
  buildLatticeArrays();
  if (!gl || !buf) return;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, vIdx, gl.STATIC_DRAW);
  upload(buf.pos, vPos);
  upload(buf.nrm, vNrm);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.dat);
  gl.bufferData(gl.ARRAY_BUFFER, vDat.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.fieldUV);
  gl.bufferData(gl.ARRAY_BUFFER, vFieldUV, gl.STATIC_DRAW);
  fieldPix0 = new Uint8Array(FIELD_W * FIELD_H * 4);
  fieldPix1 = new Uint8Array(FIELD_W * FIELD_H * 4);
  for (const tex of [fieldTex0, fieldTex1]) {
    if (!tex) continue;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FIELD_W, FIELD_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  rebuildScatterLUTs();
  rebuildGeometry();
  refreshColours(1);
}

/** Rebuild transmittance / multi-scatter from current atmosphere knobs. */
export function rebuildScatterLUTs(opts = {}) {
  if (!gl) return;
  const pack = {
    size: 32,
    ozone: opts.ozone ?? (W.ozone || 0.3),
    aerosol: opts.aerosol ?? Math.min(1, (W.gases?.dust || 0) + (W.gases?.sulphate || 0) * 2),
    albedo: opts.albedo || [0.2, 0.22, 0.2],
  };
  scatterLut = buildTransmittanceLUT(pack);
  const ms = buildMultipleScatterLUT(pack);
  if (scatterTex) updateScatterLUT(gl, scatterTex, scatterLut);
  else scatterTex = uploadScatterLUT(gl, scatterLut);
  if (scatterMsTex) updateScatterLUT(gl, scatterMsTex, ms);
  else scatterMsTex = uploadScatterLUT(gl, ms);
}
/* ---------- sprites / atlas ---------- */
function buildAtlas() {
  return getSpriteAtlas();
}

/* ---------- programs / buffers ---------- */
let planetProg, atmoProg, cloudProg, entProg, meshProg, starProg, flatProg, healthProg;
let buf, atlasTex, SPH_COUNT = 0, GRID_COUNT = 0, CELL_GRID_COUNT = 0, NSTAR = 1400;
const MVP = m4(), MODEL = m4(), NRM = new Float32Array(9), TMP = m4();
let _cellGrid = null;
let _localRim = null;
let LOCAL_RIM_COUNT = 0;
let _localSet = null;
let _localFocus = -1;
let _localHover = -1;
let _localWash = false;
let _localRimOn = false;
let _localKey = '';
let _guildHL = null;
let ORBIT_AXIS_COUNT = 0;
let ORBIT_EQ_COUNT = 0;
let ORBIT_ECL_COUNT = 0;
let _orbitOblKey = NaN;

/** Highlight cells dominated by a redox guild (Lab tower hover). */
export function setGuildHighlight(guildId) {
  _guildHL = guildId || null;
}

export function setLocalHover(cell) {
  _localHover = cell | 0;
}

/** Build spin-axis + equator + ecliptic line overlays for a given obliquity. */
function ensureOrbitGuides(obliquity) {
  const key = ((obliquity * 1000) | 0);
  if (key === _orbitOblKey && buf.orbitAxis) return;
  _orbitOblKey = key;
  const ε = obliquity || 0;
  // Spin axis (mesh poles = ±Y)
  const axis = new Float32Array([0, -1.42, 0, 0, 1.42, 0]);
  ORBIT_AXIS_COUNT = 2;
  // Equator in model XZ
  const N = 64;
  const eq = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    const o = i * 6;
    const r = 1.06;
    eq[o] = Math.cos(a0) * r; eq[o + 1] = 0; eq[o + 2] = Math.sin(a0) * r;
    eq[o + 3] = Math.cos(a1) * r; eq[o + 4] = 0; eq[o + 5] = Math.sin(a1) * r;
  }
  ORBIT_EQ_COUNT = N * 2;
  // Ecliptic ring: plane whose normal is tilted by ε from spin axis
  // n = (sin ε, cos ε, 0); basis u = (-cos ε, sin ε, 0), v = (0,0,1)
  const s = Math.sin(ε), c = Math.cos(ε);
  const ux = -c, uy = s, uz = 0;
  const vx = 0, vy = 0, vz = 1;
  const ecl = new Float32Array(N * 6);
  const re = 1.12;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    const o = i * 6;
    ecl[o] = (ux * Math.cos(a0) + vx * Math.sin(a0)) * re;
    ecl[o + 1] = (uy * Math.cos(a0) + vy * Math.sin(a0)) * re;
    ecl[o + 2] = (uz * Math.cos(a0) + vz * Math.sin(a0)) * re;
    ecl[o + 3] = (ux * Math.cos(a1) + vx * Math.sin(a1)) * re;
    ecl[o + 4] = (uy * Math.cos(a1) + vy * Math.sin(a1)) * re;
    ecl[o + 5] = (uz * Math.cos(a1) + vz * Math.sin(a1)) * re;
  }
  ORBIT_ECL_COUNT = N * 2;
  if (!buf.orbitAxis) {
    buf.orbitAxis = gl.createBuffer();
    buf.orbitEq = gl.createBuffer();
    buf.orbitEcl = gl.createBuffer();
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.orbitAxis);
  gl.bufferData(gl.ARRAY_BUFFER, axis, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.orbitEq);
  gl.bufferData(gl.ARRAY_BUFFER, eq, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.orbitEcl);
  gl.bufferData(gl.ARRAY_BUFFER, ecl, gl.STATIC_DRAW);
}

function drawOrbitLines(prog, mvp, buffer, count, rgba) {
  if (!count) return;
  gl.uniformMatrix4fv(prog.u.uMVP, false, mvp);
  gl.uniform4f(prog.u.uCol, rgba[0], rgba[1], rgba[2], rgba[3]);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const l = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(l);
  gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, count);
}

export function initGL(cvs) {
  canvas = cvs;
  gl = canvas.getContext('webgl2', { xrCompatible: true, antialias: true, alpha: false, depth: true });
  if (!gl) { showErr('WebGL2 is not available.'); throw new Error('no webgl2'); }

  planetProg = prog(V_HEAD + `
in vec3 aPos; in vec3 aNrm; in vec4 aDat; in vec2 aFieldUV;
uniform mat4 uMVP, uModel; uniform mat3 uNrmMat;
out vec3 vN; out vec4 vD; out vec3 vW; out vec2 vFUV;
void main(){
  vN = normalize(uNrmMat*aNrm);
  vD = aDat; vW = (uModel*vec4(aPos,1.0)).xyz; vFUV = aFieldUV;
  gl_Position = uMVP*vec4(aPos,1.0);
}`, F_HEAD + `
in vec3 vN; in vec4 vD; in vec3 vW; in vec2 vFUV;
uniform vec3 uSun, uCam, uAtmo; uniform float uDetail, uAtmoK, uNight, uDaisy, uOpacity, uXRay, uEarth;
uniform float uOzone, uAerosol, uMag, uTime, uHaze, uExposure, uMoon;
uniform float uStorm, uCloudShadow, uMagTilt;
uniform sampler2D uField0; uniform sampler2D uField1; uniform sampler2D uScatter; uniform sampler2D uScatterMs;
out vec4 o;
vec3 climate(float t){
  vec3 a=vec3(0.12,0.18,0.48), b=vec3(0.18,0.48,0.68), c=vec3(0.26,0.58,0.36);
  vec3 d=vec3(0.78,0.68,0.30), e=vec3(0.72,0.32,0.20);
  if(t<0.25) return mix(a,b,t/0.25);
  if(t<0.50) return mix(b,c,(t-0.25)/0.25);
  if(t<0.75) return mix(c,d,(t-0.50)/0.25);
  return mix(d,e,clamp((t-0.75)/0.25,0.0,1.0));
}
vec3 tonemap(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
}
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(uCam-vW);
  float facing = max(dot(N, V), 0.0);
  if(uXRay > 0.01 && facing > (1.0 - uXRay)) discard;
  // Field textures — life/ice/moist/(sed+cloud packed) + npp/guild/height/wind
  vec4 F0 = texture(uField0, vFUV);
  vec4 F1 = texture(uField1, vFUV);
  float lifeF = F0.r;
  float iceF = F0.g;
  float moistF = F0.b;
  float packedSA = F0.a * 255.0;
  float sedF = mod(packedSA, 16.0) / 15.0;
  float cloudF = floor(packedSA / 16.0) / 15.0;
  float nppF = F1.r;
  float guildF = F1.g;
  float heightF = F1.b; // 0 deep ocean → 1 high land
  float windF = F1.a;
  float waterMask = 1.0 - smoothstep(0.42, 0.55, heightF);
  float landMask = 1.0 - waterMask;
  // Intertidal coast band — real field + soft shoreline
  float interF = sedF; // packed with intertidal emphasis near coast
  float interBand = smoothstep(0.35, 0.55, heightF) * smoothstep(0.62, 0.48, heightF);
  interBand = max(interBand * (0.35 + moistF), interF * landMask * 1.2);
  vec3 biome=vD.rgb;
  float greenDom = biome.g - max(biome.r, biome.b);
  float vegFallback = smoothstep(0.08, 0.35, greenDom) * smoothstep(0.35, 0.7, biome.g);
  float lifeGreen = mix(vegFallback, lifeF, smoothstep(0.02, 0.12, lifeF))
    * landMask * (1.0 - uDaisy) * (1.0 - iceF * 0.85);
  // Phenology / green wave from NPP pulse
  lifeGreen *= 0.75 + 0.35 * nppF;
  float lum = (biome.r+biome.g+biome.b)/3.0;
  float daisyBW = max(smoothstep(0.72, 0.9, lum), smoothstep(0.32, 0.12, lum));
  float lifeShow = max(lifeGreen, daisyBW * uDaisy + daisyBW * (1.0 - uDaisy) * 0.5);
  float show = max(uDetail, max(lifeShow, uDaisy * 0.92));
  show = max(show, uEarth * 0.82);
  vec3 base=mix(climate(vD.a), biome, show);
  // Guild pigment bias — retinal / cyanobacteria / sulfur diverge
  vec3 guildTint = mix(vec3(0.2, 0.55, 0.25), vec3(0.45, 0.15, 0.55), smoothstep(0.2, 0.8, guildF));
  guildTint = mix(guildTint, vec3(0.55, 0.45, 0.12), smoothstep(0.55, 0.95, guildF));
  base = mix(base, guildTint, lifeGreen * landMask * 0.35 * (1.0 - uDaisy));
  float nl=max(dot(N,uSun),0.0);
  float wrap=max(dot(N,uSun)*0.5+0.5,0.0);
  float ambient = 0.14 + 0.10*wrap*wrap;
  float key = pow(nl, 1.15) * 1.05;
  float fill = pow(wrap, 2.0) * 0.22;
  // PBR-ish roughness by surface type
  float rough = mix(0.85, 0.08, waterMask * (1.0 - iceF));
  rough = mix(rough, 0.55, landMask * lifeGreen); // canopy softer
  rough = mix(rough, 0.95, iceF * 0.7); // snow diffuse
  float waterish = waterMask * (1.0 - iceF * 0.9) * (1.0 - lifeGreen * 0.5);
  float gloss = mix(8.0, 96.0, 1.0 - rough) * mix(1.0, 0.35, clamp(windF * 1.4, 0.0, 1.0));
  gloss = max(6.0, gloss);
  vec3 H = normalize(uSun + V);
  float spec = pow(max(dot(N, H), 0.0), gloss) * waterish * (1.0 - rough);
  float specWide = pow(max(dot(N, H), 0.0), max(6.0, gloss * 0.2)) * waterish * (0.15 + windF * 0.4);
  vec3 col = base * (ambient + key + fill);
  col += vec3(0.95, 0.97, 1.0) * (spec * 0.9 + specWide);
  col += vec3(0.02,0.04,0.08)*(1.0-nl);
  // Sea-ice mosaic — floes + dark leads
  float floe = fract(sin(dot(N.xy, vec2(12.9898,78.233))) * 43758.5453);
  float lead = smoothstep(0.62, 0.78, floe) * iceF * waterMask;
  col = mix(col, vec3(0.82, 0.88, 0.95), iceF * (1.0 - lead * 0.85));
  col = mix(col, vec3(0.08, 0.18, 0.28), lead * 0.7);
  // Intertidal ochre / wet sand
  col = mix(col, vec3(0.58, 0.44, 0.28), interBand * 0.55);
  // Whitecaps from wind field
  col = mix(col, vec3(0.92, 0.94, 0.98), waterish * pow(clamp(windF, 0.0, 1.0), 3.0) * 0.45);
  // Local cloud shadows — denser when coverage high
  col *= 1.0 - cloudF * waterMask * 0.16 - cloudF * landMask * 0.38 * (0.4+0.6*nl);
  col *= 1.0 - cloudF * cloudF * 0.18 * (0.3 + 0.7 * nl);
  // Valley darkening from height field
  col *= 1.0 - (1.0 - heightF) * landMask * pow(1.0 - nl, 1.4) * 0.14;
  col = mix(col, vec3(0.72, 0.55, 0.28), sedF * waterMask * 0.35);
  col = mix(col, vec3(0.12, 0.45, 0.22), nppF * waterMask * 0.4 * (1.0 - iceF));
  float pop = lifeGreen * (1.0 - uEarth * 0.65);
  col += vec3(0.08,0.38,0.10)*pop*(0.25+0.75*nl);
  col = mix(col, biome * (0.52 + 0.72*nl), lifeGreen * mix(0.58, 0.30, uEarth));
  col = mix(col, biome * (0.22 + 1.1*nl), daisyBW * max(uDaisy, 0.35));
  float night = pow(1.0-nl, 3.2);
  col += vec3(0.05, 0.65, 0.42) * uNight * night * max(lifeGreen, lifeF * waterMask) * 0.7;
  col += vec3(1.0,0.72,0.35)*uNight*night*vD.b*0.14*(1.0-uDaisy);
  col += vec3(1.0,0.35,0.08)*uNight*night*smoothstep(0.7,1.0,vD.a)*0.08;
  // Moonlight on the night side — same opposition as a full moon, same cool wash as the map
  float ml = max(dot(N, -uSun), 0.0);
  col += vec3(0.14, 0.19, 0.34) * uMoon * night * (0.22 + ml * 0.7);
  vec3 Hm = normalize(-uSun + V);
  col += vec3(0.55, 0.64, 0.9) * pow(max(dot(N, Hm), 0.0), gloss) * waterish * uMoon * night * 0.55;
  float termBand = exp(-pow(nl - 0.05, 2.0) * 40.0);
  // Lightning gated by local storm (cloud × precip) — flashes where storms are
  float stormLocal = cloudF * max(moistF, 0.35) * max(uStorm, 0.15);
  float stormFlash = step(0.988, fract(sin(dot(N.xy * 40.0 + cloudF * 9.0, vec2(12.9898,78.233)) + uTime*41.0)*43758.5453));
  col += vec3(0.8, 0.88, 1.0) * stormFlash * stormLocal * (night + termBand*0.55) * 2.0;
  float rim=pow(1.0-max(dot(N,V),0.0), 2.6);
  float rim2=pow(1.0-max(dot(N,V),0.0), 5.0);
  // Bruneton-ish transmittance + multiple scatter
  float muV = max(dot(N,V), 0.0);
  float muS = max(dot(N,uSun), 0.0);
  vec3 T = texture(uScatter, vec2(muV, muS)).rgb;
  vec3 MS = texture(uScatterMs, vec2(muV, muS)).rgb;
  vec3 atmoCol = mix(uAtmo, vec3(0.06, 0.14, 0.62), uOzone * 0.65);
  atmoCol = mix(atmoCol, vec3(0.9, 0.42, 0.18), uAerosol * 0.55);
  atmoCol = mix(atmoCol, vec3(0.55, 0.35, 0.15), uHaze * 0.7);
  atmoCol *= mix(vec3(1.0), T, 0.7);
  // Multiple scatter fills limb + twilight; stronger opposite the sun
  float msW = uAtmoK * (0.45 + 0.55 * (1.0 - muS) * (0.5 + 0.5 * rim));
  atmoCol += MS * msW;
  float sunEdge = pow(max(dot(V,-uSun),0.0), 5.0);
  vec3 ray = atmoCol * rim * uAtmoK * (0.15+0.85*nl) * 1.15;
  // Ozone Chappuis along long slant — deepen blue at twilight
  ray = mix(ray, vec3(0.05, 0.12, 0.55) * rim2, uOzone * (1.0 - muS) * 0.5);
  vec3 mie = vec3(1.0,0.82,0.55) * sunEdge * rim * (0.35 + uAerosol * 1.2) * uAtmoK;
  vec3 crep = vec3(1.0, 0.55, 0.25) * termBand * rim2 * uAtmoK * 0.45;
  // Inscatter wash from MS on the surface itself (soft sky light)
  col += MS * uAtmoK * (0.08 + 0.12 * wrap) * (1.0 - waterish * 0.3);
  col += ray + mie + crep;
  float airglow = night * rim2 * (0.3 + uOzone * 0.5) * uAtmoK * 0.35;
  col += vec3(0.15, 0.55, 0.35) * airglow;
  // Aurora — dipole tilted from spin axis
  float ct = cos(uMagTilt), st = sin(uMagTilt);
  vec3 Nm = normalize(vec3(N.x*ct + N.y*st, -N.x*st + N.y*ct, N.z));
  float magLat = abs(Nm.y);
  float oval = exp(-pow(magLat - 0.72, 2.0) * 80.0) * uMag;
  float aurPulse = 0.65 + 0.35 * sin(uTime * 2.1 + N.x * 12.0);
  col += vec3(0.2, 0.95, 0.55) * oval * night * aurPulse * 0.55;
  col += vec3(0.55, 0.25, 0.95) * oval * night * (1.0-aurPulse) * 0.25 * uMag;
  float term = smoothstep(-0.18 - uAerosol * 0.25, 0.22 + uAtmoK * 0.12, nl);
  col *= 0.42 + 0.58 * term;
  col = tonemap(col * uExposure);
  o=vec4(col, uOpacity);
}`);

  atmoProg = prog(V_HEAD + `
in vec3 aPos; uniform mat4 uMVP, uModel; uniform mat3 uNrmMat;
out vec3 vN; out vec3 vW;
void main(){ vN=normalize(uNrmMat*aPos); vW=(uModel*vec4(aPos,1.0)).xyz; gl_Position=uMVP*vec4(aPos,1.0); }
`, F_HEAD + `
in vec3 vN; in vec3 vW;
uniform vec3 uSun, uCam, uAtmo; uniform float uAtmoK, uOzone, uAerosol, uMag, uTime;
out vec4 o;
void main(){
  vec3 N=normalize(vN), V=normalize(uCam-vW);
  float f=pow(1.0-abs(dot(N,V)), 2.8);
  float f2=pow(1.0-abs(dot(N,V)), 5.5);
  float lit=clamp(dot(N,uSun)*0.55+0.45,0.0,1.0);
  float mie=pow(max(dot(V,-uSun),0.0),5.5);
  vec3 atmo = mix(uAtmo, vec3(0.05,0.12,0.55), uOzone*0.5);
  atmo = mix(atmo, vec3(0.9,0.4,0.15), uAerosol*0.45);
  vec3 col=atmo*f*lit*uAtmoK*1.05 + vec3(1.0,0.72,0.42)*mie*f*0.55*uAtmoK;
  // Outer glow / limb airglow
  col += vec3(0.2,0.55,0.4)*f2*(1.0-lit)*uAtmoK*0.4;
  // Aurora contribution on shell
  float magLat=abs(N.y);
  float oval=exp(-pow(magLat-0.72,2.0)*70.0)*uMag;
  float pulse=0.6+0.4*sin(uTime*2.0+N.x*10.0);
  col += vec3(0.25,1.0,0.55)*oval*(1.0-lit)*pulse*0.7;
  o=vec4(col,1.0);
}`);

  cloudProg = prog(V_HEAD + `
in vec3 aPos; in float aCov;
uniform mat4 uMVP, uModel; uniform float uTime;
out float vC; out float vType; out vec3 vN; out vec3 vW;
void main(){
  float typ = smoothstep(0.15, 0.45, aCov) + smoothstep(0.55, 0.85, aCov);
  float lift = mix(0.012, 0.042, smoothstep(0.25, 0.9, aCov));
  float boil = aCov > 0.55 ? 0.008*sin(uTime*0.7 + aPos.x*18.0 + aPos.z*14.0) : 0.0;
  vec3 p=normalize(aPos)*(1.0+lift+boil);
  vN=normalize(aPos); vW=(uModel*vec4(p,1.0)).xyz; vC=aCov; vType=typ;
  gl_Position=uMVP*vec4(p,1.0);
}`, F_HEAD + `
in float vC; in float vType; in vec3 vN; in vec3 vW;
uniform vec3 uSun, uCam; uniform float uTime;
out vec4 o;
float hash(vec3 p){
  return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453);
}
float densAt(vec3 sp, float cov, float t){
  float n = hash(sp * 6.0 + t * 0.08);
  float n2 = hash(sp * 14.0 - t * 0.05);
  return cov * (0.45 + 0.35 * n + 0.2 * n2);
}
void main(){
  if(vC<0.04) discard;
  vec3 N=normalize(vN);
  vec3 V=normalize(uCam-vW);
  vec3 L=normalize(uSun);
  // Volumetric raymarch through cloud shell (10 steps)
  float dens = 0.0;
  float light = 0.0;
  vec3 p = normalize(vW);
  float g = 0.6; // Mie-ish forward scatter
  for (int i = 0; i < 10; i++) {
    float t = float(i) * 0.0045;
    vec3 sp = normalize(p + V * (-t));
    float d = densAt(sp, vC, uTime) * (1.0 - float(i) * 0.07);
    dens += d;
    float mu = max(0.0, dot(sp, L));
    float phase = (1.0 - g*g) / pow(1.0 + g*g - 2.0*g*mu, 1.5);
    light += d * (0.2 + 0.8 * mu) * (0.55 + 0.45 * phase);
  }
  dens = clamp(dens * 0.22, 0.0, 1.0);
  float nl=max(dot(N,L),0.0);
  float a=smoothstep(0.03,0.48,dens)*mix(0.38,0.95,smoothstep(0.0,2.0,vType));
  float rim=pow(1.0-max(dot(N,V),0.0), 2.6);
  vec3 cold=vec3(0.68,0.76,0.92);
  vec3 warm=vec3(1.0,0.96,0.9);
  vec3 body=mix(cold, warm, clamp(vType*0.5,0.0,1.0));
  vec3 shade = body * (0.28 + light * 0.5 + nl * 0.22);
  shade += vec3(1.0,0.9,0.75) * rim * nl * 0.4;
  // Silver lining toward sun
  shade += vec3(1.0,0.95,0.88) * pow(max(dot(V,-L),0.0), 8.0) * dens * 0.55;
  shade *= 1.0 - dens * 0.2 * (1.0 - nl);
  o=vec4(shade,a);
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

  meshProg = prog(V_HEAD + `
in vec3 aPos; uniform mat4 uMVP; uniform vec3 uOrigin; uniform float uScale;
uniform vec3 uUp; uniform vec3 uRight; uniform vec3 uFwd;
void main(){
  vec3 p = uOrigin + (uRight*aPos.x + uUp*aPos.y + uFwd*aPos.z) * uScale;
  gl_Position = uMVP * vec4(p, 1.0);
}
`, F_HEAD + `
uniform vec3 uTint; uniform vec3 uSun; uniform vec3 uUp; out vec4 o;
void main(){
  float lit = 0.4 + 0.6 * clamp(dot(normalize(uUp), uSun) * 0.5 + 0.5, 0.0, 1.0);
  o = vec4(uTint * lit, 0.95);
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
    fieldUV: gl.createBuffer(),
    inst: gl.createBuffer(), quad: gl.createBuffer(),
    star: gl.createBuffer(), starMag: gl.createBuffer(),
    sph: gl.createBuffer(), sphIdx: gl.createBuffer(), grid: gl.createBuffer(),
    cellGrid: gl.createBuffer(),
    localRim: gl.createBuffer(),
    flowStreaks: gl.createBuffer(),
    cloud: gl.createBuffer(), cloudCov: gl.createBuffer(),
  };
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, vIdx, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.dat);
  gl.bufferData(gl.ARRAY_BUFFER, vDat.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.fieldUV);
  gl.bufferData(gl.ARRAY_BUFFER, vFieldUV, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.inst);
  gl.bufferData(gl.ARRAY_BUFFER, ENT.data.byteLength, gl.DYNAMIC_DRAW);

  // gbuf field atlases: 6N × N RGBA8
  fieldPix0 = new Uint8Array(FIELD_W * FIELD_H * 4);
  fieldPix1 = new Uint8Array(FIELD_W * FIELD_H * 4);
  fieldTex0 = gl.createTexture();
  fieldTex1 = gl.createTexture();
  for (const tex of [fieldTex0, fieldTex1]) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FIELD_W, FIELD_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  scatterLut = buildTransmittanceLUT({ size: 32 });
  scatterTex = uploadScatterLUT(gl, scatterLut);
  scatterMsTex = uploadScatterLUT(gl, buildMultipleScatterLUT({ size: 24 }));
  try {
    initGpgpu(gl, { maxSlots: 8, enabled: true });
  } catch (e) {
    console.warn('[gpgpu]', e);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showErr('GPU context lost — reload the page to restore');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    showErr('GPU context restored — please reload');
  });

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
    // Deterministic starfield (seeded) — next backlog det
    let s = 0xC0FFEE ^ 0x9e3779b9;
    const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const sp = new Float32Array(NSTAR * 3), mg = new Float32Array(NSTAR);
    for (let i = 0; i < NSTAR; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sp[i * 3] = r * Math.cos(th) * 260; sp[i * 3 + 1] = u * 260; sp[i * 3 + 2] = r * Math.sin(th) * 260;
      mg[i] = 0.25 + Math.pow(rnd(), 2.6) * 0.95;
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
  const earth = !!W.rule.earthLike;
  // Earth: visible relief without needle peaks. Build towers stay tiny.
  const relief = earth ? Math.min(W.rule.relief || 0.05, 0.028) : (W.rule.relief || 0.05);
  const buildAmp = earth ? 0.0035 : 0.012;

  function heightAtVertex(k) {
    return sampleFaceField(W.h, vFace[k], vGridI[k], vGridJ[k], GN);
  }

  for (let k = 0; k < GNV; k++) {
    const c = vCell[k];
    const sea = localSeaLevel(W, c);
    let e = Math.max(heightAtVertex(k), sea);
    // Soften cell-to-cell cliffs so land reads as plates, not blocky quads
    if (earth) {
      let s = e;
      for (let i = 0; i < 4; i++) s += Math.max(W.h[NBR[c * 4 + i]], localSeaLevel(W, NBR[c * 4 + i]));
      e = e * 0.4 + (s / 5) * 0.6;
    }
    const build = Math.min(1, W.build?.[c] || 0);
    const r = 1 + (e - sea) * relief + build * buildAmp;
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
  for (let k = 0; k < GNV; k++) {
    const o = k * 3, l = Math.hypot(vNrm[o], vNrm[o + 1], vNrm[o + 2]) || 1;
    vNrm[o] /= l; vNrm[o + 1] /= l; vNrm[o + 2] /= l;
  }
  if (gl) { upload(buf.pos, vPos); upload(buf.nrm, vNrm); }
  uploadCellGrid();
}

/** Cell-edge wireframe following terrain relief — for View → Grid. */
function uploadCellGrid() {
  // 6 faces × (N rows of N segs horiz + N cols of N segs vert) × 2 verts × 3 floats
  const segs = 6 * (N * (N + 1) + N * (N + 1));
  if (!_cellGrid || _cellGrid.length < segs * 6) _cellGrid = new Float32Array(segs * 6);
  const out = _cellGrid;
  let m = 0;
  const lift = 1.003; // sit slightly above the surface to avoid z-fighting
  const step = GLOBE_SUBD;
  for (let f = 0; f < 6; f++) {
    const o = f * GVPF;
    for (let j = 0; j <= N; j++) {
      const gj = j * step;
      for (let i = 0; i < N; i++) {
        const gi = i * step;
        const a = (o + gj * (GN + 1) + gi) * 3;
        const b = a + step * 3;
        out[m++] = vPos[a] * lift; out[m++] = vPos[a + 1] * lift; out[m++] = vPos[a + 2] * lift;
        out[m++] = vPos[b] * lift; out[m++] = vPos[b + 1] * lift; out[m++] = vPos[b + 2] * lift;
      }
    }
    for (let j = 0; j < N; j++) {
      const gj = j * step;
      for (let i = 0; i <= N; i++) {
        const gi = i * step;
        const a = (o + gj * (GN + 1) + gi) * 3;
        const c = a + step * (GN + 1) * 3;
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

function buildLiftAmt(c) {
  return (W.build[c] || 0) * (W.rule?.earthLike ? 0.0035 : 0.012);
}

function cellSurfPos(c, lift = 1.005) {
  const rel = W.rule.earthLike ? Math.min(W.rule.relief || 0.028, 0.028) : (W.rule.relief || 0.05);
  const rr = (1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * rel + buildLiftAmt(c)) * lift;
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
  if (patch?.hoverCell != null) _localHover = patch.hoverCell | 0;

  if (!wantRim || !patch?.cells) {
    LOCAL_RIM_COUNT = 0;
    _localKey = '';
    return;
  }

  const key = `${patch.focus}:${patch.radius}:${mode}:${((W.build?.[patch.focus] || 0) * 20) | 0}`;
  if (key === _localKey && LOCAL_RIM_COUNT > 0) return;
  const { cells, side, focus } = patch;
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
  const pts = ring.filter((c) => c >= 0).map((c) => cellSurfPos(c, 1.008));
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
  const pigment = W.dominantPigment;
  const season = W.season || 0;
  for (let c = 0; c < NC; c++) {
    const temp = lerp(W.prevTemp[c], W.temp[c], alpha);
    const life = lerp(W.prevLife[c], W.life[c], alpha);
    const ice = lerp(W.prevIce[c], W.ice[c], alpha);
    const sea = localSeaLevel(W, c);
    const inter = W.intertidal?.[c] || 0;
    let col;
    if (isSubmerged(W, c)) {
      const d = clamp((sea - W.h[c]) * 1.9, 0, 1);
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
      // Sea ice leads / polynyas — not a flat white sheet. Item 142.
      if (ice > 0.35 && ice < 0.85) {
        const lead = (Math.sin(c * 12.9898) * 43758.5453) % 1;
        if (lead > 0.7) {
          col = [lerp(col[0], 40, 0.55), lerp(col[1], 90, 0.55), lerp(col[2], 140, 0.55)];
        } else {
          col = [222, 234, 246];
        }
      } else if (ice >= 0.85) {
        col = [230, 238, 248];
      }
      // Whitecaps / wind roughness — storm brightens the sea
      const wind = Math.hypot(W.windU?.[c] || 0, W.windV?.[c] || 0);
      const seaState = Math.max(wind, W.waveHt?.[c] || 0);
      if (seaState > 0.28 && ice < 0.3) {
        const foam = clamp(Math.pow(seaState, 3) * 0.55, 0, 0.45);
        col = [lerp(col[0], 235, foam), lerp(col[1], 238, foam), lerp(col[2], 245, foam)];
      }
      const sst = W.oceanSurf?.[c];
      if (sst != null && ice < 0.25) {
        const warm = clamp((sst - 0.45) * 1.4, -0.35, 0.45);
        col = [
          col[0] + warm * 28,
          col[1] + warm * 8,
          col[2] - warm * 22,
        ];
      }
      // Rain darkening under storm cells
      if ((W.precip?.[c] || 0) > 0.25 && ice < 0.2) {
        const rk = clamp(W.precip[c], 0, 1) * 0.22;
        col = [col[0] * (1 - rk), col[1] * (1 - rk), col[2] * (1 - rk * 0.65)];
      }
      // Ocean colour from NPP / CDOM / sediment — guild-tinted blooms.
      const npp = W.npp?.[c] || 0;
      const sed = W.sediment?.[c] || 0;
      if (npp > 0.08) {
        const k = clamp(npp, 0, 1) * 0.55;
        const bloomCol = oceanLifeRGB(W, c, npp);
        col = [
          lerp(col[0], bloomCol[0], k),
          lerp(col[1], bloomCol[1], k),
          lerp(col[2], bloomCol[2], k),
        ];
      }
      if (sed > 0.12) {
        const k = clamp(sed, 0, 1) * 0.45;
        col = [lerp(col[0], 180, k), lerp(col[1], 140, k), lerp(col[2], 70, k)];
      }
      // Phytoplankton / reef — guild-tinted
      const bloom = Math.max(life * (W.h[c] < sea && (sea - W.h[c]) < 0.14 ? 1 : 0.35), W.reef[c]);
      if (bloom > 0.12) {
        const k = clamp((bloom - 0.12) / 0.7, 0, 1) * (R.earthLike ? 0.6 : 1);
        if (W.reef[c] > 0.05 && temp > 0.74 && life < 0.15) {
          col = [lerp(col[0], 245, k), lerp(col[1], 242, k), lerp(col[2], 235, k)];
        } else {
          const live = oceanLifeRGB(W, c, bloom);
          col = [
            lerp(col[0], live[0], k * 0.8),
            lerp(col[1], live[1], k * 0.85),
            lerp(col[2], live[2], k * 0.75),
          ];
        }
      }
      // Sediment plumes at river mouths. Item 146.
      if (W.flow?.[c] > 0.25 && (sea - W.h[c]) < 0.08) {
        const k = clamp(W.flow[c], 0, 1) * 0.5;
        col = [lerp(col[0], 190, k), lerp(col[1], 150, k), lerp(col[2], 80, k)];
      }
      // Storm field / surge — named cyclones read as bright rain + muddy surge
      const storm = W.stormField?.[c] || 0;
      const surge = W.surgeField?.[c] || 0;
      const trail = W.stormTrail?.[c] || 0;
      if (trail > 0.12 && ice < 0.4) {
        const tk = clamp(trail, 0, 1) * 0.35;
        col = [lerp(col[0], 255, tk), lerp(col[1], 190, tk * 0.8), lerp(col[2], 70, tk * 0.5)];
      }
      if (storm > 0.08 && ice < 0.35) {
        const sk = clamp(storm, 0, 1);
        col = [
          lerp(col[0], 36, sk * 0.62),
          lerp(col[1], 52, sk * 0.5),
          lerp(col[2], 78, sk * 0.4),
        ];
        if (W.h[c] < sea) {
          col = [
            lerp(col[0], 230, sk * 0.38),
            lerp(col[1], 235, sk * 0.4),
            lerp(col[2], 245, sk * 0.42),
          ];
        }
      }
      if (surge > 0.01) {
        const gk = clamp(surge * 12, 0, 1);
        col = [
          lerp(col[0], 90, gk * 0.4),
          lerp(col[1], 130, gk * 0.35),
          lerp(col[2], 150, gk * 0.45),
        ];
      }
      if (inter > 0.15 && (sea - W.h[c]) < 0.035) {
        col = [
          lerp(col[0], 125, inter * 0.5),
          lerp(col[1], 115, inter * 0.45),
          lerp(col[2], 72, inter * 0.4),
        ];
      }
    } else {
      const e = (W.h[c] - sea) / (1 - sea + 1e-6);
      const extra = R.daisyworld ? { black: W.blackDaisy[c], white: W.whiteDaisy[c] } : null;
      col = R.land(temp, W.moist[c], life, e, ice, extra);
      // Intertidal ochre — coast that breathes with the presentation tide
      if (inter > 0.08) {
        const wet = (W.tideWet?.[c] || 0) * 0.35 + tidePhase(c) * 0.65;
        const mud = [150 + wet * 40, 118 + wet * 22, 68];
        const ik = clamp(inter, 0, 1) * (0.55 + wet * 0.35);
        col = [lerp(col[0], mud[0], ik), lerp(col[1], mud[1], ik), lerp(col[2], mud[2], ik)];
      }
      const biome = W.biome ? BIOMES[W.biome[c]] : '';
      const gnd = biome && GROUND[biome];
      if (gnd && ice < 0.45) {
        const k = life > 0.12 ? 0.16 : 0.34;
        col = [lerp(col[0], gnd[0], k), lerp(col[1], gnd[1], k), lerp(col[2], gnd[2], k)];
      }
      const autumn = Math.max(0, -Math.sin(season) * DIR[c * 3 + 1]);
      if (autumn > 0.3 && life > 0.1 && ice < 0.45
        && (biome === 'tempDeciduous' || biome === 'boreal' || biome === 'tempRainforest')) {
        const k = Math.min(0.4, autumn * 0.45) * Math.min(1, life * 2);
        col = [lerp(col[0], 196, k), lerp(col[1], 108, k), lerp(col[2], 40, k)];
      }
      // Water on land — drip/sheet/stream/river/lake, same ladder as the map
      const wet = waterStage(c);
      if (wet.stage === 'lake' && ice < 0.55) {
        const lk = 0.45 + wet.amount * 0.4;
        col = [lerp(col[0], 12, lk), lerp(col[1], 44, lk), lerp(col[2], 70, lk)];
      } else if ((wet.stage === 'river' || wet.stage === 'stream') && ice < 0.55) {
        const fk = wet.stage === 'river'
          ? Math.min(0.55, wet.amount * 0.95)
          : Math.min(0.28, wet.amount * 0.7);
        col = [lerp(col[0], 16, fk), lerp(col[1], 48, fk), lerp(col[2], 72, fk)];
      } else if (wet.stage === 'pond' && ice < 0.5) {
        const pk = wet.amount * 0.55;
        col = [lerp(col[0], 22, pk), lerp(col[1], 58, pk), lerp(col[2], 78, pk)];
      } else if ((wet.stage === 'sheet' || wet.stage === 'drip') && ice < 0.45) {
        const sk = wet.stage === 'drip' ? wet.amount * 0.12 : wet.amount * 0.32;
        col = [col[0] * (1 - sk), col[1] * (1 - sk * 0.88), col[2] * (1 - sk * 0.55)];
      }
      // Convergent boundaries sit in a slight shadow — plates made this relief
      if (W.bound?.[c] === 1 && ice < 0.4) {
        col = [col[0] * 0.9, col[1] * 0.88, col[2] * 0.86];
      } else if (W.bound?.[c] === 0 && ice < 0.5) {
        // Divergent — young crust, a warm rift
        col = [lerp(col[0], 168, 0.12), lerp(col[1], 78, 0.1), lerp(col[2], 52, 0.08)];
      } else if (W.bound?.[c] === 2 && ice < 0.4) {
        // Transform — gold strain
        col = [lerp(col[0], 210, 0.08), lerp(col[1], 170, 0.06), lerp(col[2], 70, 0.05)];
      }
      const lava = W.lava?.[c] || 0;
      if (lava > 0.04) {
        const k = clamp(lava, 0, 1);
        col = [
          lerp(col[0], 255, k),
          lerp(col[1], 70 + (1 - k) * 40, k),
          lerp(col[2], 18, k * 0.9),
        ];
      }
      const precipL = W.precip?.[c] || 0;
      if (precipL > 0.28 && ice < 0.35) {
        const rk = clamp(precipL, 0, 1) * 0.2;
        col = [col[0] * (1 - rk), col[1] * (1 - rk * 0.9), col[2] * (1 - rk * 0.72)];
      }
      const stormL = W.stormField?.[c] || 0;
      const trailL = W.stormTrail?.[c] || 0;
      const surgeL = W.surgeField?.[c] || 0;
      if (trailL > 0.12 && ice < 0.4) {
        const tk = clamp(trailL, 0, 1) * 0.28;
        col = [lerp(col[0], 255, tk), lerp(col[1], 190, tk * 0.8), lerp(col[2], 70, tk * 0.5)];
      }
      if (stormL > 0.12 && ice < 0.4) {
        const sk = clamp(stormL, 0, 1) * 0.42;
        col = [lerp(col[0], 36, sk), lerp(col[1], 48, sk), lerp(col[2], 72, sk)];
      }
      if (surgeL > 0.01) {
        const gk = clamp(surgeL * 12, 0, 1);
        col = [lerp(col[0], 210, gk * 0.28), lerp(col[1], 110, gk * 0.22), lerp(col[2], 48, gk * 0.18)];
      }
      // Seasonal phenology green wave. Item 140.
      const lat = DIR[c * 3 + 1];
      const spring = Math.max(0, Math.sin(season + lat * 1.2));
      if (!R.daisyworld && life > 0.06 && ice < 0.7) {
        const k = clamp((life - 0.06) / 0.55, 0, 1) * (0.75 + spring * 0.35);
        const live = lifeRGB(W, c, life);
        if (live) {
          const mix = R.earthLike ? (0.4 + k * 0.35) : (0.55 + k * 0.4);
          col = [
            lerp(col[0], live[0], mix),
            lerp(col[1], live[1], mix),
            lerp(col[2], live[2], mix),
          ];
        } else if (R.earthLike) {
          let lush = [lerp(col[0], 22, k * 0.35), lerp(col[1], 140, k * 0.4), lerp(col[2], 48, k * 0.3)];
          if (pigment === 'bchl') lush = [lerp(lush[0], 140, 0.35), lerp(lush[1], 50, 0.35), lerp(lush[2], 120, 0.35)];
          if (pigment === 'retinal') lush = [lerp(lush[0], 180, 0.4), lerp(lush[1], 40, 0.4), lerp(lush[2], 140, 0.4)];
          const mix = 0.35 + k * 0.25;
          col = [lerp(col[0], lush[0], mix), lerp(col[1], lush[1], mix), lerp(col[2], lush[2], mix)];
        } else {
          const neon = [lerp(22, 4, k), lerp(255, 150, k), lerp(12, 42, k)];
          const mix = clamp(0.55 + k * 0.45, 0, 1) * (1 - clamp((ice - 0.35) / 0.5, 0, 1) * 0.6);
          col = [lerp(col[0], neon[0], mix), lerp(col[1], neon[1], mix), lerp(col[2], neon[2], mix)];
        }
      }
      // BIF / ejecta surface hints
      if (W.bifRock?.[c] > 0.2) {
        const k = W.bifRock[c] * 0.4;
        col = [lerp(col[0], 120, k), lerp(col[1], 70, k), lerp(col[2], 40, k)];
      }
      if (W.ejecta?.[c] > 0.15) {
        const k = W.ejecta[c] * 0.35;
        col = [lerp(col[0], 90, k), lerp(col[1], 85, k), lerp(col[2], 80, k)];
      }
      // Stromatolite texture on shores
      if (W.stromatolite?.[c] > 0.2) {
        const k = W.stromatolite[c] * 0.3;
        col = [lerp(col[0], 100, k), lerp(col[1], 110, k), lerp(col[2], 90, k)];
      }
      // Sulfur allotropes. Item 133.
      if (W.sulfurPaint?.[c] > 0.05) {
        const t = W.sulfurPaint[c];
        const sulf = t < 0.3 ? [220, 200, 40] : t < 0.6 ? [220, 120, 30] : [40, 30, 30];
        const k = 0.35;
        col = [lerp(col[0], sulf[0], k), lerp(col[1], sulf[1], k), lerp(col[2], sulf[2], k)];
      }
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
      if (W.state === 'snowball' && life < 0.2) col = [lerp(col[0], 230, 0.5), lerp(col[1], 235, 0.5), lerp(col[2], 245, 0.5)];
      if (W.state === 'moist-greenhouse' && life < 0.2) col = [lerp(col[0], 200, 0.3), lerp(col[1], 100, 0.3), lerp(col[2], 60, 0.3)];
    }
    if (W.dust[c] > 0.1) {
      const d = W.dust[c];
      col = [lerp(col[0], 180, d), lerp(col[1], 140, d), lerp(col[2], 90, d)];
    }
    if (_localWash && _localSet) {
      if (_localSet.has(c)) {
        const k = c === _localFocus ? 0.14 : 0.07;
        col = [
          lerp(col[0], 255, k),
          lerp(col[1], 248, k),
          lerp(col[2], 236, k * 0.8),
        ];
      } else {
        const g = (col[0] + col[1] + col[2]) / 3;
        col = [
          lerp(col[0], g * 0.7, 0.46),
          lerp(col[1], g * 0.7, 0.46),
          lerp(col[2], g * 0.78, 0.46),
        ];
      }
    }
    if (_localHover >= 0 && c === _localHover) {
      col = [
        lerp(col[0], 255, 0.38),
        lerp(col[1], 236, 0.28),
        lerp(col[2], 160, 0.16),
      ];
    }
    // Lab redox-tower hover — light up matching guild cells
    if (_guildHL && W.guildDens?.[_guildHL]) {
      const dens = W.guildDens[_guildHL][c] || 0;
      const rgb = GUILD_RGB[_guildHL];
      if (dens > 0.06 && rgb) {
        const k = 0.35 + dens * 0.55;
        col = [
          lerp(col[0], rgb[0], k),
          lerp(col[1], rgb[1], k),
          lerp(col[2], rgb[2], k),
        ];
      } else {
        col = [
          lerp(col[0], 18, 0.55),
          lerp(col[1], 22, 0.55),
          lerp(col[2], 28, 0.55),
        ];
      }
    }
    const o = c << 2;
    _cellDat[o] = col[0] | 0; _cellDat[o + 1] = col[1] | 0; _cellDat[o + 2] = col[2] | 0;
    _cellDat[o + 3] = clamp(temp, 0, 1) * 255 | 0;
  }
  spreadVertexDat();
  if (gl) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.dat);
    if (overlayMode && overlayMode !== 'none') applyOverlay(W, vDat, vCell, GNV, overlayMode);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vDat);
    uploadFieldTextures(alpha);
  }
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

const _meshGPU = new Map();
function gpuMesh(key, mesh) {
  let g = _meshGPU.get(key);
  if (g) return g;
  const pos = gl.createBuffer();
  const idx = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  g = { pos, idx, count: mesh.indices.length };
  _meshGPU.set(key, g);
  return g;
}

function drawEntityMeshes(MVP, sun, fade) {
  if (!meshProg || fade < 0.45) return;
  const lim = Math.min(ENT.n, fade > 0.85 ? 48 : 24);
  gl.useProgram(meshProg);
  gl.uniformMatrix4fv(meshProg.u.uMVP, false, MVP);
  gl.uniform3fv(meshProg.u.uSun, sun);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  let drawn = 0;
  for (let i = 0; i < ENT.n && drawn < lim; i++) {
    const m = ENT.meta[i];
    if (!m?.plan) continue;
    const o = i * 8;
    const ox = ENT.data[o], oy = ENT.data[o + 1], oz = ENT.data[o + 2];
    const sc = ENT.data[o + 3] * 2.8;
    const mesh = meshForEntity(m);
    const key = `${m.plan.limbs}-${m.plan.segments}-${m.plan.appendage}`;
    const g = gpuMesh(key, mesh);
    const up = [ox, oy, oz];
    const len = Math.hypot(up[0], up[1], up[2]) || 1;
    up[0] /= len; up[1] /= len; up[2] /= len;
    let right = [-up[2], 0, up[0]];
    let rl = Math.hypot(right[0], right[1], right[2]);
    if (rl < 1e-5) right = [1, 0, 0];
    else { right[0] /= rl; right[2] /= rl; }
    const fwd = [
      up[1] * right[2] - up[2] * right[1],
      up[2] * right[0] - up[0] * right[2],
      up[0] * right[1] - up[1] * right[0],
    ];
    gl.uniform3fv(meshProg.u.uOrigin, [ox, oy, oz]);
    gl.uniform1f(meshProg.u.uScale, sc);
    gl.uniform3fv(meshProg.u.uUp, up);
    gl.uniform3fv(meshProg.u.uRight, right);
    gl.uniform3fv(meshProg.u.uFwd, fwd);
    gl.uniform3fv(meshProg.u.uTint, [ENT.data[o + 5], ENT.data[o + 6], ENT.data[o + 7]]);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.pos);
    const ap = gl.getAttribLocation(meshProg, 'aPos');
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.idx);
    gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_SHORT, 0);
    drawn++;
  }
  disableAll();
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
  const a3 = gl.getAttribLocation(p, 'aFieldUV');
  if (a3 >= 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.fieldUV);
    gl.enableVertexAttribArray(a3); gl.vertexAttribPointer(a3, 2, gl.FLOAT, false, 0, 0);
  }
}

/** Pack sim fields into GPU atlases. Next backlog item 1 (gbuf). */
export function uploadFieldTextures(alpha = 1) {
  if (!gl || !fieldTex0 || !fieldPix0) return;
  for (let c = 0; c < NC; c++) {
    const f = (c / NF) | 0;
    const rem = c - f * NF;
    const j = (rem / N) | 0;
    const i = rem - j * N;
    const px = (j * FIELD_W + f * N + i) * 4;
    const life = lerp(W.prevLife[c], W.life[c], alpha);
    const ice = lerp(W.prevIce[c], W.ice[c], alpha);
    fieldPix0[px] = clamp(life, 0, 1) * 255;
    fieldPix0[px + 1] = clamp(ice, 0, 1) * 255;
    fieldPix0[px + 2] = clamp(W.moist[c] || 0, 0, 1) * 255;
    // Pack max(sediment, intertidal) + clouds — coast reads without overlay
    const sed = Math.max(W.sediment?.[c] || 0, W.intertidal?.[c] || 0);
    const sedQ = Math.min(15, (clamp(sed, 0, 1) * 15) | 0);
    const cldQ = Math.min(15, (clamp(W.clouds?.[c] || 0, 0, 1) * 15) | 0);
    fieldPix0[px + 3] = sedQ + cldQ * 16;

    const guild = dominantGuildAt(W, c);
    const gi = guild != null ? (GUILD_INDEX[guild] ?? 0) : 0;
    const localSea = localSeaLevel(W, c);
    const hs = clamp(0.5 + (W.h[c] - localSea) * 2.2, 0, 1);
    const wind = Math.hypot(W.windU?.[c] || 0, W.windV?.[c] || 0);
    const seaState = Math.max(wind, W.waveHt?.[c] || 0);
    fieldPix1[px] = clamp(W.npp?.[c] || 0, 0, 1) * 255;
    fieldPix1[px + 1] = (gi / Math.max(1, GUILDS.length - 1)) * 255;
    fieldPix1[px + 2] = hs * 255;
    fieldPix1[px + 3] = clamp(seaState, 0, 1) * 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, fieldTex0);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FIELD_W, FIELD_H, gl.RGBA, gl.UNSIGNED_BYTE, fieldPix0);
  gl.bindTexture(gl.TEXTURE_2D, fieldTex1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FIELD_W, FIELD_H, gl.RGBA, gl.UNSIGNED_BYTE, fieldPix1);
}

export function drawScene(proj, view, camPos, inXR, S, hands) {
  const R = W.rule;
  // Sun tracks seasons on the ecliptic; obliquity sets how far it climbs
  const sunY = Math.sin(W.season || 0) * Math.sin(W.obliquity || 0);
  const sun = [Math.cos(S.sunAng), sunY, Math.sin(S.sunAng)];
  const sl = Math.hypot(...sun) || 1; sun[0] /= sl; sun[1] /= sl; sun[2] /= sl;

  const scale = inXR ? S.scaleXR : 1;
  const px = inXR ? S.posXR[0] : (S.camPanX || 0);
  const py = inXR ? S.posXR[1] : (S.camPanY || 0);
  const pz = inXR ? S.posXR[2] : 0;
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
    if (W._iceShell) {
      // Ice-shell stack: mantle → ocean → lid
      const layers = [
        { s: 0.55, c: [0.55, 0.22, 0.1] },
        { s: 0.72, c: [0.12, 0.35, 0.55] },
        { s: 0.88, c: [0.75, 0.85, 0.95] },
      ];
      for (const ly of layers) {
        m4trs(TMP, S.q, px, py, pz, scale * ly.s);
        gl.useProgram(healthProg);
        gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
        gl.uniform1f(healthProg.u.uScale, 1);
        gl.uniform3fv(healthProg.u.uCol, ly.c);
        gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
        gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
      }
    } else {
      m4trs(TMP, S.q, px, py, pz, scale * 0.72);
      gl.useProgram(healthProg);
      gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
      gl.uniform1f(healthProg.u.uScale, 1);
      gl.uniform3fv(healthProg.u.uCol, [0.55, 0.22, 0.08]);
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
      gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
      m4trs(TMP, S.q, px, py, pz, scale * 0.32);
      gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
      gl.uniform3fv(healthProg.u.uCol, [0.95, 0.45, 0.12]);
      gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    }
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
  // Night lights from settlements
  gl.uniform1f(planetProg.u.uNight, Math.max(
    W.meanLife > 0.12 ? W.meanLife * 1.15 : 0,
    (W.build && W.meanLife > 0.05) ? 0.15 : 0,
    (W._cityLights || 0) * 1.2
  ));
  if (planetProg.u.uMoon) {
    const moon = (W.moon && W.moon.mass > 0.05) ? clamp(W.moonIllum ?? 0.5, 0, 1) : 0;
    gl.uniform1f(planetProg.u.uMoon, moon);
  }
  gl.uniform1f(planetProg.u.uDaisy, R.daisyworld ? 1 : 0);
  gl.uniform1f(planetProg.u.uEarth, R.earthLike ? 1 : 0);
  gl.uniform1f(planetProg.u.uOpacity, opacity);
  gl.uniform1f(planetProg.u.uXRay, xray);
  if (planetProg.u.uOzone) gl.uniform1f(planetProg.u.uOzone, W.ozone || 0);
  if (planetProg.u.uAerosol) {
    gl.uniform1f(planetProg.u.uAerosol, clamp((W.gases.dust || 0) + (W.gases.sulphate || 0) * 2, 0, 1));
  }
  if (planetProg.u.uMag) {
    const mag = (R.magnetosphere || 0) * (R.earthLike && !R.deepTime ? 0.22 : 1);
    gl.uniform1f(planetProg.u.uMag, mag);
  }
  if (planetProg.u.uTime) gl.uniform1f(planetProg.u.uTime, (S._t || 0) * 0.001);
  if (planetProg.u.uHaze) gl.uniform1f(planetProg.u.uHaze, W.hazeAntiGreenhouse || 0);
  // Physical-ish exposure from insolation (hdr lite) + eye adaptation
  const baseExpo = clamp(0.85 + Math.log2(Math.max(0.05, W.solar || 1)) * 0.12, 0.55, 1.85);
  const adapt = S.exposure != null ? S.exposure : baseExpo;
  if (planetProg.u.uExposure) gl.uniform1f(planetProg.u.uExposure, adapt * 1.15);
  // Storm + cloud shadow uniforms — count convective cells
  let storm = 0, cloudMean = 0, cn = 0;
  if (W.clouds && W.precip) {
    for (let c = 0; c < NC; c += 17) {
      cloudMean += W.clouds[c];
      const convective = (W.converg?.[c] || 0) > 0.12;
      if (W.clouds[c] > 0.5 && ((W.precip[c] || 0) > 0.28 || convective)) storm += 1;
      cn++;
    }
    cloudMean /= Math.max(1, cn);
    storm = clamp(storm / Math.max(1, cn * 0.12), 0, 1);
  }
  if (planetProg.u.uStorm) gl.uniform1f(planetProg.u.uStorm, storm);
  if (planetProg.u.uCloudShadow) gl.uniform1f(planetProg.u.uCloudShadow, cloudMean);
  if (planetProg.u.uMagTilt) {
    gl.uniform1f(planetProg.u.uMagTilt, (W.obliquity || 0) * 0.35 + (W.magTilt || 0.12));
  }
  if (planetProg.u.uField0 && fieldTex0) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex0);
    gl.uniform1i(planetProg.u.uField0, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex1);
    gl.uniform1i(planetProg.u.uField1, 2);
    if (planetProg.u.uScatter && scatterTex) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, scatterTex);
      gl.uniform1i(planetProg.u.uScatter, 3);
    }
    if (planetProg.u.uScatterMs && scatterMsTex) {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, scatterMsTex);
      gl.uniform1i(planetProg.u.uScatterMs, 4);
    }
    gl.activeTexture(gl.TEXTURE0);
  }
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
    const act = Math.min(1,
      (W.life[_localFocus] || 0) + (W.ash?.[_localFocus] || 0) + (W.build?.[_localFocus] || 0));
    const pulse = 0.82 + Math.sin(presentTime() * 2.15) * 0.16 * (0.35 + act);
    gl.uniform4f(flatProg.u.uCol, 1.0, 0.82 + pulse * 0.08, 0.32 + pulse * 0.08, 0.62 + pulse * 0.32);
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

  /* current and wind streaks — the fluids as motion */
  {
    if (!_flowBuf) _flowBuf = new Float32Array(1600 * 6);
    const want = overlayMode === 'wind' ? 'wind'
      : overlayMode === 'current' || overlayMode === 'upwell' ? 'ocean'
      : 'all';
    FLOW_COUNT = fillFlowStreaks(_flowBuf, want === 'all' ? 'ocean' : want);
    if (FLOW_COUNT > 0) {
      gl.useProgram(flatProg);
      gl.uniformMatrix4fv(flatProg.u.uMVP, false, MVP);
      const oceanish = want !== 'wind';
      if (oceanish) gl.uniform4f(flatProg.u.uCol, 0.45, 0.88, 0.95, overlayMode === 'current' ? 0.72 : 0.28);
      else gl.uniform4f(flatProg.u.uCol, 0.92, 0.96, 1.0, 0.38);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.flowStreaks);
      gl.bufferData(gl.ARRAY_BUFFER, _flowBuf.subarray(0, FLOW_COUNT * 3), gl.DYNAMIC_DRAW);
      l = gl.getAttribLocation(flatProg, 'aPos');
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.drawArrays(gl.LINES, 0, FLOW_COUNT);
      gl.depthMask(true); gl.disable(gl.BLEND);
      disableAll();
    }
    if (want === 'all' || want === 'wind') {
      const nW = fillFlowStreaks(_flowBuf, 'wind');
      if (nW > 0 && overlayMode === 'wind') {
        gl.useProgram(flatProg);
        gl.uniformMatrix4fv(flatProg.u.uMVP, false, MVP);
        gl.uniform4f(flatProg.u.uCol, 0.95, 0.97, 1.0, 0.42);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.flowStreaks);
        gl.bufferData(gl.ARRAY_BUFFER, _flowBuf.subarray(0, nW * 3), gl.DYNAMIC_DRAW);
        l = gl.getAttribLocation(flatProg, 'aPos');
        gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.depthMask(false);
        gl.drawArrays(gl.LINES, 0, nW);
        gl.depthMask(true); gl.disable(gl.BLEND);
        disableAll();
      }
    }
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
    if (cloudProg.u.uTime) gl.uniform1f(cloudProg.u.uTime, (S._t || 0) * 0.001);
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

    // Local LOD — low-poly meshes for entities with body plans (retire pure billboards close-in)
    if (S.entFade > 0.45 && meshProg) {
      drawEntityMeshes(MVP, sun, S.entFade);
    }
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
    gl.uniform1f(atmoProg.u.uAtmoK, R.atmoStrength * (1.05 + (W.gases.dust || 0) * 0.5));
    if (atmoProg.u.uOzone) gl.uniform1f(atmoProg.u.uOzone, W.ozone || 0);
    if (atmoProg.u.uAerosol) {
      gl.uniform1f(atmoProg.u.uAerosol, clamp((W.gases.dust || 0) + (W.gases.sulphate || 0) * 2, 0, 1));
    }
    if (atmoProg.u.uMag) {
      const mag = (R.magnetosphere || 0) * (R.earthLike && !R.deepTime ? 0.22 : 1);
      gl.uniform1f(atmoProg.u.uMag, mag);
    }
    if (atmoProg.u.uTime) gl.uniform1f(atmoProg.u.uTime, (S._t || 0) * 0.001);
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

  /* orbit guides — spin axis, equator, ecliptic (tilt becomes visible) */
  {
    const climTools = S.orbitGuides || S.orbitFlash > (S._t || 0)
      || ['tilt', 'spin', 'moon', 'solar', 'shade'].includes(S.activeTool || '');
    const flash = S.orbitFlash > (S._t || 0);
    const show = climTools || flash || S.orbitGuides;
    if (show) {
      ensureOrbitGuides(W.obliquity || 0);
      const a = flash ? 0.95 : (climTools ? 0.7 : 0.32);
      gl.useProgram(flatProg);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      // Axis (cyan) — day spin poles
      drawOrbitLines(flatProg, MVP, buf.orbitAxis, ORBIT_AXIS_COUNT, [0.45, 0.85, 1.0, a]);
      // Equator (soft white)
      drawOrbitLines(flatProg, MVP, buf.orbitEq, ORBIT_EQ_COUNT, [0.85, 0.9, 1.0, a * 0.45]);
      // Ecliptic (gold) — orbital plane; angle from equator = obliquity
      drawOrbitLines(flatProg, MVP, buf.orbitEcl, ORBIT_ECL_COUNT, [1.0, 0.78, 0.32, a * 0.85]);
      gl.depthMask(true); gl.disable(gl.BLEND); disableAll();
    }
  }

  /* Moon — orbit + phase synced to tidal lunar angle */
  if (W.moon && W.moon.mass > 0.05) {
    const ε = W.obliquity || 0;
    const dist = Math.max(0.38, W.moon.distance || 1);
    const mass = Math.max(0.2, Math.min(2.5, W.moon.mass || 1));
    const ang = W.moonAngle != null ? W.moonAngle : ((S._t || 0) * 0.00012) / dist;
    const s = Math.sin(ε), c = Math.cos(ε);
    const ux = -c, uy = s;
    const re = 1.55 + dist * 0.45;
    const lx = (ux * Math.cos(ang)) * re;
    const ly = (uy * Math.cos(ang)) * re;
    const lz = Math.sin(ang) * re;
    const wx = MODEL[0] * lx + MODEL[4] * ly + MODEL[8] * lz + MODEL[12];
    const wy = MODEL[1] * lx + MODEL[5] * ly + MODEL[9] * lz + MODEL[13];
    const wz = MODEL[2] * lx + MODEL[6] * ly + MODEL[10] * lz + MODEL[14];
    const moonR = (inXR ? 0.018 : 0.055) * Math.cbrt(mass) * (1.15 / dist) * scale;
    m4trs(TMP, [0, 0, 0, 1], wx, wy, wz, moonR);
    const toMoon = [wx - px, wy - py, wz - pz];
    const ml = Math.hypot(...toMoon) || 1;
    const mdir = [toMoon[0] / ml, toMoon[1] / ml, toMoon[2] / ml];
    // Lit fraction from sun; earthshine on dark limb
    const sunDot = mdir[0] * sun[0] + mdir[1] * sun[1] + mdir[2] * sun[2];
    const lit = W.moonIllum != null
      ? clamp(W.moonIllum, 0.06, 1)
      : clamp(0.5 + 0.5 * sunDot, 0.06, 1);
    const earthshine = 0.1 + (W.iceFrac || 0) * 0.08 + (W.meanLife || 0) * 0.04;
    const shade = lit * 0.88 + earthshine * (1 - lit);
    // Warm crescent rim when nearly new
    const warm = lit < 0.35 ? 1.08 : 1;
    gl.useProgram(healthProg);
    gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
    gl.uniform1f(healthProg.u.uScale, 1);
    gl.uniform3fv(healthProg.u.uCol, [0.72 * shade * warm, 0.68 * shade, 0.58 * shade]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.sph);
    l = gl.getAttribLocation(healthProg, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
    gl.enable(gl.DEPTH_TEST);
    gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    disableAll();
  }

  /* L1 solar shade — dark disc between sun and planet */
  if ((W.solarShade || 0) > 0.002) {
    const d = 1.85 * scale;
    const sx = px - sun[0] * d, sy = py - sun[1] * d, sz = pz - sun[2] * d;
    const shadeR = (0.04 + W.solarShade * 0.12) * scale * (inXR ? 0.5 : 1);
    m4trs(TMP, [0, 0, 0, 1], sx, sy, sz, shadeR);
    gl.useProgram(healthProg);
    gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
    gl.uniform1f(healthProg.u.uScale, 1);
    gl.uniform3fv(healthProg.u.uCol, [0.08, 0.09, 0.12]);
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
      else if (h.gesture === 'pinch') gl.uniform4f(flatProg.u.uCol, 0.9, 0.7, 0.3, 1.0);
      else gl.uniform4f(flatProg.u.uCol, 0.30, 0.36, 0.48, 1.0);
      gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    }
    disableAll();
  }

  /* Orrery table — shelf worlds as tinted mini spheres around a star */
  if (S.table?.enabled && S.table.slots?.length) {
    tickTable(S.table, 0.016);
    const origin = inXR ? [0, 0, 0] : [0, -1.15, 0];
    const th = S.table.height || 0.92;
    const xz = inXR ? 1 : 0.38;
    gl.useProgram(healthProg);
    m4trs(TMP, [0, 0, 0, 1], origin[0], origin[1] + th - 0.04, origin[2], (S.table.radius || 0.55) * xz);
    gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
    gl.uniform1f(healthProg.u.uScale, 1);
    gl.uniform3fv(healthProg.u.uCol, [0.16, 0.14, 0.12]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.sph);
    l = gl.getAttribLocation(healthProg, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.sphIdx);
    gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    const starR = (S.table.starScale || 0.04) * (inXR ? 1 : 0.4);
    m4trs(TMP, [0, 0, 0, 1], origin[0], origin[1] + th + 0.05, origin[2], starR);
    gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
    gl.uniform3fv(healthProg.u.uCol, [1.0, 0.85, 0.45]);
    gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    for (const sl of S.table.slots) {
      if (sl.live) continue;
      const p = slotWorldPos(S.table, sl, origin, xz);
      const sc = (sl.scale || 0.055) * (inXR ? 1 : 0.5);
      const active = S.table.activeId === sl.id;
      m4trs(TMP, [0, 0, 0, 1], p[0], p[1], p[2], sc * (active ? 1.15 : 1));
      gl.uniformMatrix4fv(healthProg.u.uMVP, false, m4mul(m4(), m4mul(m4(), proj, view), TMP));
      const tint = sl.tint || [0.35, 0.55, 0.75];
      gl.uniform3fv(healthProg.u.uCol, active
        ? [Math.min(1, tint[0] + 0.25), Math.min(1, tint[1] + 0.2), Math.min(1, tint[2] + 0.15)]
        : tint);
      gl.drawElements(gl.TRIANGLES, SPH_COUNT, gl.UNSIGNED_INT, 0);
    }
    disableAll();
  }
}

export { vIdx as planetIndexCount };
