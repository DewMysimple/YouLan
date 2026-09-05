export const clamp01 = value => Math.max(0, Math.min(1, value));
export const easeOut = value => 1 - Math.pow(1 - clamp01(value), 3);
export const easeInOut = value => {
  const t = clamp01(value);
  return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

// Explicit states make pause, replay and the paper-only ending independent
// of the source site's loader, Vue runtime and chapter manager.
export function createOpeningMotion() {
  let stage = 'line', elapsed = 0, previous = null;
  return {
    get stage() { return stage; }, get elapsed() { return elapsed; },
    pause() { previous = null; },
    show(next) { stage = next; elapsed = 0; previous = null; },
    enter(reduced = false) { if (stage === 'ready') this.show(reduced ? 'paper' : 'reveal'); },
    update(timestamp, { active, visible, ready, reduced, lineDuration, revealDuration }) {
      if (!active || !visible) { previous = null; return false; }
      if (reduced && ready && ['line', 'circle'].includes(stage)) this.show('ready');
      if (reduced && stage === 'reveal') this.show('paper');
      const delta = previous === null ? 0 : Math.max(0, Math.min(.05, (timestamp - previous) / 1000));
      previous = timestamp;
      if (!['ready', 'paper'].includes(stage)) elapsed += delta;
      if (stage === 'line' && elapsed >= lineDuration && ready) this.show('circle');
      else if (stage === 'circle' && elapsed >= 1.4) this.show('ready');
      else if (stage === 'reveal' && elapsed >= revealDuration) this.show('paper');
      return !['ready', 'paper'].includes(stage);
    },
  };
}
