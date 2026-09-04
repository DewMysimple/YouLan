import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const buffer = await readFile(new URL('../public/models/azalea-bloom.glb', import.meta.url));
const asset = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());

test('azalea runtime asset preserves two meshes, 2K PBR textures and a closed morph', () => {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  assert.deepEqual(asset.nodes.map(node => node.name), ['AZALEA_BLOOM', 'AZALEA_BRANCH']);
  assert.deepEqual(asset.meshes.map(mesh => mesh.name), [
    'AZALEA_BLOOM_GEOMETRY', 'AZALEA_BRANCH_GEOMETRY',
  ]);
  assert.equal(asset.meshes[0].primitives[0].targets.length, 1);
  assert.deepEqual(Object.keys(asset.meshes[0].primitives[0].targets[0]).sort(), ['NORMAL', 'POSITION']);
  assert.equal(asset.nodes[0].extras.petalComponents, 5);
  assert.equal(asset.nodes[0].extras.morphTarget, 'Closed');
  assert.deepEqual(asset.images.map(image => image.name).sort(), [
    'rhododendron_color', 'rhododendron_normal', 'rhododendron_rough',
  ]);
  assert.ok(asset.accessors[0].count > 7500);
  assert.ok(asset.accessors[6].count > 9000);
});

test('separate 2K subsurface mask is shipped for the petal material', async () => {
  const png = await readFile(new URL('../public/models/azalea-subsurface.png', import.meta.url));
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 2048);
  assert.equal(png.readUInt32BE(20), 2048);
});
