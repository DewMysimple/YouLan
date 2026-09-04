import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildPollenGeometry,
  createPollenScene,
  POLLEN_DEFAULTS,
  POLLEN_LIMITS,
} from '../src/viewer/pollenScene.js';

test('three-layer pollen geometry is deterministic, finite and bounded', () => {
  const a = buildPollenGeometry(64, { seed: 42, width: 20, height: 12, depth: 18 });
  const b = buildPollenGeometry(64, { seed: 42, width: 20, height: 12, depth: 18 });
  assert.deepEqual(a.attributes.position.array, b.attributes.position.array);
  assert.equal(a.attributes.position.count, 64);
  assert.equal(a.attributes.particleSize.count, 64);
  assert.equal(a.attributes.particlePhase.count, 64);
  assert.equal(a.attributes.particleColorMix.count, 64);
  assert.ok(Array.from(a.attributes.position.array).every(Number.isFinite));
  assert.ok(a.boundingSphere.radius <= Math.hypot(10, 6, 9));
  a.dispose(); b.dispose();
});

test('pollen scene owns three batched layers, central core, animation state and cleanup', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const scene = new THREE.Scene();
    const pollen = createPollenScene(scene, { getPixelRatio: () => 1 }, () => {});
    assert.equal(pollen.layers.length, 3);
    assert.equal(pollen.root.parent, scene);
    assert.equal(pollen.core.name, '中央能量核心');
    assert.deepEqual(pollen.layers.map(({ geometry }) => geometry.drawRange.count), [
      POLLEN_DEFAULTS.dustCount,
      POLLEN_DEFAULTS.pollenCount,
      POLLEN_DEFAULTS.petalCount,
    ]);
    assert.deepEqual(pollen.layers.map(({ geometry }) => geometry.attributes.position.count), [
      POLLEN_LIMITS.dust,
      POLLEN_LIMITS.pollen,
      POLLEN_LIMITS.petals,
    ]);
    pollen.activate();
    assert.equal(pollen.update(0), true);
    pollen.update(1000);
    assert.ok(pollen.layers[0].material.uniforms.pollenTime.value > 0);
    pollen.setReducedMotion(true);
    assert.equal(pollen.parameters.animated, false);
    assert.equal(pollen.update(1100), false);
    pollen.parameters.dustCount = 12;
    pollen.parameters.pollenCount = 34;
    pollen.parameters.petalCount = 56;
    pollen.apply();
    assert.deepEqual(pollen.layers.map(({ geometry }) => geometry.drawRange.count), [12, 34, 56]);
    pollen.dispose(); pollen.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    globalThis.window = previousWindow;
  }
});
