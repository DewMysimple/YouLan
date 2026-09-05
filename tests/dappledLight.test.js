import test from 'node:test';
import assert from 'node:assert/strict';
import { createDappledMotion } from '../src/viewer/dappledLightScene.js';

test('dappled pointer is frame-rate independent, reverses continuously and settles to idle', () => {
  function simulate(hz) {
    const motion = createDappledMotion();
    motion.parameters.animate = false;
    motion.activate();
    motion.setPointer(0.9, 0.1);
    motion.update(0);
    for (let frame = 1; frame <= hz; frame++) motion.update(frame * 1000 / hz);
    return motion;
  }
  const a = simulate(30), b = simulate(120);
  assert.ok(a.pointer.distanceTo(b.pointer) < 1e-9);
  const previous = a.pointer.clone();
  a.setPointer(0.1, 0.9);
  a.update(1033);
  assert.ok(a.pointer.x < previous.x && a.pointer.x > 0.1);
  let pending = true;
  for (let t = 1066; t < 5000; t += 33) pending = a.update(t);
  assert.equal(pending, false);
  assert.deepEqual(a.pointer.toArray(), [0.1, 0.9]);
});

test('hidden and inactive dappled scenes freeze; resuming never integrates the hidden interval', () => {
  const m = createDappledMotion();
  m.activate(); m.update(0); m.update(16);
  const time = m.time;
  assert.equal(m.update(1000, false), false);
  assert.equal(m.update(20000, false), false);
  assert.equal(m.time, time);
  m.update(30000);
  assert.ok(m.time - time < 0.04);
  m.deactivate();
  const stopped = m.time;
  assert.equal(m.setPointer(0, 0), false);
  assert.equal(m.update(60000), false);
  assert.equal(m.time, stopped);
});

test('reduced motion, disabled follow, zero speed and instant response have deterministic static states', () => {
  const m = createDappledMotion();
  m.activate();
  m.parameters.responseTime = 0;
  m.parameters.speed = 0;
  m.setPointer(-5, 20);
  assert.equal(m.update(0), false);
  assert.deepEqual(m.pointer.toArray(), [0, 1]);
  m.parameters.followPointer = false;
  assert.equal(m.setPointer(0, 0), false);
  assert.equal(m.update(16), false);
  assert.deepEqual(m.pointer.toArray(), [0.5, 0.5]);
  m.reset();
  m.setReducedMotion(true);
  assert.equal(m.setPointer(1, 1), false);
  const time = m.time;
  assert.equal(m.update(30000), false);
  assert.equal(m.time, time);
  m.setReducedMotion(false);
  assert.equal(m.update(30016), true);
});
