import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createArrayLayer, evaluateArray, buildArrayGeometry, arrayBaseBounds, fitArray } from '../src/viewer/arrayModifier.js';

const bounds = new THREE.Box3(new THREE.Vector3(-4.55, -4.55, -0.21), new THREE.Vector3(4.55, 4.55, 0.21));
const layer = (values = {}) => ({ ...createArrayLayer(), ...values });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test('counts include original; positive, negative, combined, zero and disabled offsets', () => {
  assert.equal(evaluateArray([], bounds).count, 1);
  close(evaluateArray([layer()], bounds).offsets[1].x, 9.1);
  const negative = evaluateArray([layer({ relativeX: -1, constant: true, constantX: -0.5 })], bounds);
  close(negative.offsets[1].x, -9.6);
  close(negative.bounds.min.x, -14.15);
  assert.equal(evaluateArray([layer({ relative: false })], bounds).overlapping, true);
  assert.equal(evaluateArray([layer({ enabled: false })], bounds).count, 1);
});

test('stacked modifiers use previous bounds, and order matters', () => {
  const grid = evaluateArray([layer(), layer({ count: 3, relativeX: 0, relativeY: 1 })], bounds);
  assert.equal(grid.count, 6);
  close(grid.bounds.getSize(new THREE.Vector3()).x, 18.2);
  close(grid.bounds.getSize(new THREE.Vector3()).y, 27.3);
  close(evaluateArray([layer(), layer()], bounds).offsets[2].x, 18.2);
  const constant = layer({ relative: false, constant: true, constantX: 2 });
  assert.notDeepEqual(evaluateArray([layer(), constant], bounds).offsets, evaluateArray([constant, layer()], bounds).offsets);
});

test('layer, per-layer, total, integer and numeric safety limits', () => {
  assert.throws(() => evaluateArray(Array.from({ length: 9 }, () => layer({ count: 1 })), bounds), /8/);
  for (const count of [0, 101, 1.5, NaN]) assert.throws(() => evaluateArray([layer({ count })], bounds), /整数/);
  assert.equal(evaluateArray(Array.from({ length: 8 }, () => layer()), bounds).count, 256);
  assert.throws(() => evaluateArray([layer({ count: 100 }), layer({ count: 3 })], bounds), /256/);
  assert.throws(() => evaluateArray([layer({ relativeX: Infinity })], bounds), /有限/);
  assert.throws(() => evaluateArray([layer({ relativeX: 1e40 })], bounds), /范围/);
});

test('geometry retains two material groups and immutable attributes; offsets use webpage axes', () => {
  const base = new THREE.BoxGeometry(0.42, 9.1, 9.1);
  base.clearGroups(); base.addGroup(0, 30, 0); base.addGroup(30, 6, 1);
  const original = base.attributes.position.array.slice();
  const matrix = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  const result = evaluateArray([layer()], arrayBaseBounds(base, matrix));
  const output = buildArrayGeometry(base, matrix, result.offsets);
  assert.deepEqual(output.groups, [{ start: 0, count: 60, materialIndex: 0 }, { start: 60, count: 12, materialIndex: 1 }]);
  assert.deepEqual(base.attributes.position.array, original);
  const first = new THREE.Vector3().fromBufferAttribute(output.attributes.position, 0).applyMatrix4(matrix);
  const second = new THREE.Vector3().fromBufferAttribute(output.attributes.position, base.attributes.position.count).applyMatrix4(matrix);
  close(second.x - first.x, 9.1); close(second.z - first.z, 0);
  assert.deepEqual(output.attributes.normal.array.slice(0, base.attributes.normal.array.length), base.attributes.normal.array);
  assert.deepEqual(buildArrayGeometry(base, matrix, [new THREE.Vector3()]).attributes.position.array, original);
  base.dispose(); output.dispose();
});

test('fit keeps camera direction and contains all bounding-box corners', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(18.2, 27.3, 0.42));
  mesh.position.set(4.55, 9.1, 0); mesh.updateMatrixWorld();
  const camera = new THREE.PerspectiveCamera(40, 1.4, 0.1, 1000);
  camera.position.set(10, 8, 20);
  const before = camera.position.clone().normalize();
  const controls = { target: new THREE.Vector3(), update() { camera.lookAt(this.target); camera.updateMatrixWorld(); } };
  fitArray(camera, controls, mesh);
  close(camera.position.clone().sub(controls.target).normalize().distanceTo(before), 0);
  const box = new THREE.Box3().setFromObject(mesh);
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).project(camera);
    assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1);
  }
  mesh.geometry.dispose(); mesh.material.dispose();
});
