import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEmbeddedCore, patchCoreShader } from '../src/viewer/embeddedCore.js';
import { createSoftEdges, patchEdgeShader, EDGE_DEFAULTS } from '../src/viewer/softEdges.js';
import { patchSliceShader } from '../src/viewer/sliceAccumulation.js';
import { buildArrayGeometry } from '../src/viewer/arrayModifier.js';

const shader = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader });

test('edges compose with native transmission, slice absorption and closed core exactly once', () => {
  for (const slot of [0, 1]) {
    const s = shader();
    patchSliceShader(s, {});
    if (slot === 0) patchCoreShader(s, {});
    patchEdgeShader(s, {}, slot);
    assert.equal(s.vertexShader.split('attribute vec3 corePosition;').length, 2);
    assert.equal(s.fragmentShader.split('vec2 coreInterval').length, 2);
    assert.equal(s.fragmentShader.split('outgoingLight *= 1.0 - edgeStrength * rim;').length, 2);
    assert.ok(s.fragmentShader.includes('fwidth(p)'));
    assert.ok(s.fragmentShader.indexOf('outgoingLight *=') > s.fragmentShader.indexOf('transmitted.rgb *= exp'));
    assert.ok(s.fragmentShader.indexOf('outgoingLight *=') < s.fragmentShader.indexOf('#include <tonemapping_fragment>'));
    assert.ok(!s.fragmentShader.includes('totalEmissiveRadiance +='));
  }
  assert.throws(() => patchEdgeShader({ fragmentShader: '' }, {}, 0), /接口已改变/);
});

test('edge controls preserve materials and geometry, share core state, survive copies and clean hooks', () => {
  const g = new THREE.BoxGeometry(.42, 9.1, 9.1);
  g.clearGroups(); g.addGroup(0, 18, 0); g.addGroup(18, 18, 1);
  const mesh = new THREE.Mesh(g, [new THREE.MeshPhysicalMaterial({ color: '#f3faff' }), new THREE.MeshPhysicalMaterial({ color: '#d1aaff' })]);
  const core = createEmbeddedCore(mesh);
  const previous = mesh.material.map(m => [m.onBeforeCompile, m.customProgramCacheKey]);
  const data = g.attributes.position.array.slice(), colors = mesh.material.map(m => m.color.getHexString());
  const edges = createSoftEdges(mesh, core, { getPixelRatio: () => 2 });
  assert.deepEqual(edges.parameters, EDGE_DEFAULTS);
  const s = shader(); mesh.material[0].onBeforeCompile(s, {});
  edges.update();
  assert.equal(s.uniforms.coreWeight, core.uniforms.coreWeight);
  assert.equal(s.uniforms.edgePixelRatio.value, 2);
  mesh.material[0].transmission = 0; edges.update(); assert.equal(s.uniforms.edgeCoreTransmission.value, 0);
  mesh.material[0].transmission = 1; edges.update(); assert.equal(s.uniforms.edgeCoreTransmission.value, 1);
  edges.parameters.strength = 0; edges.update(); assert.equal(s.uniforms.edgeStrength.value, 0);
  edges.parameters.strength = Infinity; edges.parameters.width = NaN; edges.update();
  assert.equal(s.uniforms.edgeStrength.value, EDGE_DEFAULTS.strength);
  assert.equal(s.uniforms.edgeWidth.value, EDGE_DEFAULTS.width);
  const array = buildArrayGeometry(g, new THREE.Matrix4(), [new THREE.Vector3(), new THREE.Vector3(0, 0, -30)]);
  assert.deepEqual(array.attributes.corePosition.array.slice(data.length), data);
  assert.deepEqual(g.attributes.position.array, data);
  assert.deepEqual(mesh.material.map(m => m.color.getHexString()), colors);
  assert.equal(array.groups.length, 2);
  edges.dispose(); edges.dispose(); edges.update();
  assert.equal(s.uniforms.edgeStrength.value, 0);
  mesh.material.forEach((m, i) => {
    assert.equal(m.onBeforeCompile, previous[i][0]); assert.equal(m.customProgramCacheKey, previous[i][1]);
  });
  core.dispose(); g.dispose(); array.dispose(); mesh.material.forEach(m => m.dispose());
});
