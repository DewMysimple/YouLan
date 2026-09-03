import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addEmissionUV } from '../src/viewer/localEmission.js';
import { DEPTH_DEFAULTS, frameFirstSlice, PHYSICAL_BASELINE } from '../src/viewer/depthPresentation.js';
import { SLICE_DEFAULTS, sliceExponent } from '../src/viewer/sliceAccumulation.js';
import { createSelectiveBloom } from '../src/viewer/selectiveBloom.js';
import { buildArrayGeometry } from '../src/viewer/arrayModifier.js';

test('new curve reserves measurable dynamic range for 50–100 overlaps', () => {
  const { strength, limit, clarity } = SLICE_DEFAULTS;
  const f = n => sliceExponent(n, strength, limit);
  assert.equal(clarity, 0);
  assert.ok(f(50) / limit < 0.7);
  assert.ok(f(100) - f(80) > 0.1);
  assert.ok(f(100) / limit < 0.8);
  assert.equal(PHYSICAL_BASELINE.opacity, 1);
  assert.equal(PHYSICAL_BASELINE.transmission, 1);
});

test('localized emission has dedicated UVs and arrays preserve them without mutating base UV/normal', () => {
  const geometry = new THREE.BoxGeometry(0.42, 9.1, 9.1);
  const originalUV = geometry.attributes.uv.array.slice();
  const originalNormal = geometry.attributes.normal.array.slice();
  addEmissionUV(geometry);
  assert.deepEqual(geometry.attributes.uv.array, originalUV);
  assert.deepEqual(geometry.attributes.normal.array, originalNormal);
  assert.equal(geometry.attributes.uv1.count, geometry.attributes.position.count);
  assert.ok([...geometry.attributes.uv1.array].every(n => Number.isFinite(n) && n >= 0 && n <= 1));
  const array = buildArrayGeometry(geometry, new THREE.Matrix4(), [new THREE.Vector3(),new THREE.Vector3(0,0,-2)]);
  assert.deepEqual(array.attributes.uv1.array.slice(geometry.attributes.uv1.array.length), geometry.attributes.uv1.array);
  array.dispose(); geometry.dispose();
});

test('first-slice framing respects horizontal/vertical viewport and stays independent of total array depth', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-4.55,-4.55,-0.21), new THREE.Vector3(4.55,4.55,0.21));
  for (const aspect of [0.46, 1, 1.44, 2.5]) {
    const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    const controls = { target: new THREE.Vector3(), update() { camera.lookAt(this.target); camera.updateMatrixWorld(); } };
    frameFirstSlice(camera, controls, bounds, DEPTH_DEFAULTS.fov);
    for (const x of [-4.55,4.55]) for (const y of [-4.55,4.55]) {
      const p = new THREE.Vector3(x,y,0.21).project(camera);
      assert.ok(Math.abs(p.x) < 0.8 && Math.abs(p.y) < 0.8);
    }
    assert.ok(camera.far > 100 * DEPTH_DEFAULTS.spacing);
  }
});

test('Bloom unsupported/disabled path retains original renderer and disposal is idempotent', () => {
  let renders = 0;
  const renderer = { extensions: { has: () => false } };
  const bloom = createSelectiveBloom(renderer, () => renders++);
  bloom.render({},{});
  assert.equal(renders,1); assert.equal(bloom.supported,false);
  bloom.dispose(); bloom.dispose(); bloom.render({},{});
  assert.equal(renders,1);
});
