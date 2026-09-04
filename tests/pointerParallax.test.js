import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPointerParallax, POINTER_PARALLAX_DEFAULTS } from '../src/viewer/pointerParallax.js';

function fixture() {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 1000);
  camera.position.set(0, 0, 14);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const controls = new THREE.EventDispatcher();
  controls.target = new THREE.Vector3();
  const element = new EventTarget();
  element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 });
  let renders = 0;
  const parallax = createPointerParallax(camera, controls, element, () => { renders++; });
  return { camera, controls, element, parallax, renders: () => renders };
}

test('pointer parallax adds temporary three-dimensional camera motion and restores the Orbit pose', () => {
  const { camera, parallax } = fixture();
  const basePosition = camera.position.clone();
  const baseQuaternion = camera.quaternion.clone();
  const nearPoint = new THREE.Vector3(0, 0, 0);
  const farPoint = new THREE.Vector3(0, 0, -20);
  const baseSeparation = farPoint.clone().project(camera).x - nearPoint.clone().project(camera).x;
  parallax.setPointer(1, 0.5);
  assert.equal(parallax.update(0), true);
  for (let time = 50; time <= 350; time += 50) parallax.update(time);
  assert.ok(parallax.current.x > 0.9 && parallax.current.y > 0.45);
  assert.equal(parallax.apply(), true);
  assert.ok(camera.position.x > 0, 'right pointer moves the virtual camera right');
  assert.ok(camera.position.y > 0, 'upper pointer moves the virtual camera up');
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).x < 0, 'camera keeps looking toward the focus target');
  const shiftedSeparation = farPoint.clone().project(camera).x - nearPoint.clone().project(camera).x;
  assert.ok(Math.abs(shiftedSeparation - baseSeparation) > 0.01, 'near and far slices receive different screen displacement');
  parallax.restoreCamera();
  assert.ok(camera.position.distanceTo(basePosition) < 1e-12);
  assert.ok(1 - Math.abs(camera.quaternion.dot(baseQuaternion)) < 1e-12);
  parallax.dispose();
});

test('pointer response is frame-rate independent, settles, and yields to OrbitControls interactions', () => {
  const { controls, parallax, renders } = fixture();
  parallax.setPointer(-1, 1);
  parallax.update(0);
  parallax.update(100);
  const after100 = parallax.current.clone();
  assert.ok(after100.x < 0 && after100.y > 0);
  controls.dispatchEvent({ type: 'start' });
  assert.deepEqual(parallax.current.toArray(), [0, 0]);
  assert.deepEqual(parallax.target.toArray(), [0, 0]);
  controls.dispatchEvent({ type: 'end' });
  parallax.setPointer(1, 0);
  parallax.update(200);
  let active = true;
  for (let time = 300; time <= 1800; time += 100) active = parallax.update(time);
  assert.deepEqual(parallax.current.toArray(), [1, 0]);
  assert.equal(active, false, 'settled parallax no longer requests animation frames');
  assert.ok(renders() >= 4);
  parallax.setReducedMotion(true);
  parallax.setPointer(-1, -1);
  assert.deepEqual(parallax.target.toArray(), [0, 0]);
  assert.equal(parallax.update(2000), false);
  parallax.restoreDefaults();
  assert.deepEqual(parallax.parameters, { ...POINTER_PARALLAX_DEFAULTS });
  parallax.dispose();
});
