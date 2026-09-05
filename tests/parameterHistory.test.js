import test from 'node:test';
import assert from 'node:assert/strict';
import { createParameterHistory } from '../src/viewer/parameterHistory.js';

function controller(object, property, onChange = () => {}) {
  return { object, property, _name: property, _onChange: onChange,
    getValue() { return object[property]; }, updateDisplay() {},
    setValue(value) { object[property] = value; this._onChange(value); return this; },
    _callOnFinishChange() {},
  };
}
test('continuous edits form one step; callbacks restore actual output and redo branches', () => {
  const p = { strength: 1 }, output = { strength: 1 };
  const c = controller(p, 'strength', value => { output.strength = value; });
  const h = createParameterHistory([c]);
  c.setValue(2); c.setValue(3); c.setValue(4); c._callOnFinishChange();
  h.undo(); assert.equal(p.strength, 1); assert.equal(output.strength, 1); assert.equal(h.canUndo, false);
  h.redo(); assert.equal(output.strength, 4);
  h.undo(); c.setValue(5); c._callOnFinishChange(); assert.equal(h.canRedo, false);
  h.dispose();
});
test('a palette transaction restores all custom colors without rerunning the preset', () => {
  const p = { a: '#123456', b: '#654321' }, s = { palette: 'custom' };
  const palette = controller(s, 'palette', () => { p.a = '#00ff00'; p.b = '#ffff00'; });
  palette.historyDerived = true;
  const a = controller(p, 'a'), b = controller(p, 'b');
  const h = createParameterHistory([palette, a, b]);
  palette.setValue('green'); palette._callOnFinishChange();
  h.undo(); assert.deepEqual(p, { a: '#123456', b: '#654321' });
  h.redo(); assert.deepEqual(p, { a: '#00ff00', b: '#ffff00' });
  h.dispose();
});
test('default snapshots are immutable, scoped, and resetting is undoable', () => {
  const p = { a: 1, b: 2 }; const a = controller(p, 'a'), b = controller(p, 'b');
  const h = createParameterHistory([a, b]);
  a.setValue(7); b.setValue(8); h.reset([a], 'reset a');
  assert.deepEqual(p, { a: 1, b: 8 });
  h.undo(); assert.deepEqual(p, { a: 7, b: 8 });
  h.redo(); h.reset([a, b], 'reset all'); assert.deepEqual(p, { a: 1, b: 2 });
  h.dispose();
});
test('unrelated live clocks are excluded and cross-scene edits remain independent', () => {
  const p = { value: 1, timeline: 0 }, q = { value: 9 };
  const a = controller(p, 'value'), clock = controller(p, 'timeline'), b = controller(q, 'value');
  const h = createParameterHistory([a, clock, b]);
  a.setValue(2); p.timeline = 12; a._callOnFinishChange();
  b.setValue(7); b._callOnFinishChange(); h.undo();
  assert.equal(q.value, 9); assert.equal(p.value, 2);
  h.undo(); assert.equal(p.value, 1); assert.equal(p.timeline, 12);
  h.dispose();
});
test('seek side effects and playback are restored together', () => {
  const p = { timeline: 0, playing: true };
  const timeline = controller(p, 'timeline', () => { p.playing = false; });
  const playing = controller(p, 'playing');
  const h = createParameterHistory([timeline, playing]);
  timeline.setValue(4); timeline._callOnFinishChange();
  h.undo(); assert.deepEqual(p, { timeline: 0, playing: true });
  h.redo(); assert.deepEqual(p, { timeline: 4, playing: false }); h.dispose();
});
test('existing reset buttons are recorded as one atomic operation', () => {
  const p = { a: 1, b: 2 }, actions = { reset() { p.a = 1; p.b = 2; } };
  const a = controller(p, 'a'), b = controller(p, 'b'), reset = controller(actions, 'reset');
  const original = actions.reset;
  const h = createParameterHistory([a, b, reset]);
  a.setValue(3); b.setValue(4); actions.reset();
  h.undo(); assert.deepEqual(p, { a: 3, b: 4 });
  h.dispose(); assert.equal(actions.reset, original);
});
