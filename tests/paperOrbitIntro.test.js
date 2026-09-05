import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { samplePaperIntro, createPaperOrbitIntro, PAPER_INTRO_DURATION } from '../src/viewer/paperOrbitIntro.js';
import { sampleOrbit, createLanes } from '../src/viewer/paperOrbitMotion.js';

function leadAt(seconds, speed = 1, radius = 4.3) {
  const lead = sampleOrbit(createLanes()[0], Math.PI / 2 + seconds * .13 * speed, radius, .28);
  return { ...lead, quaternion: new THREE.Quaternion(), size: .22 };
}

test('intro opens on one aircraft, clears planet and reaches the exact live pose and final camera', () => {
  const camera = new THREE.PerspectiveCamera(43, 1.44, .05, 200);
  for (const speed of [0, 1, 2]) for (const radius of [4.2, 8]) {
    for (let i = 0; i <= 500; i++) {
      const t = i / 500, lead = leadAt(t * PAPER_INTRO_DURATION, speed, radius);
      const pose = samplePaperIntro(t, lead);
      assert.ok(pose.position.length() >= radius - .17, 'hero clears the planet');
      assert.ok(pose.cameraPosition.length() > 3.3, 'camera clears the planet');
      assert.ok(pose.position.toArray().every(Number.isFinite));
      if (t < .2) {
        camera.position.copy(pose.cameraPosition); camera.lookAt(pose.target); camera.updateMatrixWorld();
        const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        assert.equal(frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(), 10)), false, 'planet and flock outside opening view');
        assert.equal(frustum.containsPoint(pose.position), true);
      }
      if (i === 500) {
        assert.ok(pose.position.distanceTo(lead.position) < 1e-10);
        assert.ok(pose.quaternion.angleTo(lead.quaternion) < 1e-10);
        assert.deepEqual(pose.cameraPosition.toArray(), [0, 2.4, 18.8]);
        assert.deepEqual(pose.target.toArray(), [0, 0, 0]);
      }
    }
  }
});

test('intro waits for assets, pauses hidden time and releases camera constraints on finish', () => {
  const camera = new THREE.PerspectiveCamera(43, 1.44, .05, 200);
  const controls = { enabled: true, minDistance: 8, maxDistance: 50, target: new THREE.Vector3(), update() {} };
  const hero = new THREE.Mesh(), snapshots = [];
  const intro = createPaperOrbitIntro({ camera, controls, resetParallax() {}, requestRender() {}, onChange(s) { snapshots.push(s); } });
  intro.start();
  assert.equal(controls.enabled, false);
  intro.update(1000, true, null, hero);
  intro.update(5000, true, leadAt(0), hero);
  assert.equal(snapshots.at(-1).elapsed, 0, 'loading does not consume intro time');
  intro.update(5050, true, leadAt(.05), hero);
  const before = snapshots.at(-1).elapsed;
  intro.update(6000, false, leadAt(1), hero);
  intro.update(90000, true, leadAt(1), hero);
  assert.equal(snapshots.at(-1).elapsed, before, 'hidden time is discarded');
  intro.pauseClock();
  intro.update(180000, true, leadAt(1), hero);
  assert.equal(snapshots.at(-1).elapsed, before);
  intro.finish(); intro.finish();
  assert.equal(intro.ownsCamera, false);
  assert.equal(controls.enabled, true);
  assert.equal(controls.minDistance, 8);
  assert.equal(controls.maxDistance, 50);
  assert.deepEqual(camera.position.toArray(), [0, 2.4, 18.8]);
});
