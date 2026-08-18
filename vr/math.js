/** Shared math, quaternions, and noise for ORRERY. */

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU4 = Math.PI / 4;

export const m4 = () => new Float32Array(16);

export function m4ident(o) {
  o.fill(0);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
}

export function m4mul(o, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return o;
}

export function m4persp(o, fovy, asp, n, f) {
  const t = 1 / Math.tan(fovy / 2);
  o.fill(0);
  o[0] = t / asp;
  o[5] = t;
  o[11] = -1;
  o[10] = (f + n) / (n - f);
  o[14] = (2 * f * n) / (n - f);
  return o;
}

/** World-space ray from a lookAt camera. NDC is -1..1 (y up). Matches m4lookAt + m4persp. */
export function lookRay(ndcX, ndcY, eye, target, up, fovy, aspect) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const tan = Math.tan(fovy / 2);
  const rx = ndcX * tan * aspect;
  const ry = ndcY * tan;
  let dx = xx * rx + yx * ry - zx;
  let dy = xy * rx + yy * ry - zy;
  let dz = xz * rx + yz * ry - zz;
  const dl = Math.hypot(dx, dy, dz) || 1;
  return { origin: [eye[0], eye[1], eye[2]], dir: [dx / dl, dy / dl, dz / dl] };
}

export function m4lookAt(o, e, c, up) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
  o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
  o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
  o[15] = 1;
  return o;
}

export function m4trs(o, q, px, py, pz, s) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  o[0] = (1 - (yy + zz)) * s; o[1] = (xy + wz) * s; o[2] = (xz - wy) * s; o[3] = 0;
  o[4] = (xy - wz) * s; o[5] = (1 - (xx + zz)) * s; o[6] = (yz + wx) * s; o[7] = 0;
  o[8] = (xz + wy) * s; o[9] = (yz - wx) * s; o[10] = (1 - (xx + yy)) * s; o[11] = 0;
  o[12] = px; o[13] = py; o[14] = pz; o[15] = 1;
  return o;
}

export function m3fromM4rot(o, m, invScale) {
  o[0] = m[0] * invScale; o[1] = m[1] * invScale; o[2] = m[2] * invScale;
  o[3] = m[4] * invScale; o[4] = m[5] * invScale; o[5] = m[6] * invScale;
  o[6] = m[8] * invScale; o[7] = m[9] * invScale; o[8] = m[10] * invScale;
  return o;
}

export function qmul(o, a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = ax * bw + aw * bx + ay * bz - az * by;
  o[1] = ay * bw + aw * by + az * bx - ax * bz;
  o[2] = az * bw + aw * bz + ax * by - ay * bx;
  o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
}

export function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  return q;
}

export function qAxis(o, ax, ay, az, ang) {
  const s = Math.sin(ang / 2);
  o[0] = ax * s; o[1] = ay * s; o[2] = az * s; o[3] = Math.cos(ang / 2);
  return o;
}

export function qrot(q, x, y, z, o = [0, 0, 0]) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  o[0] = x + qw * tx + (qy * tz - qz * ty);
  o[1] = y + qw * ty + (qz * tx - qx * tz);
  o[2] = z + qw * tz + (qx * ty - qy * tx);
  return o;
}

export function qnlerp(o, a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  if (a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  o[0] = a[0] + (bx - a[0]) * t;
  o[1] = a[1] + (by - a[1]) * t;
  o[2] = a[2] + (bz - a[2]) * t;
  o[3] = a[3] + (bw - a[3]) * t;
  return qnorm(o);
}

export function qFromTo(o, a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.999999) { o[0] = o[1] = o[2] = 0; o[3] = 1; return o; }
  if (d < -0.999999) {
    let ox = -a[1], oy = a[0], oz = 0;
    if (Math.hypot(ox, oy, oz) < 1e-6) { ox = 0; oy = -a[2]; oz = a[1]; }
    const l = Math.hypot(ox, oy, oz);
    o[0] = ox / l; o[1] = oy / l; o[2] = oz / l; o[3] = 0;
    return o;
  }
  o[0] = a[1] * b[2] - a[2] * b[1];
  o[1] = a[2] * b[0] - a[0] * b[2];
  o[2] = a[0] * b[1] - a[1] * b[0];
  o[3] = 1 + d;
  return qnorm(o);
}

export function hash3(ix, iy, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1442695041) ^ Math.imul(seed, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const c000 = hash3(ix, iy, iz, seed), c100 = hash3(ix + 1, iy, iz, seed);
  const c010 = hash3(ix, iy + 1, iz, seed), c110 = hash3(ix + 1, iy + 1, iz, seed);
  const c001 = hash3(ix, iy, iz + 1, seed), c101 = hash3(ix + 1, iy, iz + 1, seed);
  const c011 = hash3(ix, iy + 1, iz + 1, seed), c111 = hash3(ix + 1, iy + 1, iz + 1, seed);
  const x00 = lerp(c000, c100, ux), x10 = lerp(c010, c110, ux);
  const x01 = lerp(c001, c101, ux), x11 = lerp(c011, c111, ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
}

export function fbm(x, y, z, seed, oct, lac, gain) {
  let a = 0.5, f = 1, s = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, z * f, seed + i * 7919);
    norm += a;
    a *= gain;
    f *= lac;
  }
  return s / norm;
}

export function ridged(x, y, z, seed, oct) {
  let a = 0.5, f = 1, s = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, z * f, seed + i * 104729) * 2 - 1);
    s += a * n * n;
    norm += a;
    a *= 0.5;
    f *= 2.07;
  }
  return s / norm;
}

export function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function showErr(m) {
  const e = document.getElementById('err');
  if (!e) { console.error(m); return; }
  e.textContent = m;
  e.classList.add('show');
  clearTimeout(showErr._t);
  showErr._t = setTimeout(() => e.classList.remove('show'), 6000);
}
