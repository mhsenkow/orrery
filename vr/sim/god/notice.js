/** Civilisation notices you — moral layer hooks.
 *  Backlog civ 138–151. */

import { W } from '../../world.js';
import { formatAge } from '../time.js';
import { issueReceipt } from './receipt.js';
import { rngOf } from '../rng.js';

export function initNotice(W) {
  W.civ = W.civ || {
    aware: false,
    awareness: 0,
    prayers: [],
    worship: 'none', // none | fearful | dependent | defiant | scientific
    dependence: 0,
    named: [],
    chronicle: [],
    techAge: 'none',
    refused: false,
    left: false,
  };
}

/** Correlation of climate excursions with interventions → awareness. Item 138 / 147. */
export function noticeTick(W, log) {
  initNotice(W);
  const civ = W.civ;
  if ((W.meanBuild || 0) < 0.02 && !(W.build && maxBuild(W) > 0.3)) return;

  const acts = W.attribution?.acts || 0;
  const recent = (W.interventionLog || []).filter((e) => W.ageYr - e.t < 1e4);
  if (recent.length > 2) {
    civ.awareness = Math.min(1, civ.awareness + 0.002 * recent.length);
  }
  // Natural variance without player keeps awareness low
  if (acts < 1) civ.awareness *= 0.999;

  if (!civ.aware && civ.awareness > 0.45) {
    civ.aware = true;
    if (log) log(W.year, 'civ', 0, 1, 'They have noticed the anomalies');
    civ.chronicle.push({
      t: W.ageYr,
      text: 'The sky behaves. Something outside the world is writing in it.',
    });
  }

  // Worship responds to play style. Item 140.
  const style = W.attribution?.acts > 20
    ? ((W.interventionLog || []).filter((e) => e.tool === 'plague' || e.tool === 'meteor').length > 5
      ? 'fearful' : 'dependent')
    : (civ.aware ? 'scientific' : 'none');
  if (civ.aware) civ.worship = style;

  // Dependence from miracles. Item 141.
  if (recent.some((e) => e.tool === 'weather' || e.tool === 'seed' || e.tool === 'refuge')) {
    civ.dependence = Math.min(1, civ.dependence + 0.01);
  }

  // Occasional prayer. Item 139.
  if (civ.aware && rngOf(W, 'rngGod')() < 0.002) {
    const asks = ['rain', 'ice to stop', 'warmth', 'the neighbours dealt with', 'a sign'];
    const ask = asks[(rngOf(W, 'rngGod')() * asks.length) | 0];
    civ.prayers.push({ t: W.ageYr, ask, answered: false });
    if (civ.prayers.length > 20) civ.prayers.shift();
    if (log) log(W.year, 'civ', 0, 1, `Prayer: ${ask}`);
  }

  // Named individuals from settlers. Item 144.
  trackNamed(W);

  // Tech path from geology. Item 145.
  updateTech(W);
}

function maxBuild(W) {
  let m = 0;
  for (let i = 0; i < W.build.length; i += 31) m = Math.max(m, W.build[i]);
  return m;
}

function trackNamed(W) {
  const civ = W.civ;
  if (civ.named.length >= 8) return;
  // Prefer real settlement names
  if (W.cities?.length && rngOf(W, 'rngGod')() < 0.004) {
    const city = W.cities[(rngOf(W, 'rngGod')() * Math.min(6, W.cities.length)) | 0];
    if (city && !civ.named.some((n) => n.name === city.name)) {
      civ.named.push({
        name: city.name,
        born: W.ageYr,
        cell: city.cell,
        alive: true,
        home: city.stage,
      });
      return;
    }
  }
  if (rngOf(W, 'rngGod')() > 0.001) return;
  const names = ['Saor', 'Miren', 'Halet', 'Coru', 'Vesh', 'Anin', 'Telo', 'Rua'];
  civ.named.push({
    name: names[civ.named.length % names.length],
    born: W.ageYr,
    cell: (rngOf(W, 'rngGod')() * W.life.length) | 0,
    alive: true,
  });
}

function updateTech(W) {
  const civ = W.civ;
  let ore = 0, coal = 0;
  for (let c = 0; c < W.ore.length; c += 40) {
    ore += W.ore[c];
    if (W.rock?.[c] === 1 && W.age[c] > 100) coal += 0.01;
  }
  if (ore > 5 && civ.techAge === 'none') civ.techAge = 'copper';
  if (coal > 0.5 && civ.awareness > 0.3) civ.techAge = 'industrial';
}

/** Answer or refuse a prayer. Item 139 / 142 / 149. */
export function answerPrayer(index, accept = true) {
  initNotice(W);
  const p = W.civ.prayers[index];
  if (!p || p.answered) return { ok: false };
  p.answered = true;
  p.accepted = accept;
  if (!accept) {
    W.civ.refused = true;
    W.civ.worship = 'defiant';
    W.civ.chronicle.push({ t: W.ageYr, text: `They asked for ${p.ask}. The sky was silent.` });
  } else {
    W.civ.dependence = Math.min(1, W.civ.dependence + 0.05);
    W.civ.chronicle.push({ t: W.ageYr, text: `They asked for ${p.ask}. It was given.` });
  }
  issueReceipt({
    tool: 'inspect',
    cell: 0,
    intent: accept ? 'Answer prayer' : 'Refuse prayer',
    expected: p.ask,
  });
  return { ok: true, prayer: p };
}

/** Their chronicle voice. Item 143. */
export function civChronicleMarkdown(W) {
  initNotice(W);
  const lines = [`# ${W.worldName || 'The world'}, as they told it`, ''];
  for (const e of W.civ.chronicle) {
    lines.push(`- ${formatAge(e.t)} — ${e.text}`);
  }
  if (W.civ.aware) {
    lines.push('', `_Worship: ${W.civ.worship}. Dependence: ${(W.civ.dependence * 100) | 0}%. Tech: ${W.civ.techAge}._`);
  }
  return lines.join('\n');
}

/** Extinction presentation for civ. Item 150. */
export function civExtinctionLine(W) {
  if (!W.civ?.aware) return null;
  return {
    title: 'A people ends',
    body: `Not a guild. ${W.civ.named.filter((n) => n.alive).map((n) => n.name).join(', ') || 'They'} will not see the next age.`,
  };
}
