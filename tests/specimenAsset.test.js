import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Color } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareSpecimenMesh } from '../src/viewer/specimenModel.js';

const buffer = await readFile(new URL('../public/models/specimen-frame.glb', import.meta.url));
const asset = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());

test('replacement GLB retains the canonical single mesh, two slots and new source colors', () => {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  assert.equal(asset.meshes.length, 1);
  assert.equal(asset.nodes.length, 1);
  assert.equal(asset.nodes[0].name, 'SPECIMEN_FRAME_MATERIAL_SLOTS');
  assert.equal(asset.cameras, undefined);
  assert.deepEqual(asset.materials.map(m => m.name), [
    'MAT_OuterFrame_TranslucentWhite', 'MAT_InnerPanel_TransparentLavender',
  ]);
  assert.deepEqual(asset.materials.map(m => new Color().fromArray(m.pbrMetallicRoughness.baseColorFactor).getHexString()),
    ['f3faff', 'd1aaff']);
  assert.deepEqual(asset.meshes[0].primitives.map(p => [p.material, asset.accessors[p.indices].count]), [[0,72],[1,36]]);
  for (const primitive of asset.meshes[0].primitives) {
    const positions = asset.accessors[primitive.attributes.POSITION];
    assert.equal(asset.accessors[primitive.attributes.NORMAL].count, positions.count);
    assert.equal(asset.accessors[primitive.attributes.TEXCOORD_0].count, positions.count);
    assert.ok(Math.abs(positions.max[0] - positions.min[0] - 0.42) < 1e-6);
  }
});

test('GLTF loader and existing adapter preserve both regions as one mesh', async () => {
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
  const mesh = prepareSpecimenMesh(gltf.scene);
  try {
    const meshes = [];
    gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    assert.deepEqual(meshes, [mesh]);
    assert.deepEqual(mesh.geometry.groups, [
      { start:0, count:72, materialIndex:0 }, { start:72, count:36, materialIndex:1 },
    ]);
    assert.equal(mesh.geometry.index.count, 108);
    assert.notEqual(mesh.material[0], mesh.material[1]);
    assert.deepEqual(mesh.material.map(m => m.color.getHexString()), ['f3faff', 'd1aaff']);
    assert.equal(mesh.geometry.attributes.position.count, 56);
    assert.equal(mesh.geometry.attributes.normal.count, 56);
    assert.equal(mesh.geometry.attributes.uv.count, 56);
  } finally {
    mesh.geometry.dispose();
    mesh.material.forEach(m => m.dispose());
  }
});
