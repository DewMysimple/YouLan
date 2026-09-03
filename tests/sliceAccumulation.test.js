import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SLICE_DEFAULTS, sliceExponent, absorptionCoefficients, patchSliceShader, createSliceAccumulation } from '../src/viewer/sliceAccumulation.js';

test('overlap absorption is zero for one slice, monotone for 2–256, and softly bounded', () => {
  const { strength, limit } = SLICE_DEFAULTS;
  assert.equal(sliceExponent(0, strength, limit), 0);
  assert.equal(sliceExponent(1, strength, limit), 0);
  assert.equal(sliceExponent(100, 0, limit), 0);
  let previous = 0;
  for (let count = 2; count <= 256; count++) {
    const value = sliceExponent(count, strength, limit);
    assert.ok(value > previous && value < limit);
    previous = value;
  }
  assert.ok(sliceExponent(10, 0.4, limit) > sliceExponent(10, 0.1, limit));
});

test('coefficients use each original linear color and respect opacity/transmission without mutating materials', () => {
  const outer = new THREE.MeshPhysicalMaterial({ color: '#f3faff', transmission: 1 });
  const inner = new THREE.MeshPhysicalMaterial({ color: '#d1bfff', transmission: 1 });
  const before = inner.toJSON();
  assert.ok(absorptionCoefficients(inner).length() > absorptionCoefficients(outer).length());
  assert.deepEqual(inner.toJSON(), before);
  const full = absorptionCoefficients(inner);
  inner.opacity = 0.5;
  assert.deepEqual(absorptionCoefficients(inner), full.multiplyScalar(0.5));
  inner.transmission = 0;
  assert.equal(absorptionCoefficients(inner).length(), 0);
  inner.transmission = 1; inner.visible = false;
  assert.equal(absorptionCoefficients(inner).length(), 0);
  outer.color.set('#ffffff');
  assert.equal(absorptionCoefficients(outer).length(), 0);
  outer.dispose(); inner.dispose();
});

test('shader extends transmission only, keeps reflection separate and excludes the backface prepass', () => {
  const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  const uniforms = { sliceSettings: { value: new THREE.Vector3(1, 0.18, 3) } };
  patchSliceShader(shader, uniforms);
  assert.equal(shader.uniforms.sliceSettings, uniforms.sliceSettings);
  assert.ok(shader.fragmentShader.includes('#ifndef FLIP_SIDED'));
  assert.ok(shader.fragmentShader.includes('transmitted.rgb *= exp(-opticalDepth)'));
  assert.ok(shader.fragmentShader.includes('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance'));
  assert.throws(() => patchSliceShader({ uniforms: {}, fragmentShader: '' }, {}), /接口已改变/);
});

test('unsupported hardware falls back, and repeated disposal does not own source geometry/materials', () => {
  let renders = 0;
  const renderer = { extensions: { has: () => false }, render() { renders++; } };
  const slices = createSliceAccumulation(renderer);
  const geometry = new THREE.PlaneGeometry();
  const materials = [new THREE.MeshPhysicalMaterial(), new THREE.MeshPhysicalMaterial()];
  const mesh = new THREE.Mesh(geometry, materials);
  let freed = 0;
  [geometry, ...materials].forEach((resource) => resource.addEventListener('dispose', () => freed++));
  slices.attach(mesh);
  slices.render({}, {});
  assert.equal(renders, 1);
  assert.equal(slices.state.supported, false);
  slices.dispose(); slices.dispose(); slices.render({}, {});
  assert.equal(renders, 1);
  assert.equal(freed, 0);
  [geometry, ...materials].forEach((resource) => resource.dispose());
});

test('count-pass failure restores renderer target/color and disposal restores shader hooks', () => {
  const originalTarget = { name: 'caller target', width: 640, height: 480 };
  let currentTarget = originalTarget;
  const color = new THREE.Color('#123456');
  let alpha = 0.7;
  const renderer = {
    extensions: { has: () => true }, capabilities: { maxSamples: 4 },
    getRenderTarget: () => currentTarget, setRenderTarget: (value) => { currentTarget = value; },
    getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    getClearAlpha: () => alpha, getClearColor: (value) => value.copy(color),
    setClearColor: (value, a) => { color.set(value); alpha = a; },
    getDrawingBufferSize: (value) => value.set(640,480), clear() {},
    render() { throw new Error('synthetic GPU failure'); },
  };
  const slices = createSliceAccumulation(renderer);
  const geometry = new THREE.PlaneGeometry();
  const materials = [0,1].map(() => new THREE.MeshPhysicalMaterial({ transmission: 1 }));
  const hooks = materials.map(m => [m.onBeforeCompile, m.customProgramCacheKey]);
  const mesh = new THREE.Mesh(geometry, materials);
  slices.attach(mesh);
  // Two copies, just enough to enter the count pass (no real GL context here).
  geometry.setIndex([...geometry.index.array, ...geometry.index.array]);
  assert.throws(() => slices.render(new THREE.Scene(), new THREE.PerspectiveCamera()), /GPU failure/);
  assert.equal(currentTarget, originalTarget);
  assert.equal(color.getHexString(), '123456');
  assert.equal(alpha, 0.7);
  slices.dispose(); slices.dispose();
  materials.forEach((m,i) => {
    assert.equal(m.onBeforeCompile, hooks[i][0]);
    assert.equal(m.customProgramCacheKey, hooks[i][1]);
    m.dispose();
  });
  geometry.dispose();
});
