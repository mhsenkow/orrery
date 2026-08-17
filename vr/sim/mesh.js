/** Low-poly body meshes / octahedral impostors from body plans.
 *  Next backlog mesh 30–35. */

import { bodyPlanFromTraits, passesSilhouette } from './morphology.js';

/** Build a unit mesh for a body plan — returns { positions, indices }. */
export function meshFromPlan(plan) {
  if (!plan || !passesSilhouette(plan)) {
    return octahedron(1);
  }
  const limbs = plan.limbs || 0;
  const segs = plan.segments || 1;
  const positions = [];
  const indices = [];

  const pushBox = (cx, cy, cz, sx, sy, sz) => {
    const base = positions.length / 3;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const corners = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ];
    for (const [x, y, z] of corners) positions.push(cx + x, cy + y, cz + z);
    const faces = [
      [0, 1, 2, 0, 2, 3], [4, 6, 5, 4, 7, 6],
      [0, 4, 5, 0, 5, 1], [2, 6, 7, 2, 7, 3],
      [0, 3, 7, 0, 7, 4], [1, 5, 6, 1, 6, 2],
    ];
    for (const f of faces) for (const i of f) indices.push(base + i);
  };

  // Trunk
  pushBox(0, 0.35, 0, 0.35, 0.7, 0.25 * Math.min(2, segs * 0.5));
  // Head
  pushBox(0, 0.85, 0.05, 0.28, 0.28, 0.28);
  // Limbs
  for (let i = 0; i < limbs; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const along = ((i / 2) | 0) * 0.2 - 0.1;
    pushBox(side * 0.35, 0.25 + along, 0, 0.12, 0.45, 0.12);
  }
  if (plan.appendage === 'frond') {
    pushBox(0, 0.9, 0, 0.8, 0.15, 0.05);
  }
  if (plan.appendage === 'jaw') {
    pushBox(0, 0.75, 0.25, 0.2, 0.1, 0.25);
  }

  // Normalize to unit height
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    minY = Math.min(minY, positions[i]);
    maxY = Math.max(maxY, positions[i]);
  }
  const h = Math.max(0.01, maxY - minY);
  for (let i = 1; i < positions.length; i += 3) positions[i] = (positions[i] - minY) / h;

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
    plan,
  };
}

function octahedron(s = 1) {
  const positions = new Float32Array([
    0, s, 0,  s, 0, 0,  0, 0, s,  -s, 0, 0,  0, 0, -s,  0, -s, 0,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1,
    5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4,
  ]);
  return { positions, indices };
}

/** Cache of meshes by sprite kind / plan hash. */
const CACHE = new Map();

export function meshForEntity(meta, traits, opts = {}) {
  const plan = meta?.plan || (traits ? bodyPlanFromTraits(traits, opts) : null);
  const key = plan
    ? `${plan.limbs}-${plan.segments}-${plan.appendage}-${plan.symmetry}`
    : `k${meta?.kind ?? 0}`;
  if (!CACHE.has(key)) CACHE.set(key, meshFromPlan(plan));
  return CACHE.get(key);
}

export function clearMeshCache() { CACHE.clear(); }
