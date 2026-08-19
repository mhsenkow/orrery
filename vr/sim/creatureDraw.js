/** Procedural creature silhouette from an expressed body plan.
 *  Sixteen hand-authored sprites remain as a fallback; this is what a genome draws. */

import { clamp } from '../math.js';

const BAND_RGB = {
  uvc: [180, 80, 255], uvb: [140, 90, 255], violetBlue: [60, 90, 220],
  green: [50, 190, 80], red: [220, 70, 50], nearIR: [180, 40, 40],
  midIR: [200, 90, 40], farIR: [160, 60, 30], microwave: [220, 180, 80],
  electric: [80, 220, 210], acoustic: [200, 200, 230], chemical: [180, 140, 70],
  pressure: [90, 160, 200], thermalContact: [220, 120, 80],
};

function fillOf(plan) {
  const warm = plan?.pigmentBias ?? 0.5;
  const armour = plan?.armour ?? 0;
  const r = clamp(70 + warm * 130 + armour * 40, 20, 255) | 0;
  const g = clamp(90 + (1 - warm) * 80 - armour * 20, 20, 255) | 0;
  const b = clamp(60 + (1 - warm) * 110, 20, 255) | 0;
  return `rgb(${r},${g},${b})`;
}

function eyeFill(band) {
  const rgb = BAND_RGB[band] || [240, 240, 220];
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function limbWidth(plan, bodyR) {
  const massG = Math.max(1e-6, plan?.massG ?? 1);
  const grav = plan?.gravity ?? 1;
  // square-cube: diameter ~ sqrt(mass * g / length)
  const thick = Math.sqrt(Math.cbrt(massG) * Math.max(0.2, grav)) * 0.12;
  return clamp(bodyR * (0.12 + thick), bodyR * 0.08, bodyR * 0.38);
}

/** Draw the body at (cx, cy) sized to `size` CSS pixels. */
export function drawCreature(ctx, plan, cx, cy, size, opts = {}) {
  if (!plan || !ctx) return;
  const s = Math.max(3, size);
  const flip = opts.flip ? -1 : 1;
  const lean = opts.lean || 0;
  ctx.save();
  ctx.translate(cx, cy);
  if (flip < 0) ctx.scale(-1, 1);
  if (lean) ctx.transform(1, 0, lean, 1, 0, 0);
  const age = opts.ageFrac ?? 1;
  ctx.scale(s * (0.55 + age * 0.45) / 32, s * (0.55 + age * 0.45) / 32);

  const sym = plan.symmetryOrder | 0;
  const fill = opts.fill || fillOf(plan);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (sym >= 3) drawRadial(ctx, plan, fill);
  else if (plan.silhouette === 'goo' || (sym === 0 && !(plan.limbs > 0))) drawGoo(ctx, plan, fill);
  else if (plan.gait === 'anchored' || plan.silhouette === 'mat' || plan.silhouette === 'crown') {
    drawSessile(ctx, plan, fill);
  } else if (plan.silhouette === 'serpent' || plan.silhouette === 'nekton') {
    drawNekton(ctx, plan, fill);
  } else {
    drawBilateral(ctx, plan, fill);
  }
  ctx.restore();
}

function drawGoo(ctx, plan, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(0, 4, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(-4, 2, 7, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawSessile(ctx, plan, fill) {
  const rays = Math.max(3, plan.symmetryOrder || 5);
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineWidth = 2.2;
  for (let i = 0; i < rays; i++) {
    const a = -Math.PI / 2 + (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(Math.cos(a) * 8, Math.sin(a) * 4 + 2, Math.cos(a) * 16, Math.sin(a) * 14);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 6, 5, 0, Math.PI * 2);
  ctx.fill();
  drawEyes(ctx, plan, rays, 0, 6, 11);
}

function drawRadial(ctx, plan, fill) {
  const n = Math.max(3, plan.symmetryOrder | 0);
  const limbs = Math.max(n, plan.limbs || n);
  const rays = Math.min(12, Math.max(n, Math.round(limbs / Math.max(1, (plan.segments || 1) / 2))));
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  const w = limbWidth(plan, 10);
  ctx.lineWidth = w;
  for (let i = 0; i < rays; i++) {
    const a = -Math.PI / 2 + (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
    ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  drawEyes(ctx, plan, n, 0, 0, 10);
}

function drawNekton(ctx, plan, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(0, 2, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 2);
  ctx.lineTo(22, -4);
  ctx.lineTo(22, 8);
  ctx.closePath();
  ctx.fill();
  drawEyes(ctx, plan, 2, -8, 0, 5);
}

function drawBilateral(ctx, plan, fill) {
  const segs = Math.max(1, plan.segments | 0);
  const limbs = plan.limbs | 0;
  const bodyH = 8 + Math.min(10, segs);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(0, 4, 7, bodyH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.ellipse(0, -bodyH * 0.35, 6, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const pairs = Math.max(1, Math.round(limbs / 2) || 1);
  const w = limbWidth(plan, 8);
  ctx.strokeStyle = fill;
  ctx.lineWidth = w;
  const express = Math.min(pairs, segs);
  for (let i = 0; i < express; i++) {
    const y = -bodyH * 0.15 + (i / Math.max(1, express - 1)) * bodyH * 0.7;
    const len = 10 + (plan.digits || 0) * 0.4;
    ctx.beginPath();
    ctx.moveTo(-5, y);
    ctx.lineTo(-5 - len, y + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, y);
    ctx.lineTo(5 + len, y + 6);
    ctx.stroke();
  }
  drawEyes(ctx, plan, 2, 0, -bodyH * 0.4, 4.5);
}

function drawEyes(ctx, plan, fallbackCount, ox, oy, radius) {
  const eyes = plan.eyes?.length ? plan.eyes : [];
  let items = [];
  if (eyes.length) {
    for (const e of eyes) {
      for (let i = 0; i < Math.max(1, e.count | 0); i++) {
        items.push(e.band || 'green');
      }
    }
  } else if ((plan.eyeCount || 0) > 0) {
    items = Array.from({ length: plan.eyeCount }, () => 'green');
  }
  const n = items.length || 0;
  if (!n) return;
  const count = Math.min(12, n);
  const ring = Math.max(fallbackCount, count);
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / ring) * Math.PI * 2;
    const x = ox + Math.cos(a) * radius * 0.55;
    const y = oy + Math.sin(a) * radius * 0.45;
    ctx.fillStyle = eyeFill(items[i]);
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,10,14,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Growth series: juvenile, subadult, adult from one plan. */
export function growthSeries(plan) {
  if (!plan) return [];
  return [
    { label: 'juvenile', ageFrac: 0.35, size: (plan.size || 1) * 0.4 },
    { label: 'subadult', ageFrac: 0.7, size: (plan.size || 1) * 0.75 },
    { label: 'adult', ageFrac: 1, size: plan.size || 1 },
  ];
}

export { fillOf as creatureFill, BAND_RGB };
