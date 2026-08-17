/** GPGPU shader sources — cube-sphere field solvers.
 *  Atlas layout: width = 6N, height = N (one face strip).
 *  Designed so N is a uniform; neighbour UVs live in textures. */

export const VS_FULLSCREEN = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Sample climate + apply thermal relaxation toward equilibrium. */
export const FS_THERMAL = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uClimate; // rgba: temp, moist, ice, clouds
uniform sampler2D uGeo;     // rgba: height, seaLevel(const via u), ash, dust
uniform sampler2D uSun;     // r: insolation proxy per cell (pre-baked or flat)
uniform float uGh;          // greenhouse
uniform float uLapse;
uniform float uSolar;
uniform float uSea;
uniform float uAirless;
out vec4 o;
void main(){
  vec4 c = texture(uClimate, vUV);
  vec4 g = texture(uGeo, vUV);
  float h = g.r;
  float isSea = step(h, uSea);
  float ice = c.b;
  float clouds = c.a;
  float dust = g.a;
  float alb = clamp(ice * 0.42 + clouds * 0.28 + dust * 0.22 + mix(0.18, 0.06, isSea), 0.0, 0.85);
  float insol = texture(uSun, vUV).r * uSolar;
  float above = max(0.0, h - uSea);
  float eq = insol * (1.0 - alb) * 0.95 + uGh * 1.4 - above * uLapse * 0.35 + 0.12;
  float mass = mix(0.14, 0.035, isSea);
  if (uAirless > 0.5) mass = 0.45;
  // 4-neighbour Laplacian via geo neighbour UVs packed in uNbr0/1 would be ideal;
  // cheap self-relax for this pass — diffusion lives in advect/diffuse.
  float t = clamp(c.r + (eq - c.r) * mass, 0.0, 1.6);
  o = vec4(t, c.g, c.b, c.a);
}`;

/** Upwind advection of temp/moist/ash using wind field. */
export const FS_ADVECT = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uClimate; // temp moist ice clouds
uniform sampler2D uFlow;    // windU windV precip ash
uniform sampler2D uNbr0;    // rg = UV of nbr0, ba = UV of nbr1
uniform sampler2D uNbr1;    // rg = nbr2, ba = nbr3
uniform float uRateT;
uniform float uRateM;
uniform float uRateA;
out vec4 oClimate;
out vec4 oFlow;
vec4 advect1(sampler2D tex, float ch, vec2 uv, float u, float v, float rate){
  // ch: 0=r 1=g 2=b 3=a — sample scalar via swizzle in caller
  return vec4(0.0); // unused stub
}
float ch(vec4 s, int i){
  if(i==0) return s.r; if(i==1) return s.g; if(i==2) return s.b; return s.a;
}
void main(){
  vec4 c = texture(uClimate, vUV);
  vec4 f = texture(uFlow, vUV);
  float u = f.r;
  float v = f.g;
  vec4 n0 = texture(uNbr0, vUV);
  vec4 n1 = texture(uNbr1, vUV);
  vec2 uvU = u > 0.0 ? n0.ba : n0.rg; // nbr1 vs nbr0
  vec2 uvV = v > 0.0 ? n1.rg : n1.ba; // nbr2 vs nbr3
  vec4 cU = texture(uClimate, uvU);
  vec4 cV = texture(uClimate, uvV);
  vec4 fU = texture(uFlow, uvU);
  float au = min(1.0, abs(u));
  float av = min(1.0, abs(v));
  float t = c.r + (cU.r - c.r) * uRateT * au;
  t = t + (texture(uClimate, uvV).r - t) * uRateT * av * 0.85;
  float m = c.g + (cU.g - c.g) * uRateM * au;
  m = m + (texture(uClimate, uvV).g - m) * uRateM * av * 0.85;
  float ash = f.a + (fU.a - f.a) * uRateA * au;
  oClimate = vec4(clamp(t,0.0,1.6), clamp(m,0.0,1.0), c.b, c.a);
  oFlow = vec4(f.r, f.g, f.b, clamp(ash, 0.0, 1.0));
}`;

/** Cloud formation + decay. */
export const FS_CLOUDS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uClimate;
uniform sampler2D uFlow;
out vec4 o;
void main(){
  vec4 c = texture(uClimate, vUV);
  vec4 f = texture(uFlow, vUV);
  float form = c.g * clamp(1.1 - c.r, 0.0, 1.0) * 0.7 + f.b * 0.4;
  float clouds = clamp(c.a * 0.85 + form * 0.5 + f.a * 0.2, 0.0, 1.0);
  o = vec4(c.r, c.g, c.b, clouds);
}`;

/** Geostrophic wind from temp/height pressure proxy. */
export const FS_WIND = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uClimate;
uniform sampler2D uGeo;
uniform sampler2D uNbr0;
uniform sampler2D uNbr1;
uniform float uSea;
uniform float uFScale;
uniform float uTidallyLocked;
uniform vec3 uSunDir;
uniform sampler2D uDir; // rgb = unit direction of cell
out vec4 o;
void main(){
  vec4 c = texture(uClimate, vUV);
  vec4 g = texture(uGeo, vUV);
  vec3 dir = texture(uDir, vUV).rgb;
  float lat = dir.y;
  float p = (1.0 - c.r) * 0.6 + max(0.0, g.r - uSea) * 0.25 + c.b * 0.15;
  vec4 n0 = texture(uNbr0, vUV);
  vec4 n1 = texture(uNbr1, vUV);
  float dpx = 0.0, dpy = 0.0;
  vec2 uvs[4];
  uvs[0]=n0.rg; uvs[1]=n0.ba; uvs[2]=n1.rg; uvs[3]=n1.ba;
  for(int k=0;k<4;k++){
    vec4 cn = texture(uClimate, uvs[k]);
    vec4 gn = texture(uGeo, uvs[k]);
    vec3 dn = texture(uDir, uvs[k]).rgb;
    float pn = (1.0 - cn.r) * 0.6 + max(0.0, gn.r - uSea) * 0.25 + cn.b * 0.15;
    dpx += (pn - p) * (dn.x - dir.x);
    dpy += (pn - p) * (dn.z - dir.z);
  }
  dpx *= 0.25; dpy *= 0.25;
  float f = lat * uFScale;
  float u = -dpy * (0.5 + abs(f));
  float v = dpx * (0.5 + abs(f));
  u += sin(lat * 3.14159 * 3.0) * 0.15;
  if (g.r > uSea + 0.08) { u *= 0.7; v *= 0.7; }
  if (uTidallyLocked > 0.5) {
    float day = dot(dir, uSunDir);
    u += -day * 0.2;
  }
  vec4 flow = texture(uFlow, vUV);
  o = vec4(clamp(u,-1.5,1.5), clamp(v,-1.5,1.5), flow.b, flow.a);
}`;

/** Need uFlow sampler in wind — fix by declaring it. */
export const FS_WIND_FIXED = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uClimate;
uniform sampler2D uGeo;
uniform sampler2D uFlow;
uniform sampler2D uNbr0;
uniform sampler2D uNbr1;
uniform sampler2D uDir;
uniform float uSea;
uniform float uFScale;
uniform float uTidallyLocked;
uniform vec3 uSunDir;
out vec4 o;
void main(){
  vec4 c = texture(uClimate, vUV);
  vec4 g = texture(uGeo, vUV);
  vec4 flow = texture(uFlow, vUV);
  vec3 dir = texture(uDir, vUV).rgb;
  float lat = dir.y;
  float p = (1.0 - c.r) * 0.6 + max(0.0, g.r - uSea) * 0.25 + c.b * 0.15;
  vec4 n0 = texture(uNbr0, vUV);
  vec4 n1 = texture(uNbr1, vUV);
  float dpx = 0.0, dpy = 0.0;
  vec2 uvs[4];
  uvs[0]=n0.rg; uvs[1]=n0.ba; uvs[2]=n1.rg; uvs[3]=n1.ba;
  for(int k=0;k<4;k++){
    vec4 cn = texture(uClimate, uvs[k]);
    vec4 gn = texture(uGeo, uvs[k]);
    vec3 dn = texture(uDir, uvs[k]).rgb;
    float pn = (1.0 - cn.r) * 0.6 + max(0.0, gn.r - uSea) * 0.25 + cn.b * 0.15;
    dpx += (pn - p) * (dn.x - dir.x);
    dpy += (pn - p) * (dn.z - dir.z);
  }
  dpx *= 0.25; dpy *= 0.25;
  float f = lat * uFScale;
  float uu = -dpy * (0.5 + abs(f));
  float vv = dpx * (0.5 + abs(f));
  uu += sin(lat * 3.14159265 * 3.0) * 0.15;
  if (g.r > uSea + 0.08) { uu *= 0.7; vv *= 0.7; }
  if (uTidallyLocked > 0.5) {
    float day = dot(dir, uSunDir);
    uu += -day * 0.2;
  }
  o = vec4(clamp(uu,-1.5,1.5), clamp(vv,-1.5,1.5), flow.b, flow.a);
}`;

/** Ice grow/melt from temp + sea flag. */
export const FS_ICE = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uClimate;
uniform sampler2D uGeo;
uniform float uSea;
uniform float uFreeze;
out vec4 o;
void main(){
  vec4 c = texture(uClimate, vUV);
  float h = texture(uGeo, vUV).r;
  float isSea = step(h, uSea);
  float ice = c.b;
  if (c.r < uFreeze) ice = min(1.0, ice + 0.02);
  else ice = max(0.0, ice - 0.015 * (c.r - uFreeze + 0.05));
  // Sea ice thinner growth
  if (isSea > 0.5) ice *= 0.98;
  o = vec4(c.r, c.g, clamp(ice,0.0,1.0), c.a);
}`;

/** Combined climate step: thermal → advect → ice → clouds → geostrophic wind.
 *  Single MRT: oClimate (temp,moist,ice,clouds) + oFlow (windU,windV,precip,ash). */
export const FS_CLIMATE_STEP = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uClimate;
uniform sampler2D uGeo;
uniform sampler2D uFlow;
uniform sampler2D uSun;
uniform sampler2D uNbr0;
uniform sampler2D uNbr1;
uniform sampler2D uDir;
uniform float uGh, uLapse, uSolar, uSea, uAirless, uFreeze;
uniform float uRateT, uRateM, uRateA, uFScale, uTidallyLocked;
uniform vec3 uSunDir;
layout(location=0) out vec4 oClimate;
layout(location=1) out vec4 oFlow;
void main(){
  vec4 c0 = texture(uClimate, vUV);
  vec4 g = texture(uGeo, vUV);
  vec4 f0 = texture(uFlow, vUV);
  vec3 dir = texture(uDir, vUV).rgb;
  float h = g.r;
  float isSea = step(h, uSea);
  float alb = clamp(c0.b * 0.42 + c0.a * 0.28 + g.a * 0.22 + mix(0.18, 0.06, isSea), 0.0, 0.85);
  float insol = texture(uSun, vUV).r * uSolar;
  float above = max(0.0, h - uSea);
  float eq = insol * (1.0 - alb) * 0.95 + uGh * 1.4 - above * uLapse * 0.35 + 0.12;
  float mass = mix(0.14, 0.035, isSea);
  if (uAirless > 0.5) mass = 0.45;
  float t = clamp(c0.r + (eq - c0.r) * mass, 0.0, 1.6);
  float m = c0.g;
  float ice = c0.b;
  float clouds = c0.a;
  float ash = f0.a;
  float precip = f0.b;

  float u = f0.r;
  float v = f0.g;
  vec4 n0 = texture(uNbr0, vUV);
  vec4 n1 = texture(uNbr1, vUV);
  vec2 uvU = u > 0.0 ? n0.ba : n0.rg;
  vec2 uvV = v > 0.0 ? n1.rg : n1.ba;
  vec4 cU = texture(uClimate, uvU);
  vec4 cV = texture(uClimate, uvV);
  vec4 fU = texture(uFlow, uvU);
  float au = min(1.0, abs(u));
  float av = min(1.0, abs(v));
  t = t + (cU.r - t) * uRateT * au;
  t = t + (cV.r - t) * uRateT * av * 0.85;
  m = m + (cU.g - m) * uRateM * au;
  m = m + (cV.g - m) * uRateM * av * 0.85;
  ash = ash + (fU.a - ash) * uRateA * au;
  t = clamp(t, 0.0, 1.6);
  m = clamp(m, 0.0, 1.0);
  ash = clamp(ash, 0.0, 1.0);

  if (t < uFreeze) ice = min(1.0, ice + 0.02);
  else ice = max(0.0, ice - 0.015 * (t - uFreeze + 0.05));

  float form = m * clamp(1.1 - t, 0.0, 1.0) * 0.7 + precip * 0.4;
  clouds = clamp(clouds * 0.85 + form * 0.5 + ash * 0.2, 0.0, 1.0);
  precip = clamp(precip * 0.9 + max(0.0, clouds - 0.55) * 0.08, 0.0, 1.0);

  // Geostrophic wind from updated thermal field (use local t/ice)
  float lat = dir.y;
  float p = (1.0 - t) * 0.6 + max(0.0, h - uSea) * 0.25 + ice * 0.15;
  float dpx = 0.0, dpy = 0.0;
  vec2 uvs[4];
  uvs[0]=n0.rg; uvs[1]=n0.ba; uvs[2]=n1.rg; uvs[3]=n1.ba;
  for (int k = 0; k < 4; k++) {
    vec4 cn = texture(uClimate, uvs[k]);
    vec4 gn = texture(uGeo, uvs[k]);
    vec3 dn = texture(uDir, uvs[k]).rgb;
    float pn = (1.0 - cn.r) * 0.6 + max(0.0, gn.r - uSea) * 0.25 + cn.b * 0.15;
    dpx += (pn - p) * (dn.x - dir.x);
    dpy += (pn - p) * (dn.z - dir.z);
  }
  dpx *= 0.25; dpy *= 0.25;
  float f = lat * uFScale;
  float uu = -dpy * (0.5 + abs(f));
  float vv = dpx * (0.5 + abs(f));
  uu += sin(lat * 3.14159265 * 3.0) * 0.15;
  if (h > uSea + 0.08) { uu *= 0.7; vv *= 0.7; }
  if (uTidallyLocked > 0.5) uu += -dot(dir, uSunDir) * 0.2;

  oClimate = vec4(t, m, clamp(ice, 0.0, 1.0), clouds);
  oFlow = vec4(clamp(uu, -1.5, 1.5), clamp(vv, -1.5, 1.5), precip, ash);
}`;
