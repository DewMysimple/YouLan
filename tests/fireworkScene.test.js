import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildFireworkSparkGeometry,
  buildFireworkTrailLineGeometry,
  buildFireworkTrailGeometry,
  buildRocketGeometry,
  createFireworkScene,
  FIREWORK_DEFAULTS,
  FIREWORK_LIMITS,
  FIREWORK_QUALITY,
} from '../src/viewer/fireworkScene.js';

test('firework trail, sparkle and rocket batches are deterministic and finite', () => {
  const trailA = buildFireworkTrailGeometry({ branches: 8, samples: 12, seed: 17 });
  const trailB = buildFireworkTrailGeometry({ branches: 8, samples: 12, seed: 17 });
  assert.equal(trailA.attributes.position.count, 96);
  assert.deepEqual(trailA.attributes.fireworkSpeedScale.array, trailB.attributes.fireworkSpeedScale.array);
  assert.deepEqual(trailA.attributes.fireworkPhase.array, trailB.attributes.fireworkPhase.array);
  assert.ok(Array.from(trailA.attributes.fireworkSpeedScale.array).every(Number.isFinite));
  const trailLines = buildFireworkTrailLineGeometry({ branches: 8, samples: 12, seed: 17 });
  assert.equal(trailLines.attributes.position.count, 176);
  assert.equal(trailLines.attributes.fireworkSegment.getX(0), 0);
  assert.equal(trailLines.attributes.fireworkSegment.getX(2), 1);

  const sparksA = buildFireworkSparkGeometry(128, { seed: 29 });
  const sparksB = buildFireworkSparkGeometry(128, { seed: 29 });
  assert.equal(sparksA.attributes.position.count, 128);
  assert.deepEqual(sparksA.attributes.sparkDelay.array, sparksB.attributes.sparkDelay.array);
  assert.deepEqual(sparksA.attributes.sparkVelocity.array, sparksB.attributes.sparkVelocity.array);
  assert.ok(Array.from(sparksA.attributes.sparkVelocity.array).every(Number.isFinite));
  assert.ok(Array.from(sparksA.attributes.sparkLife.array).every((value) => value > 0));

  const rocket = buildRocketGeometry(48, { seed: 41 });
  assert.equal(rocket.attributes.position.count, 48);
  assert.equal(rocket.attributes.rocketSample.getX(0), 0);
  assert.equal(rocket.attributes.rocketSample.getX(47), 1);
  [trailA, trailB, trailLines, sparksA, sparksB, rocket].forEach((geometry) => geometry.dispose());
});

test('firework scene owns fixed GPU batches, timeline, presets, quality and cleanup', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const scene = new THREE.Scene();
    const firework = createFireworkScene(scene, { getPixelRatio: () => 1 }, () => {});
    assert.equal(firework.root.parent, scene);
    assert.equal(firework.background.parent, scene);
    assert.deepEqual(
      firework.root.children.filter((child) => child.isPoints).map((child) => child.name),
      ['上升火箭尾迹', '金菊放射主枝', '冷绿白闪烁簇'],
    );
    assert.equal(firework.trails.geometry.attributes.position.count,
      FIREWORK_LIMITS.branches * FIREWORK_LIMITS.trailSamples);
    assert.equal(firework.trailLines.geometry.attributes.position.count,
      FIREWORK_LIMITS.branches * (FIREWORK_LIMITS.trailSamples - 1) * 2);
    assert.equal(firework.sparks.geometry.attributes.position.count, FIREWORK_LIMITS.sparks);
    assert.equal(firework.visibleSparkCount,
      Math.floor(FIREWORK_DEFAULTS.sparkCount * FIREWORK_QUALITY[FIREWORK_DEFAULTS.quality].particleScale));

    firework.activate();
    assert.equal(firework.update(0), true);
    firework.update(1000);
    assert.ok(firework.parameters.timeline > 0);
    firework.seek(4.5);
    assert.equal(firework.parameters.timeline, 4.5);
    assert.equal(firework.parameters.playing, false);
    firework.replay();
    assert.equal(firework.parameters.timeline, 0);
    assert.equal(firework.parameters.playing, true);

    firework.parameters.quality = '高质量';
    firework.parameters.sparkCount = 4321;
    firework.apply();
    assert.equal(firework.visibleSparkCount, 4321);
    firework.setBackgroundPreset('梦境夜色');
    assert.equal(firework.parameters.backgroundColor, '#090016');
    assert.equal(firework.background.material.uniforms.fireworkBackgroundStrength.value, .68);

    firework.setReducedMotion(true);
    assert.equal(firework.parameters.playing, false);
    assert.equal(firework.update(1200), false);
    firework.dispose();
    firework.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    globalThis.window = previousWindow;
  }
});
