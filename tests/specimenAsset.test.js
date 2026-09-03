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
  assert.deepEqual(asset.meshes[0].primitives.map(p => [p.material, asset.accessors[p.indices].count]), [[0,72],[1,12]]);
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
      { start:0, count:72, materialIndex:0 }, { start:72, count:12, materialIndex:1 },
    ]);
    assert.equal(mesh.geometry.index.count, 84);
    assert.notEqual(mesh.material[0], mesh.material[1]);
    assert.deepEqual(mesh.material.map(m => m.color.getHexString()), ['f3faff', 'd1aaff']);
    assert.equal(mesh.geometry.attributes.position.count, 40);
    assert.equal(mesh.geometry.attributes.normal.count, 40);
    assert.equal(mesh.geometry.attributes.uv.count, 40);
    // Weld by position only for diagnosis; keep runtime split normals/UVs.
    const position = mesh.geometry.attributes.position;
    const keys = Array.from({ length: position.count }, (_, i) => [position.getX(i),position.getY(i),position.getZ(i)].map(n => n.toFixed(5)).join(','));
    const edges = new Map();
    const index = mesh.geometry.index.array;
    for (let i = 0; i < index.length; i += 3) for (let e = 0; e < 3; e++) {
      const a = keys[index[i+e]], b = keys[index[i+(e+1)%3]];
      const key = [a,b].sort().join('|');
      const record = edges.get(key) ?? { count: 0, winding: 0 };
      record.count++; record.winding += a < b ? 1 : -1; edges.set(key, record);
    }
    assert.ok([...edges.values()].every(edge => edge.count === 2 && edge.winding === 0), 'closed, consistently oriented shell without internal walls');
  } finally {
    mesh.geometry.dispose();
    mesh.material.forEach(m => m.dispose());
  }
});
