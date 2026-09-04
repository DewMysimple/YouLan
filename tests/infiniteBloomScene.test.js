import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bloomEnvelope,
  bloomOpenProgress,
  bloomPhase,
  smootherstep,
} from '../src/viewer/infiniteBloomScene.js';

test('infinite bloom phases are finite, wrapped and evenly staggered', () => {
  const phases = Array.from({ length: 8 }, (_, index) => bloomPhase(0, index, 8, 8));
  assert.deepEqual(phases, [0, .125, .25, .375, .5, .625, .75, .875]);
  assert.equal(bloomPhase(8, 0, 8, 8), 0);
  assert.equal(bloomPhase(-1, 0, 8, 8), .875);
  assert.ok(phases.every(Number.isFinite));
});

test('petals open forward while generations appear, hold, then retire without closing', () => {
  const samples = [0, .08, .2, .48, .65, .8, .94, 1];
  const open = samples.map(phase => bloomOpenProgress(phase, .48));
  for (let index = 1; index < open.length; index++) assert.ok(open[index] >= open[index - 1]);
  assert.equal(open.at(-1), 1);

  const envelope = samples.map(phase => bloomEnvelope(phase, .48, .28));
  assert.equal(envelope[0], 0);
  assert.ok(envelope[3] > .99);
  assert.ok(envelope[5] < envelope[3]);
  assert.equal(envelope.at(-1), 0);
  assert.equal(open.at(-1), 1, 'retiring generation remains fully open');
});

test('smootherstep clamps exact endpoints and remains smooth inside', () => {
  assert.equal(smootherstep(0, 1, -2), 0);
  assert.equal(smootherstep(0, 1, 2), 1);
  assert.equal(smootherstep(0, 1, .5), .5);
});
