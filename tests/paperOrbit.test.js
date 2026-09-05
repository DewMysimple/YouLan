import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLanes, sampleOrbit, TAU } from '../src/viewer/paperOrbitMotion.js';

test('all nine routes close smoothly, stay outside the globe and point along their derivative', () => {
  const lanes = createLanes();
  assert.equal(lanes.length, 9);
  for (const lane of lanes) {
    assert.ok(Math.abs(lane.u.dot(lane.v)) < 1e-12);
    for (const radius of [4.2, 8]) for (const flutter of [0, .7]) {
      const first = sampleOrbit(lane, 0, radius, flutter);
      const last = sampleOrbit(lane, TAU, radius, flutter);
      assert.ok(first.position.distanceTo(last.position) < 1e-10);
      assert.ok(first.direction.distanceTo(last.direction) < 1e-10);
      for (let a = 0; a < TAU; a += .1) {
        const current = sampleOrbit(lane, a, radius - .19, flutter, -.21);
        // Largest aircraft fits outside radius 3 even at the minimum flight radius.
        assert.ok(current.position.length() > 3.8);
        const derivative = sampleOrbit(lane, a + 1e-5, radius - .19, flutter, -.21).position
          .sub(sampleOrbit(lane, a - 1e-5, radius - .19, flutter, -.21).position).normalize();
        assert.ok(current.direction.dot(derivative) > .9999999);
      }
    }
  }
});

function glbJSON(filename) {
  const buffer = readFileSync(new URL(`../public/models/${filename}`, import.meta.url));
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  return JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)));
}

test('runtime assets contain the real aircraft and land/ocean, excluding studio and pack props', () => {
  const plane = glbJSON('paper-plane.glb'), earth = glbJSON('paper-orbit-earth.glb');
  assert.equal(plane.meshes.length, 1);
  assert.ok(plane.nodes.some(node => node.name === 'PaperPlane'));
  const primitive = plane.meshes[0].primitives[0];
  assert.ok(plane.accessors[primitive.indices].count / 3 <= 200);
  const position = plane.accessors[primitive.attributes.POSITION];
  assert.ok(position.max[2] > .49 && position.min[2] < -.49, 'nose/tail aligned with Z');
  assert.ok(position.max[1] - position.min[1] < .15, 'paper lies horizontally in XZ');
  assert.deepEqual(earth.nodes.map(node => node.name).sort(), ['EarthLand', 'EarthOcean']);
  assert.equal(earth.meshes.length, 2);
  assert.equal(earth.images, undefined, 'no missing C4D texture dependencies');
});
