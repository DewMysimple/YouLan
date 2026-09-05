// Store parameter edits, not animation frames. One drag / text edit is one step.
// Controllers remain the owners of validation and renderer synchronization.
export function createParameterHistory(controllers, { onRefresh = () => {}, limit = 100 } = {}) {
  const values = controllers.filter(c => typeof c.getValue() !== 'function' && c.property !== 'scene');
  const defaults = new Map(values.map(c => [c, c.getValue()]));
  const undoStack = [], redoStack = [], cleanups = [];
  let pending = null, applying = false;
  const snapshot = () => new Map(values.map(c => [c, c.getValue()]));
  function record(before, label, origin) {
    const changes = values.flatMap(c => {
      // Live clocks may advance while a slider is held; only track explicit seeks.
      if (['time', 'timeline'].includes(c.property) && origin && origin !== c && typeof origin.getValue() !== 'function') return [];
      const from = before.get(c), to = c.getValue();
      return Object.is(from, to) ? [] : [{ controller: c, from, to }];
    });
    if (changes.length) {
      undoStack.push({ label, changes });
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
    }
    onRefresh();
  }
  function finish() {
    if (!pending) return;
    const edit = pending; pending = null;
    record(edit.before, edit.controller._name, edit.controller);
  }
  function apply(changes, key) {
    applying = true;
    try {
      // Preset selectors describe values already included in the snapshot.
      // Replaying their callbacks would overwrite a user's custom colors.
      changes.forEach(({ controller: c, [key]: value }) => { c.object[c.property] = value; });
      const ordered = [...changes].sort((a, b) => Number(a.controller.property === 'playing') - Number(b.controller.property === 'playing'));
      ordered.forEach(({ controller: c, [key]: value }) => {
        if (!c.historyDerived) c._onChange?.call(c, value);
      });
      // seek callbacks can pause playback; explicit saved playback wins.
      changes.forEach(({ controller: c, [key]: value }) => { c.object[c.property] = value; });
      values.forEach(c => c.updateDisplay());
    } finally { applying = false; onRefresh(); }
  }
  for (const c of controllers) {
    if (typeof c.getValue() === 'function') {
      const original = c.object[c.property];
      const wrapped = function (...args) {
        if (applying) return original.apply(this, args);
        finish();
        if (c.historyIgnore) return original.apply(this, args);
        const before = snapshot();
        const result = original.apply(this, args);
        // File loading is managed separately; record synchronous parameter actions.
        record(before, c._name, c);
        return result;
      };
      c.object[c.property] = wrapped;
      cleanups.push(() => { if (c.object[c.property] === wrapped) c.object[c.property] = original; });
      continue;
    }
    if (!values.includes(c)) continue;
    const setValue = c.setValue, finishChange = c._callOnFinishChange;
    c.setValue = function (value) {
      if (!applying) {
        if (pending?.controller !== c) finish();
        pending ??= { controller: c, before: snapshot() };
      }
      const result = setValue.call(c, value);
      if (!applying) onRefresh();
      return result;
    };
    c._callOnFinishChange = function () { finishChange.call(c); if (!applying) finish(); };
    cleanups.push(() => { c.setValue = setValue; c._callOnFinishChange = finishChange; });
  }
  return {
    finish,
    get canUndo() { return !!pending || undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    get undoLabel() { return pending?.controller._name ?? undoStack.at(-1)?.label ?? ''; },
    undo() { finish(); const edit = undoStack.pop(); if (!edit) return; apply(edit.changes, 'from'); redoStack.push(edit); onRefresh(); },
    redo() { finish(); const edit = redoStack.pop(); if (!edit) return; apply(edit.changes, 'to'); undoStack.push(edit); onRefresh(); },
    reset(selected, label) {
      finish(); const before = snapshot();
      apply(values.filter(c => selected.includes(c)).map(c => ({ controller: c, to: defaults.get(c) })), 'to');
      record(before, label);
    },
    dispose() { pending = null; cleanups.forEach(cleanup => cleanup()); undoStack.length = redoStack.length = 0; },
  };
}
