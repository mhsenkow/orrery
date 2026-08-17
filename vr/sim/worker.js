/** Simulation worker — off-main-thread tick skeleton.
 *  Next backlog item 45. Main still owns GL; worker can run headless ticks. */

/// <reference lib="webworker" />

let ready = false;

async function boot() {
  // Dynamic import of world modules inside worker
  const { generate, simTick, W, RULESETS } = await import('../world.js');
  self.W = W;
  self.generate = generate;
  self.simTick = simTick;
  self.RULESETS = RULESETS;
  ready = true;
  self.postMessage({ type: 'ready' });
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === 'init') {
      await boot();
      return;
    }
    if (!ready) await boot();
    if (msg.type === 'generate') {
      const rule = self.RULESETS.find((r) => r.id === msg.ruleId) || self.RULESETS[0];
      self.generate(msg.seed || 0, { ...rule, deepTime: !!msg.deepTime });
      self.postMessage({ type: 'generated', seed: msg.seed, ageYr: self.W.ageYr });
      return;
    }
    if (msg.type === 'tick') {
      const n = msg.ticks || 1;
      for (let i = 0; i < n; i++) self.simTick(true);
      const W = self.W;
      self.postMessage({
        type: 'tickDone',
        ageYr: W.ageYr,
        meanTemp: W.meanTemp,
        meanLife: W.meanLife,
        O2: W.gases.O2,
        hashHint: (W.meanTemp * 1e6 + W.meanLife * 1e3) | 0,
      });
      return;
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message || e) });
  }
};
