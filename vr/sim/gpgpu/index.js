/** GPGPU field engine — WebGL2 float ping-pong atlases on the cube-sphere.
 *
 *  Future-proofing:
 *  - N is per-slot (not baked into shaders)
 *  - Multiple world slots share one GL context (orrery table / twin runs)
 *  - Climate lives on GPU; CPU sync is explicit for bio/instruments
 *  - RGBA16F when color-renderable; RGBA32F fallback; else CPU
 *
 *  Atlas: width = 6N, height = N (same strip as gbuf).
 */

import { N as DEFAULT_N, NBR, DIR } from '../../sphere.js';
import { VS_FULLSCREEN, FS_CLIMATE_STEP } from './shaders.js';
import { greenhouseFromGases } from '../../rulesets.js';
import { geometricInsolation } from '../atmo.js';

let _shared = null;

export function getGpgpu() { return _shared; }
export function isGpgpuReady() { return !!( _shared && _shared.ok); }

export function initGpgpu(gl, opts = {}) {
  if (!gl) return null;
  if (_shared?.ok && _shared.gl === gl) return _shared;
  try {
    _shared = new GpgpuEngine(gl, opts);
    if (!_shared.ok) _shared = null;
  } catch (e) {
    console.warn('[gpgpu] init failed', e);
    _shared = null;
  }
  return _shared;
}

export function destroyGpgpu() {
  if (_shared) _shared.destroy();
  _shared = null;
}

/** Run one climate GPGPU tick into W, or return false for CPU fallback. */
export function gpgpuClimateTick(W) {
  const eng = _shared;
  if (!eng?.ok || !eng.enabled || !W || W._gpgpuOff) return false;
  const id = W._gpgpuSlot || 'primary';
  const R = W.rule || {};
  const rot = W.rotationPeriod || 1;
  const fScale = Math.min(4, Math.max(0.15, 1 / Math.max(0.2, Math.abs(rot))));
  const gh = W.greenhouse ?? greenhouseFromGases(W.gases || {}, R);
  return eng.syncTick(id, W, {
    gh,
    lapse: 0.45 * (R.gravity || 1),
    solar: (W.solar || 1) * (W._solarMod || 1),
    sea: W.seaLevel,
    airless: !!(R.airless || (W.gases && Object.values(W.gases).reduce((s, v) => s + v, 0) < 0.01)),
    freeze: R.freeze ?? 0.32,
    /* The same two cloud coefficients `atmoTick` uses. This shader carries its
       own copy of the temperature equation, which is a standing invitation for
       the two to drift — and they had: the GPU path had no cloud greenhouse at
       all and reflected harder, so the planet the browser showed was several
       kelvin colder than the one the tests measured, on the same world. If a
       third term is ever added to `eq`, it has to be added here too. */
    cloudGh: (R.earthLike && !R.deepTime) ? 0.135 : 0.16,
    cloudAlb: (R.earthLike && !R.deepTime) ? 0.2 : 0.28,
    rateT: 0.08,
    rateM: 0.12,
    rateA: 0.1,
    fScale,
    tidallyLocked: !!R.tidallyLocked,
    sunDir: W._sunDir || [1, 0.3, 0],
  });
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log);
  }
  return s;
}

function link(gl, vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p));
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const nm = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[nm] = gl.getUniformLocation(p, nm);
  }
  p.u = u;
  return p;
}

function cellToUV(c, N) {
  const NF = N * N;
  const f = (c / NF) | 0;
  const rem = c - f * NF;
  const j = (rem / N) | 0;
  const i = rem - j * N;
  return [(f * N + i + 0.5) / (6 * N), (j + 0.5) / N];
}

export class GpgpuEngine {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.ok = false;
    this.slots = new Map();
    this.maxSlots = opts.maxSlots || 8;
    this.stats = { ticks: 0, ms: 0, lastMs: 0, readbacks: 0 };
    this.enabled = opts.enabled !== false;

    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');

    this.maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 8192;
    this.internalFormat = gl.RGBA32F;
    this.type = gl.FLOAT;
    if (!this._probeFbo()) {
      this.internalFormat = gl.RGBA16F;
      this.type = gl.HALF_FLOAT;
      if (!this._probeFbo()) {
        console.warn('[gpgpu] float FBOs unavailable');
        return;
      }
    }

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    this.progClimate = link(gl, VS_FULLSCREEN, FS_CLIMATE_STEP);
    this.ok = true;
    console.info('[gpgpu] ready', this.internalFormat === gl.RGBA16F ? 'RGBA16F' : 'RGBA32F');
  }

  _probeFbo() {
    const gl = this.gl;
    const tex = this._makeTex(4, 4);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return ok;
  }

  _makeTex(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, w, h, 0, gl.RGBA, this.type, null);
    return tex;
  }

  _makeFbo(texA, texB) {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texB, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (st !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('GPGPU FBO incomplete: 0x' + st.toString(16));
    }
    return fbo;
  }

  createSlot(id, opts = {}) {
    if (!this.ok) return null;
    if (this.slots.has(id)) this.destroySlot(id);
    if (this.slots.size >= this.maxSlots) return null;

    const N = opts.N || DEFAULT_N;
    const NF = N * N;
    const NC = 6 * NF;
    const AW = 6 * N;
    const H = N;
    if (AW > this.maxTexSize || H > this.maxTexSize) {
      console.warn(`[gpgpu] atlas ${AW}×${H} exceeds MAX_TEXTURE_SIZE ${this.maxTexSize}`);
      return null;
    }
    const nbr = opts.nbr || NBR;
    const dir = opts.dir || DIR;
    const gl = this.gl;

    const nbr0 = new Float32Array(AW * H * 4);
    const nbr1 = new Float32Array(AW * H * 4);
    const dirPix = new Float32Array(AW * H * 4);
    for (let c = 0; c < NC; c++) {
      const f = (c / NF) | 0;
      const rem = c - f * NF;
      const j = (rem / N) | 0;
      const i = rem - j * N;
      const px = (j * AW + f * N + i) * 4;
      const a = cellToUV(nbr[c * 4], N);
      const b = cellToUV(nbr[c * 4 + 1], N);
      const c2 = cellToUV(nbr[c * 4 + 2], N);
      const d = cellToUV(nbr[c * 4 + 3], N);
      nbr0[px] = a[0]; nbr0[px + 1] = a[1]; nbr0[px + 2] = b[0]; nbr0[px + 3] = b[1];
      nbr1[px] = c2[0]; nbr1[px + 1] = c2[1]; nbr1[px + 2] = d[0]; nbr1[px + 3] = d[1];
      dirPix[px] = dir[c * 3];
      dirPix[px + 1] = dir[c * 3 + 1];
      dirPix[px + 2] = dir[c * 3 + 2];
      dirPix[px + 3] = 1;
    }

    const mkLut = (data) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, AW, H, 0, gl.RGBA, gl.FLOAT, data);
      return tex;
    };

    const slot = {
      id, N, NF, NC, W: AW, H,
      climate: [this._makeTex(AW, H), this._makeTex(AW, H)],
      flow: [this._makeTex(AW, H), this._makeTex(AW, H)],
      geo: this._makeTex(AW, H),
      sun: this._makeTex(AW, H),
      nbr0: mkLut(nbr0),
      nbr1: mkLut(nbr1),
      dir: mkLut(dirPix),
      ping: 0,
      climateCPU: new Float32Array(AW * H * 4),
      flowCPU: new Float32Array(AW * H * 4),
      geoCPU: new Float32Array(AW * H * 4),
      sunCPU: new Float32Array(AW * H * 4),
      readback: new Float32Array(AW * H * 4),
    };
    slot.fbo = [
      this._makeFbo(slot.climate[0], slot.flow[0]),
      this._makeFbo(slot.climate[1], slot.flow[1]),
    ];
    this.slots.set(id, slot);
    return slot;
  }

  destroySlot(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    const gl = this.gl;
    const del = (t) => t && gl.deleteTexture(t);
    slot.climate.forEach(del);
    slot.flow.forEach(del);
    del(slot.geo); del(slot.sun); del(slot.nbr0); del(slot.nbr1); del(slot.dir);
    slot.fbo.forEach((f) => f && gl.deleteFramebuffer(f));
    this.slots.delete(id);
  }

  destroy() {
    for (const id of [...this.slots.keys()]) this.destroySlot(id);
    const gl = this.gl;
    if (this.quad) gl.deleteBuffer(this.quad);
    if (this.progClimate) gl.deleteProgram(this.progClimate);
    this.ok = false;
  }

  uploadWorld(id, W) {
    const slot = this.slots.get(id);
    if (!slot) return false;
    const { N, NF, NC, W: AW, climateCPU, flowCPU, geoCPU, sunCPU } = slot;
    const sea = W.seaLevel;
    const sun = W._sunDir || [1, 0.3, 0];
    for (let c = 0; c < NC; c++) {
      const f = (c / NF) | 0;
      const rem = c - f * NF;
      const j = (rem / N) | 0;
      const i = rem - j * N;
      const px = (j * AW + f * N + i) * 4;
      climateCPU[px] = W.temp[c];
      climateCPU[px + 1] = W.moist[c];
      climateCPU[px + 2] = W.ice[c];
      climateCPU[px + 3] = W.clouds[c];
      flowCPU[px] = W.windU[c];
      flowCPU[px + 1] = W.windV[c];
      flowCPU[px + 2] = W.precip[c];
      flowCPU[px + 3] = W.ash[c];
      geoCPU[px] = W.h[c];
      geoCPU[px + 1] = sea;
      geoCPU[px + 2] = W.dust?.[c] || 0;
      geoCPU[px + 3] = W.dust?.[c] || W.gases?.dust || 0;
      sunCPU[px] = geometricInsolation(W, c, sun);
      sunCPU[px + 1] = sunCPU[px + 2] = sunCPU[px + 3] = 0;
    }
    const ping = slot.ping;
    this._upload(slot.climate[ping], climateCPU, AW, slot.H);
    this._upload(slot.flow[ping], flowCPU, AW, slot.H);
    this._upload(slot.geo, geoCPU, AW, slot.H);
    this._upload(slot.sun, sunCPU, AW, slot.H);
    return true;
  }

  _upload(tex, data, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, w, h, 0, gl.RGBA, gl.FLOAT, data);
  }

  tick(id, uniforms = {}) {
    const slot = this.slots.get(id);
    if (!slot || !this.enabled) return 0;
    const gl = this.gl;
    const t0 = performance.now();
    const src = slot.ping;
    const dst = 1 - src;

    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevViewport = gl.getParameter(gl.VIEWPORT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.fbo[dst]);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, slot.W, slot.H);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    const p = this.progClimate;
    gl.useProgram(p);
    this._bind(0, slot.climate[src], p.u.uClimate);
    this._bind(1, slot.geo, p.u.uGeo);
    this._bind(2, slot.flow[src], p.u.uFlow);
    this._bind(3, slot.sun, p.u.uSun);
    this._bind(4, slot.nbr0, p.u.uNbr0);
    this._bind(5, slot.nbr1, p.u.uNbr1);
    this._bind(6, slot.dir, p.u.uDir);
    const set = (name, v) => { if (p.u[name]) gl.uniform1f(p.u[name], v); };
    set('uGh', uniforms.gh ?? 0.1);
    set('uLapse', uniforms.lapse ?? 0.45);
    set('uSolar', uniforms.solar ?? 1);
    set('uSea', uniforms.sea ?? 0);
    set('uAirless', uniforms.airless ? 1 : 0);
    set('uFreeze', uniforms.freeze ?? 0.32);
    set('uCloudGh', uniforms.cloudGh ?? 0.135);
    set('uCloudAlb', uniforms.cloudAlb ?? 0.2);
    set('uRateT', uniforms.rateT ?? 0.08);
    set('uRateM', uniforms.rateM ?? 0.12);
    set('uRateA', uniforms.rateA ?? 0.1);
    set('uFScale', uniforms.fScale ?? 1);
    set('uTidallyLocked', uniforms.tidallyLocked ? 1 : 0);
    const sun = uniforms.sunDir || [1, 0.3, 0];
    if (p.u.uSunDir) gl.uniform3f(p.u.uSunDir, sun[0], sun[1], sun[2]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const loc = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(loc);

    slot.ping = dst;
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    gl.drawBuffers([gl.BACK]);

    const ms = performance.now() - t0;
    this.stats.ticks++;
    this.stats.ms += ms;
    this.stats.lastMs = ms;
    return ms;
  }

  _bind(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (loc) gl.uniform1i(loc, unit);
  }

  downloadClimate(id, W) {
    const slot = this.slots.get(id);
    if (!slot) return false;
    const gl = this.gl;
    const ping = slot.ping;
    const { N, NF, NC, W: AW, H, readback } = slot;
    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.fbo[ping]);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, AW, H, gl.RGBA, gl.FLOAT, readback);
    for (let c = 0; c < NC; c++) {
      const f = (c / NF) | 0;
      const rem = c - f * NF;
      const j = (rem / N) | 0;
      const i = rem - j * N;
      const px = (j * AW + f * N + i) * 4;
      W.temp[c] = readback[px];
      W.moist[c] = readback[px + 1];
      W.ice[c] = readback[px + 2];
      /* Clouds stay CPU-owned. The shader keeps a cloud channel because its
         albedo and greenhouse terms need one, but its formation rule is four
         lines against `cloudsTick`'s relative humidity, convergence, fronts and
         ash — so reading it back replaced the better field with the cruder one
         every second tick, and only in the browser. `world.js` now runs
         `cloudsTick` on this path; the shader gets the result at the next upload. */ 
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.stats.readbacks++;
    return true;
  }

  downloadFlow(id, W) {
    const slot = this.slots.get(id);
    if (!slot) return false;
    const gl = this.gl;
    const ping = slot.ping;
    const { N, NF, NC, W: AW, H, readback } = slot;
    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.fbo[ping]);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0, 0, AW, H, gl.RGBA, gl.FLOAT, readback);
    for (let c = 0; c < NC; c++) {
      const f = (c / NF) | 0;
      const rem = c - f * NF;
      const j = (rem / N) | 0;
      const i = rem - j * N;
      const px = (j * AW + f * N + i) * 4;
      W.windU[c] = readback[px];
      W.windV[c] = readback[px + 1];
      W.precip[c] = readback[px + 2];
      W.ash[c] = readback[px + 3];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  /** Both channels, for a caller that wants the shader's own flow field.
   *  Nothing in the app does — `syncTick` reads climate only, so the CPU keeps
   *  ownership of the wind — but the pair is kept for debugging the kernels. */
  downloadWorld(id, W) {
    return this.downloadClimate(id, W) && this.downloadFlow(id, W);
  }

  /** Active climate float texture (for optional shader sampling). */
  getClimateTexture(id = 'primary') {
    const slot = this.slots.get(id);
    if (!slot) return null;
    return slot.climate[slot.ping];
  }

  /** Upload only sun + geo (cheap resident path). */
  uploadSunGeo(id, W) {
    const slot = this.slots.get(id);
    if (!slot) return false;
    const { N, NF, NC, W: AW, geoCPU, sunCPU } = slot;
    const sea = W.seaLevel;
    const sun = W._sunDir || [1, 0.3, 0];
    for (let c = 0; c < NC; c++) {
      const f = (c / NF) | 0;
      const rem = c - f * NF;
      const j = (rem / N) | 0;
      const i = rem - j * N;
      const px = (j * AW + f * N + i) * 4;
      geoCPU[px] = W.h[c];
      geoCPU[px + 1] = sea;
      geoCPU[px + 2] = W.dust?.[c] || 0;
      geoCPU[px + 3] = W.dust?.[c] || W.gases?.dust || 0;
      sunCPU[px] = geometricInsolation(W, c, sun);
      sunCPU[px + 1] = sunCPU[px + 2] = sunCPU[px + 3] = 0;
    }
    this._upload(slot.geo, geoCPU, AW, slot.H);
    this._upload(slot.sun, sunCPU, AW, slot.H);
    return true;
  }

  syncTick(id, W, uniforms) {
    if (!this.ok || !this.enabled) return false;
    try {
      if (!this.slots.has(id) && !this.createSlot(id, { N: W._simN || DEFAULT_N })) return false;
      const t = this.stats.ticks;
      const resident = W._gpgpuResident !== false;
      // Full upload every 8 ticks (or when dirty); otherwise sun/geo only so GPU keeps solving
      if (!resident || W._gpgpuDirty || (t % 8) === 0) {
        this.uploadWorld(id, W);
        W._gpgpuDirty = false;
      } else {
        this.uploadSunGeo(id, W);
      }
      this.tick(id, uniforms);
      /* Climate every 2nd tick. The flow channel is deliberately *not* read back.
       *
       * `world.js` has said for a long time that the CPU shallow-water solver
       * owns the wind — hydro, storms, fire and every overlay read `windU/windV`
       * — and `downloadFlow` was quietly overwriting it anyway, along with
       * `precip` and `ash`. Measured in the browser: `windU` was zero across all
       * 55 296 cells, so on the GPU path there was no orographic rain, no rain
       * shadow, no atmospheric rivers, no storm steering and no dust lofting, on
       * a planet whose CPU twin had all five. The shader still computes a flow
       * field for its own internal advection; nothing outside reads it, and
       * skipping the readback saves a full float RGBA `readPixels` as well. */
      if (!resident || (t % 2) === 0) {
        this.downloadClimate(id, W);
        const sea = W.seaLevel;
        const slot = this.slots.get(id);
        for (let c = 0; c < (slot?.NC || 0); c++) {
          const ice = W.ice[c];
          if (W.h[c] >= sea) { W.iceLand[c] = ice; W.iceSea[c] = 0; }
          else { W.iceSea[c] = ice; W.iceLand[c] = 0; }
        }
      }
      W._gpgpuMs = this.stats.lastMs;
      W._gpgpu = true;
      W._gpgpuResident = true;
      W._gpgpuClimateTex = true;
      return true;
    } catch (e) {
      console.warn('[gpgpu] tick failed — CPU fallback', e);
      this.enabled = false;
      W._gpgpu = false;
      return false;
    }
  }

  /** Reserve a slot for a future twin / table world without ticking yet. */
  ensureSlot(id, N = DEFAULT_N) {
    if (!this.slots.has(id)) this.createSlot(id, { N });
    return this.slots.get(id);
  }
}
