import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPaperOrbitSky, createCloudBanks, PAPER_SKY_DEFAULTS } from '../src/viewer/paperOrbitSky.js';

test('cloud banks span the approach and world depths, sort after camera motion and freeze at zero delta', () => {
  const banks = createCloudBanks();
  assert.equal(banks.length, 66);
  assert.deepEqual(banks, createCloudBanks());
  assert.ok(banks.some(b => b.center.z > 40));
  assert.ok(banks.some(b => b.center.z < -40));
  const root = new THREE.Group(), camera = new THREE.PerspectiveCamera(43, 1.44, .05, 200);
  const parameters = { ...PAPER_SKY_DEFAULTS, backgroundTop: '#718fb9', backgroundBottom: '#c8afcf', backgroundAccent: '#b8d4dd' };
  const sky = createPaperOrbitSky(root, camera, parameters);
  sky.apply();
  assert.equal(sky.clouds.count, 660);
  function verifySorting() {
    let last = -Infinity;
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    for (let i = 0; i < sky.clouds.count; i++) {
      sky.clouds.getMatrixAt(i, matrix);
      point.setFromMatrixPosition(matrix).applyMatrix4(camera.matrixWorldInverse);
      assert.ok(point.z >= last - 1e-5);
      last = point.z;
    }
  }
  camera.position.set(-2, 2, 36); camera.lookAt(3, 3, 43); sky.update(0); verifySorting();
  const snapshot = Array.from(sky.clouds.instanceMatrix.array);
  sky.update(0); assert.deepEqual(Array.from(sky.clouds.instanceMatrix.array), snapshot);
  sky.update(1); assert.notDeepEqual(Array.from(sky.clouds.instanceMatrix.array), snapshot);
  camera.position.set(0, 2.4, 18.8); camera.lookAt(0, 0, 0); sky.update(0); verifySorting();
  assert.deepEqual(sky.backdrop.material.uniforms.cameraWorld.value, camera.matrixWorld);
  parameters.clouds = false; parameters.sunStrength = 0; sky.apply();
  assert.equal(sky.clouds.visible, false);
  assert.equal(sky.backdrop.material.uniforms.sunStrength.value, 0);
  for (const object of [sky.clouds, sky.backdrop]) { object.geometry.dispose(); object.material.dispose(); object.dispose?.(); }
});
