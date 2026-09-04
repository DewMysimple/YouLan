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

function pointer(type, { x, y, buttons = 0, pointerType = 'mouse' } = {}) {
  const event = new Event(type);
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerType: { value: pointerType },
    clientX: { value: x },
    clientY: { value: y },
    buttons: { value: buttons },
  });
  return event;
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

test('OrbitControls takes over the visible pose without a snap and recenters relative pointer input', () => {
  const { camera, controls, element, parallax } = fixture();
  element.dispatchEvent(pointer('pointermove', { x: 900, y: 100 }));
  parallax.update(0);
  for (let time = 50; time <= 500; time += 50) parallax.update(time);

  parallax.apply();
  const visiblePosition = camera.position.clone();
  const visibleQuaternion = camera.quaternion.clone();
  parallax.restoreCamera();
  const oldTarget = controls.target.clone();

  element.dispatchEvent(pointer('pointerdown', { x: 900, y: 100, buttons: 1 }));
  controls.dispatchEvent({ type: 'start' });
  assert.ok(camera.position.distanceTo(visiblePosition) < 1e-12, 'interaction begins at the rendered pose');
  assert.ok(1 - Math.abs(camera.quaternion.dot(visibleQuaternion)) < 1e-12, 'orientation does not snap at hand-off');
  assert.ok(controls.target.distanceTo(oldTarget) < 0.05, 'orbit target only receives the tiny radius correction');
  assert.deepEqual(parallax.current.toArray(), [0, 0]);

  // Drag motion is tracked but never drives a second camera movement.
  element.dispatchEvent(pointer('pointermove', { x: 700, y: 300, buttons: 1 }));
  assert.deepEqual(parallax.target.toArray(), [0, 0]);
  controls.dispatchEvent({ type: 'end' });
  element.dispatchEvent(pointer('pointermove', { x: 705, y: 302 }));
  assert.ok(Math.abs(parallax.target.x) < 0.02, 'post-drag input is relative to release position');
  assert.ok(Math.abs(parallax.target.y) < 0.02, 'small post-drag motion cannot pull to a canvas corner');
  parallax.dispose();
});

test('vertical response and interaction recentering are configurable and restored', () => {
  const { camera, controls, element, parallax } = fixture();
  parallax.parameters.verticalResponse = 0;
  parallax.setPointer(0, 1);
  parallax.update(0);
  parallax.update(500);
  parallax.apply();
  assert.ok(Math.abs(camera.position.y) < 1e-12);
  parallax.restoreCamera();

  parallax.parameters.recenterAfterInteraction = false;
  element.dispatchEvent(pointer('pointermove', { x: 900, y: 100 }));
  controls.dispatchEvent({ type: 'start' });
  controls.dispatchEvent({ type: 'end' });
  element.dispatchEvent(pointer('pointermove', { x: 905, y: 102 }));
  assert.ok(parallax.target.x > 0.7, 'absolute mapping remains available when recentering is disabled');
  parallax.restoreDefaults();
  assert.deepEqual(parallax.parameters, { ...POINTER_PARALLAX_DEFAULTS });
  parallax.dispose();
});

test('pointer leave, touch interactions and disposal cannot leave stale mouse steering', () => {
  const { controls, element, parallax, renders } = fixture();
  element.dispatchEvent(pointer('pointermove', { x: 900, y: 100 }));
  element.dispatchEvent(pointer('pointerdown', { x: 900, y: 100, buttons: 1 }));
  controls.dispatchEvent({ type: 'start' });
  controls.dispatchEvent({ type: 'end' });
  element.dispatchEvent(pointer('pointermove', { x: 905, y: 102 }));
  assert.ok(Math.abs(parallax.target.x) < 0.02);

  element.dispatchEvent(pointer('pointerleave', { x: 1001, y: 102 }));
  element.dispatchEvent(pointer('pointermove', { x: 900, y: 100 }));
  assert.ok(parallax.target.x > 0.7, 're-entering the canvas deliberately restores absolute hover mapping');

  element.dispatchEvent(pointer('pointerdown', { x: 500, y: 250, buttons: 1, pointerType: 'touch' }));
  controls.dispatchEvent({ type: 'start' });
  controls.dispatchEvent({ type: 'end' });
  element.dispatchEvent(pointer('pointermove', { x: 900, y: 100 }));
  assert.ok(parallax.target.x > 0.7, 'touch navigation cannot install a stale mouse-relative origin');

  const targetBeforeDispose = parallax.target.clone();
  const rendersBeforeDispose = renders();
  parallax.dispose();
  element.dispatchEvent(pointer('pointermove', { x: 100, y: 400 }));
  assert.deepEqual(parallax.target.toArray(), targetBeforeDispose.toArray());
  assert.equal(renders(), rendersBeforeDispose, 'disposed listeners never request another frame');
});
