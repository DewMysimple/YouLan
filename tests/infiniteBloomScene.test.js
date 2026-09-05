import test from 'node:test';
import assert from 'node:assert/strict';
import { petalLife, samplePetals, PETAL_POOL_SIZE } from '../src/viewer/bloomPetals.js';
import { INFINITE_BLOOM_DEFAULTS as defaults } from '../src/viewer/infiniteBloomScene.js';

test('one petal opens and expands with age; it never closes or shrinks in flight', () => {
  let previous = petalLife(0, 12, defaults);
  for (let age = .01; age < defaults.cycleDuration + defaults.fallDuration; age += .01) {
    const current = petalLife(age, 12, defaults);
    assert.ok(current.open >= previous.open);
    assert.ok(current.scale >= previous.scale);
    assert.ok(current.radius >= previous.radius);
    assert.ok(current.bend <= previous.bend);
    previous = current;
  }
  const release = petalLife(defaults.cycleDuration, 12, defaults);
  const flight = petalLife(defaults.cycleDuration + 3, 12, defaults);
  for (const key of ['bend', 'tilt', 'scale', 'radius', 'z', 'angle']) assert.equal(release[key], flight[key]);
  assert.ok(flight.driftX > 2 && flight.driftY < -1);
  assert.ok(flight.tumbleX > 0);
});

test('detachment preserves the attached pose and starts flight at zero displacement', () => {
  for (let id = 0; id < 50; id++) {
    const release = petalLife(defaults.cycleDuration, id, defaults);
    for (const key of ['driftX', 'driftY', 'driftZ', 'tumbleX', 'tumbleY', 'tumbleZ']) assert.ok(Math.abs(release[key]) < 1e-12);
    const before = petalLife(defaults.cycleDuration - 1e-6, id, defaults);
    for (const key of ['bend', 'tilt', 'scale', 'radius', 'z']) assert.ok(Math.abs(release[key] - before[key]) < 1e-5);
  }
});

test('continuous births coexist with independent old falling petals for many cycles', () => {
  for (const time of [0, 1, 9.999, 10, 40, 600, 36000]) {
    const petals = samplePetals(time, defaults);
    assert.ok(petals.some(p => p.age < .3));
    assert.equal(petals.filter(p => !p.falling).length, defaults.generations * 5);
    assert.ok(petals.some(p => p.falling && p.fallTime > 2));
    assert.ok(petals.length <= 5 * PETAL_POOL_SIZE);
  }
  const before = samplePetals(9.99999, defaults);
  const after = samplePetals(10.00001, defaults);
  const old = before.find(p => p.falling && p.fallTime > 1);
  const same = after.find(p => p.id === old.id);
  assert.ok(same && Math.abs(same.driftX - old.driftX) < .001, 'UI cycle wrap must not reset flights');
});

test('all supported density and lifetime extremes fit the fixed instance pools', () => {
  for (const generations of [1, 7, 12]) for (const cycleDuration of [3, 10, 18]) for (const fallDuration of [2, 8]) {
    const settings = { ...defaults, generations, cycleDuration, fallDuration };
    for (const time of [0, 12.345, 30000]) {
      const samples = samplePetals(time, settings);
      for (let type = 0; type < 5; type++) assert.ok(samples.filter(p => (p.id % 5 + 5) % 5 === type).length <= PETAL_POOL_SIZE);
    }
  }
});

test('seeking reconstructs the same petals, wind and flutter without frame integration', () => {
  const first = samplePetals(7.3, defaults);
  samplePetals(200, defaults);
  assert.deepEqual(samplePetals(7.3, defaults), first);
});

test('hold duration reserves a stable fully open interval before detachment', () => {
  for (const holdDuration of [.05, .18, .45]) {
    const settings = { ...defaults, holdDuration };
    const mature = petalLife(settings.cycleDuration * (1 - holdDuration), 5, settings);
    const release = petalLife(settings.cycleDuration, 5, settings);
    for (const key of ['open', 'scale', 'tilt', 'bend', 'radius', 'z']) assert.equal(mature[key], release[key]);
  }
});
