import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEnvironmentManager } from '../src/viewer/environmentManager.js';

function texture() {
  const value = new THREE.DataTexture(new Uint8Array(8), 2, 1);
  value.disposals = 0;
  value.addEventListener('dispose', () => value.disposals++);
  return value;
}
const file = (name) => ({ name, arrayBuffer: async () => name });

test('white default, per-slot intensity product, background-only hiding and rotation', async () => {
  const scene = new THREE.Scene();
  const manager = createEnvironmentManager(scene, () => {}, { decode: async () => texture() });
  assert.equal(scene.background.getHexString(), 'ffffff');
  const slots = [0.4, 0.8].map((envMapIntensity) => ({ material: new THREE.MeshPhysicalMaterial(), parameters: { envMapIntensity } }));
  manager.setMaterials(slots);
  manager.parameters.intensity = 2; manager.parameters.rotation = 90; manager.apply();
  assert.deepEqual(slots.map((slot) => slot.material.envMapIntensity), [0.8, 1.6]);
  await manager.loadFile(file('test.hdr'));
  const image = scene.environment;
  assert.equal(scene.background, image);
  manager.parameters.showBackground = false; manager.apply();
  assert.equal(scene.background.getHexString(), 'ffffff');
  assert.equal(scene.environment, image);
  assert.equal(slots[0].material.envMapRotation.y, Math.PI / 2);
  manager.clear(); assert.equal(image.disposals, 1);
  assert.equal(scene.background.getHexString(), 'ffffff');
  manager.dispose(); manager.dispose();
  assert.equal(scene.environment, null);
});

test('replacement failure and oversized images preserve active image', async () => {
  const scene = new THREE.Scene();
  const images = [];
  const manager = createEnvironmentManager(scene, () => {}, { maxTextureSize: 8, decode: async (name) => {
    if (name === 'bad') throw new Error('坏图');
    const result = texture(); images.push(result);
    if (name === 'large') result.image.width = 9;
    return result;
  } });
  await manager.loadFile(file('good'));
  const previous = scene.environment;
  await manager.loadFile(file('bad'));
  assert.equal(scene.environment, previous); assert.equal(manager.state.kind, 'error');
  await manager.loadFile(file('large'));
  assert.equal(scene.environment, previous); assert.equal(images[1].disposals, 1);
  manager.dispose(); assert.equal(previous.disposals, 1);
});

test('latest selection wins; clear and dispose invalidate pending decodes', async () => {
  const scene = new THREE.Scene();
  const pending = new Map();
  const manager = createEnvironmentManager(scene, () => {}, { decode: (name) => new Promise((resolve) => pending.set(name, resolve)) });
  const a = manager.loadFile(file('a')); await Promise.resolve();
  const b = manager.loadFile(file('b')); await Promise.resolve();
  const tb = texture(); pending.get('b')(tb); await b;
  const ta = texture(); pending.get('a')(ta); await a;
  assert.equal(scene.environment, tb); assert.equal(ta.disposals, 1);
  const c = manager.loadFile(file('c')); await Promise.resolve(); manager.clear();
  const tc = texture(); pending.get('c')(tc); await c;
  assert.equal(scene.background.getHexString(), 'ffffff'); assert.equal(tc.disposals, 1);
  const d = manager.loadFile(file('d')); await Promise.resolve(); manager.dispose();
  const td = texture(); pending.get('d')(td); await d;
  assert.equal(td.disposals, 1); assert.equal(scene.environment, null);
});
