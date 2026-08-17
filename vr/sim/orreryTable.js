/** Orrery table — multiple worlds on a surface with a central star.
 *  Shelf markers tint by climate; click / pinch loads a world. */

import { loadShelf } from './god/shelf.js';

/** Table state for XR / desktop. */
export function createTableState() {
  return {
    enabled: false,
    height: 0.92,
    radius: 0.55,
    starScale: 0.04,
    slots: [],
    activeId: null,
    maxSlots: 6,
    phase: 0, // slow orbital drift
  };
}

/** RGB tint from shelf climate stats. */
export function tintForEntry(entry, live = false) {
  if (live) return [0.45, 0.72, 0.55];
  const life = Math.min(1, entry?.meanLife ?? 0);
  const temp = entry?.meanTemp ?? 0.5;
  const ice = temp < 0.28 ? 1 - temp / 0.28 : 0;
  const hot = temp > 0.65 ? (temp - 0.65) / 0.35 : 0;
  return [
    clamp01(0.22 + life * 0.25 + hot * 0.55 + ice * 0.35),
    clamp01(0.35 + life * 0.55 + (1 - Math.abs(temp - 0.5) * 2) * 0.15),
    clamp01(0.55 + ice * 0.4 - hot * 0.35 + life * 0.1),
  ];
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/** Populate from shelf + current world. */
export function syncTableFromShelf(table, current = null) {
  const shelf = loadShelf();
  const slots = [];
  const n = Math.min(table.maxSlots, Math.max(1, shelf.length + (current ? 1 : 0)));
  let i = 0;
  if (current) {
    slots.push({
      id: 'live',
      seed: current.seed,
      ruleId: current.rule?.id,
      name: current.worldName || current.rule?.name || 'Live',
      angle: 0,
      elev: 0.08,
      scale: 0.09,
      live: true,
      meanLife: current.meanLife,
      meanTemp: current.meanTemp,
      tint: tintForEntry({ meanLife: current.meanLife, meanTemp: current.meanTemp }, true),
    });
    i = 1;
  }
  for (let s = 0; s < shelf.length && i < n; s++, i++) {
    const e = shelf[s];
    slots.push({
      id: e.id || `shelf-${s}`,
      seed: e.seed,
      ruleId: e.ruleId || e.rule?.id,
      name: e.name || e.ruleName || `World ${s + 1}`,
      angle: 0,
      elev: 0.07,
      scale: 0.055,
      live: false,
      entry: e,
      meanLife: e.meanLife,
      meanTemp: e.meanTemp,
      tint: tintForEntry(e),
    });
  }
  const m = slots.length || 1;
  slots.forEach((sl, idx) => {
    sl.angle = (idx / m) * Math.PI * 2;
  });
  table.slots = slots;
  if (!table.activeId && slots[0]) table.activeId = slots[0].id;
  return table;
}

/** Advance slow orbit animation. */
export function tickTable(table, dtSec = 0.016) {
  if (!table?.enabled) return;
  table.phase = (table.phase || 0) + dtSec * 0.08;
}

/** World-space position of a slot on the table. */
export function slotWorldPos(table, slot, tableOrigin = [0, 0, 0], scaleXZ = 1) {
  const r = table.radius * 0.72 * scaleXZ;
  const ang = slot.angle + (table.phase || 0);
  return [
    tableOrigin[0] + Math.cos(ang) * r,
    tableOrigin[1] + table.height + slot.elev,
    tableOrigin[2] + Math.sin(ang) * r,
  ];
}

/** Pick nearest slot to a hand/ray point. */
export function pickTableSlot(table, point, tableOrigin = [0, 0, 0], maxDist = 0.14, scaleXZ = 1) {
  let best = null, bestD = maxDist;
  for (const sl of table.slots) {
    if (sl.live) continue;
    const p = slotWorldPos(table, sl, tableOrigin, scaleXZ);
    const d = Math.hypot(point[0] - p[0], point[1] - p[1], point[2] - p[2]);
    if (d < bestD) { bestD = d; best = sl; }
  }
  return best;
}

/**
 * Desktop / XR ray pick — closest approach of ray to each slot sphere.
 * eye, dir world-space; returns slot or null.
 */
export function pickTableSlotRay(table, eye, dir, tableOrigin = [0, 0, 0], scaleXZ = 1, maxDist = 0.1) {
  let best = null, bestT = Infinity;
  const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const dx = dir[0] / dl, dy = dir[1] / dl, dz = dir[2] / dl;
  for (const sl of table.slots) {
    if (sl.live) continue;
    const p = slotWorldPos(table, sl, tableOrigin, scaleXZ);
    const r = (sl.scale || 0.055) * (scaleXZ < 1 ? 0.55 : 1.1);
    const ox = eye[0] - p[0], oy = eye[1] - p[1], oz = eye[2] - p[2];
    const b = ox * dx + oy * dy + oz * dz;
    const c = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0.01 && t < bestT && t < 8) {
      bestT = t;
      best = sl;
    }
  }
  return best;
}

/** Meta payload usable with loadRunMeta / generate. */
export function slotToLoadMeta(slot) {
  if (!slot || slot.live) return null;
  const e = slot.entry;
  if (e?.data) return e.data;
  return {
    version: 2,
    seed: slot.seed,
    ruleId: slot.ruleId,
    worldName: slot.name,
  };
}

/**
 * Habitable-zone annulus in AU for the orrery (exoparams item 68).
 * Returns { inner, outer, planets: [{ name, a, inHz }] } from a system record or star.
 */
export function habitableZoneAnnulus(star, planets = []) {
  if (!star?.hz) return null;
  const { inner, outer } = star.hz;
  return {
    inner,
    outer,
    planets: planets.map((p) => {
      const a = p.a ?? p.semiMajorAu ?? null;
      return {
        name: p.name || p.b || '?',
        a,
        inHz: a != null && a >= inner && a <= outer,
      };
    }),
  };
}
