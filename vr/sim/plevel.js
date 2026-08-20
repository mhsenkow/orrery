/** Pressure as the vertical coordinate on a world with no surface.
 *  Worldspace `plevel`. 1 bar is the photosphere; cloud decks sit at
 *  condensation levels; Galileo's probe is the floor. */

import { clamp } from '../math.js';
import { NC, DIR } from '../sphere.js';

/** Fitted: Galileo at 22 bar. Not a descent through metallic hydrogen. */
export const PROBE_FLOOR_BAR = 22;

const DECKS_H2 = Object.freeze([
  { id: 'nh3', name: 'ammonia ice', pBar: 0.7, rgb: [236, 226, 198], tag: 'measured',
    why: 'Jupiter’s white zones. Condenses near 0.7 bar.' },
  { id: 'nh4sh', name: 'ammonium hydrosulfide', pBar: 2, rgb: [186, 118, 62], tag: 'fitted',
    why: 'The ochre chromophore layer. You see it where the ammonia deck clears.' },
  { id: 'h2o', name: 'water cloud', pBar: 5, rgb: [168, 176, 196], tag: 'measured',
    why: 'The deep water deck, near 5 bar. Lightning lives here.' },
]);

const DECKS_ICE = Object.freeze([
  { id: 'ch4', name: 'methane ice', pBar: 1.2, rgb: [164, 206, 214], tag: 'measured',
    why: 'Ice-giant methane clouds. The blue is methane absorption, not this ice.' },
  { id: 'h2s', name: 'hydrogen sulfide', pBar: 3, rgb: [120, 148, 176], tag: 'invented',
    why: 'A deeper deck on Uranus and Neptune. Colour is contested; tagged invented.' },
]);

export function isIceGiantKind(kind) {
  return kind === 'uranus' || kind === 'neptune';
}

export function cloudDecks(W) {
  const kind = W?._planetKind || W?.rule?._planetKind;
  return isIceGiantKind(kind) ? DECKS_ICE : DECKS_H2;
}

/** 1-bar temperature. Jupiter ~165 K measured; else teq or a hydrogen floor. */
export function t1barK(W) {
  const kind = W?._planetKind || W?.rule?._planetKind;
  if (kind === 'jupiter') return 165;
  if (kind === 'saturn') return 134;
  if (kind === 'uranus') return 76;
  if (kind === 'neptune') return 72;
  const teq = W?.rule?.teqK;
  if (teq > 80) return teq;
  return 165;
}

/** Adiabatic sketch T ∝ P^0.32. Fitted so Jupiter 22 bar is ~430 K. */
export function tempAtPressureK(W, pBar) {
  const p = Math.max(1e-4, pBar);
  return t1barK(W) * Math.pow(p, 0.32);
}

/** Camera distance (planet-radii from centre) → bars.
 *  1.00 = 1 bar photosphere. Closer is deeper; farther is the haze. */
export function pressureAtCamDist(camDist, W) {
  const floor = probeFloorBar(W);
  if (!(camDist > 0)) return 1;
  if (camDist >= 1) {
    const haze = Math.exp(-(camDist - 1) * 8);
    return clamp(0.05 + 0.95 * haze, 0.05, 1);
  }
  const k = (1 - camDist) / 0.16;
  return clamp(Math.exp(k * Math.log(floor)), 1, floor);
}

export function probeFloorBar(W) {
  const r = W?.rule?.radiusEarth || 11;
  if (r < 4) return 8;
  return PROBE_FLOOR_BAR;
}

export function camDistMin(W) {
  return W?.noSurface ? 0.84 : 1.03;
}

/** Which deck you see: rising air (zone) is the top deck; sinking (belt) is deeper. */
export function seenPressureBar(W, c) {
  const conv = W.converg?.[c] || 0;
  const decks = cloudDecks(W);
  const top = decks[0].pBar;
  const deep = decks[decks.length - 1].pBar;
  const sink = clamp(0.5 - conv * 1.6, 0, 1);
  return top + (deep - top) * sink * sink;
}

export function deckAtPressure(W, pBar) {
  const decks = cloudDecks(W);
  let hit = decks[0];
  for (const d of decks) {
    if (pBar + 1e-6 >= d.pBar) hit = d;
  }
  return hit;
}

export function formatPlevel(W, c = 0) {
  if (!W?.noSurface) return '';
  const p = W.pSeen?.[c] ?? seenPressureBar(W, c);
  const deck = deckAtPressure(W, p);
  const T = tempAtPressureK(W, p);
  return `${p.toFixed(1)} bar · ${T.toFixed(0)} K · ${deck.name}`;
}

export function formatDescent(camDist, W) {
  if (!W?.noSurface) return '';
  const p = pressureAtCamDist(camDist, W);
  const T = tempAtPressureK(W, p);
  const floor = probeFloorBar(W);
  if (p >= floor * 0.96) return `${p.toFixed(0)} bar · ${T.toFixed(0)} K · probe floor`;
  const deck = deckAtPressure(W, p);
  return `${p.toFixed(2)} bar · ${T.toFixed(0)} K · ${deck.name}`;
}

export function formatDecksLine(W) {
  if (!W?.noSurface) return '';
  return cloudDecks(W).map((d) => `${d.name} ${d.pBar} bar`).join(' · ');
}

/** Chip extras: scale height, internal heat, jet count, decks. */
export function formatGiantExtras(W) {
  if (!W?.noSurface) return '';
  const bits = [];
  const H = W.rule?.scaleHeightKm;
  if (H > 0) bits.push(`H ${H < 10 ? H.toFixed(1) : H.toFixed(0)} km`);
  const ih = W.rule?.internalHeat;
  if (ih > 0.02) bits.push(`internal heat ${ih.toFixed(2)}`);
  if (W._jetCount) bits.push(`${W._jetCount} jets`);
  const decks = formatDecksLine(W);
  if (decks) bits.push(decks);
  return bits.join(' · ');
}

/** Envelope column: decks as layers, still labelled no surface. */
export function envelopeDeckLayers(W, cell = 0) {
  const pSeen = W.pSeen?.[cell] ?? 0.7;
  const decks = cloudDecks(W);
  const out = [{
    depth: 0, name: 'no surface', ageMyr: 0,
    note: `${pSeen.toFixed(1)} bar photosphere`, rgb: [48, 40, 72], noSurface: true,
  }];
  let top = 0;
  const H = W.rule?.scaleHeightKm || 20;
  for (const d of decks) {
    const km = Math.max(0.4, Math.abs(Math.log(d.pBar)) * H);
    out.push({
      depth: top, name: d.name, ageMyr: 0,
      note: `${d.pBar} bar`, rgb: d.rgb, tag: d.tag,
    });
    top += km;
  }
  out.push({
    depth: top, name: 'probe floor', ageMyr: 0,
    note: `${probeFloorBar(W)} bar`, rgb: [32, 24, 20],
  });
  return out;
}

export function ensurePlevel(W) {
  if (!W?.noSurface) return;
  if (!W.pSeen || W.pSeen.length !== NC) W.pSeen = new Float32Array(NC);
  if (!W.chroma || W.chroma.length !== NC) W.chroma = new Float32Array(NC);
  if (!W.spot || W.spot.length !== NC) W.spot = new Float32Array(NC);
}

/** Write seen-pressure from live convergence plus the zonal jet pattern. */
export function plevelTick(W) {
  if (!W?.noSurface) return;
  ensurePlevel(W);
  const decks = cloudDecks(W);
  const top = decks[0].pBar;
  const deep = decks[decks.length - 1].pBar;
  const pSeen = W.pSeen;
  const conv = W.converg;
  const n = Math.max(2, W._jetCount || 12);
  for (let c = 0; c < NC; c++) {
    const lat = clamp(DIR[c * 3 + 1], -1, 1);
    const band = 0.5 - 0.5 * Math.cos(n * Math.asin(lat));
    const sink = clamp(0.22 + band * 0.7 - (conv?.[c] || 0) * 0.9, 0, 1);
    const target = top + (deep - top) * sink * sink;
    pSeen[c] += (target - pSeen[c]) * 0.38;
  }
}

export function wantsRings(rule) {
  if ((rule?._planetKind || '') === 'saturn') return true;
  const b = rule?._catalogueItem?.b || rule?.name || '';
  return /^saturn$/i.test(String(b).trim());
}
