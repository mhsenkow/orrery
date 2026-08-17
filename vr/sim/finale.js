/** Run endings — every world should know how to finish.
 *  Next backlog moral / ship items around finales. */

import { formatAge } from './time.js';
import { playStyle } from './god/receipt.js';

export const ENDINGS = {
  heatDeath: {
    id: 'heatDeath',
    title: 'Heat death of a small world',
    prose: 'The last gradients flattened. Nothing left to argue with.',
  },
  redGiant: {
    id: 'redGiant',
    title: 'Engulfed',
    prose: 'The star grew. Oceans boiled. The chronicle ends mid-sentence.',
  },
  sterile: {
    id: 'sterile',
    title: 'Habitable, empty',
    prose: 'Four billion years of weather and rock. No copy of itself ever started.',
  },
  snowball: {
    id: 'snowball',
    title: 'White forever',
    prose: 'Ice met the equator and stayed. The thermostat lost.',
  },
  moistGreenhouse: {
    id: 'moistGreenhouse',
    title: 'Steam',
    prose: 'Water reached the stratosphere and left. The sky kept the heat.',
  },
  civLeft: {
    id: 'civLeft',
    title: 'They left',
    prose: 'A lineage that noticed you also learned to leave. The god relationship ended.',
  },
  abandoned: {
    id: 'abandoned',
    title: 'Put down',
    prose: 'You closed the orrery. The planet kept running in memory only.',
  },
  flourish: {
    id: 'flourish',
    title: 'Still arguing',
    prose: 'Regulation held. Diversity climbed. The conversation continues.',
  },
};

export function detectEnding(W) {
  if (W.civ?.left) return ENDINGS.civLeft;
  if (W.state === 'snowball' && (W.iceFrac || 0) > 0.85) return ENDINGS.snowball;
  if (W.state === 'moist-greenhouse') return ENDINGS.moistGreenhouse;
  if ((W.solar || 1) > 4.5) return ENDINGS.redGiant;
  if ((W.inhabitance || 0) < 0.01 && (W.habitability || 0) > 0.45 && (W.ageYr || 0) > 1e9) {
    return ENDINGS.sterile;
  }
  if ((W.meanTemp || 0.5) < 0.05) return ENDINGS.heatDeath;
  if ((W.meanLife || 0) > 0.2 && (W.health || 0) > 0.55) return ENDINGS.flourish;
  return null;
}

/** Build a keepable artefact summary. */
export function finaleArtefact(W, ending = null) {
  const end = ending || detectEnding(W) || ENDINGS.abandoned;
  const style = playStyle(W);
  const tree = W.tree;
  let longest = null, first = null;
  if (tree?.nodes?.length) {
    for (const n of tree.nodes) {
      if (!first || (n.born || 0) < (first.born || 0)) first = n;
      const span = (n.death || W.ageYr || 0) - (n.born || 0);
      if (!longest || span > ((longest.death || W.ageYr) - (longest.born || 0))) longest = n;
    }
  }
  const dedication = [
    first ? `First lineage: ${first.name || 'unnamed'}` : null,
    longest ? `Longest-lived: ${longest.name || 'unnamed'}` : null,
    (W.attribution?.player || 0) < 0.15 ? 'Reached complexity mostly unwatched.' : null,
  ].filter(Boolean).join(' · ');
  return {
    ending: end,
    worldName: W.worldName || W.rule?.name || 'World',
    seed: W.seed,
    ageLabel: formatAge(W.ageYr || 0),
    ageYr: W.ageYr,
    meanLife: W.meanLife,
    meanTemp: W.meanTemp,
    diversity: W.tree?.living?.length || 0,
    playerFrac: W.attribution?.player || 0,
    style,
    moments: Object.values(W.moments || {}).map((m) => m.label),
    dedication,
    writtenAt: Date.now(),
  };
}

export function formatFinaleMarkdown(art) {
  const lines = [
    `# ${art.worldName}`,
    '',
    `**${art.ending.title}** — ${art.ending.prose}`,
    '',
    art.dedication ? `_${art.dedication}_` : '',
    art.dedication ? '' : null,
    `- Age: ${art.ageLabel}`,
    `- Seed: ${art.seed}`,
    `- Life: ${(art.meanLife * 100).toFixed(1)}% · Diversity: ${art.diversity}`,
    `- Your share of the state: ${((art.playerFrac || 0) * 100).toFixed(0)}%`,
  ].filter((x) => x != null);
  if (art.style) lines.push(`- Style: ${art.style.label || art.style.id}`);
  if (art.moments?.length) {
    lines.push('', '## Moments', ...art.moments.slice(0, 24).map((m) => `- ${m}`));
  }
  return lines.join('\n');
}

/** Quiet eulogy for a clade that just died. */
export function cladeEulogy(node, W) {
  if (!node) return '';
  const span = formatAge((node.death || W.ageYr || 0) - (node.born || 0));
  const reason = node.extReason || 'unknown';
  return `${node.name || 'A lineage'} lasted ${span}. Killed by ${reason}. What it left is in the rock.`;
}
