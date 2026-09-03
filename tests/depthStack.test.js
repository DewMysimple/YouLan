import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { depthOffsets, createDepthStack } from '../src/viewer/depthStack.js';

test('depth validates 1–200 copies and finite spacing, all along world -Z', () => {
  for(const count of [1,2,100,101,199,200]) {
    const offsets=depthOffsets(count,1.7);assert.equal(offsets.length,count);
    assert.deepEqual(offsets.at(-1).toArray(),[0,0,-(count-1)*1.7]);
  }
  for(const count of [0,201,1.5,NaN,Infinity]) assert.throws(()=>depthOffsets(count,1));
  for(const spacing of [0,-1,10.01,NaN,Infinity]) assert.throws(()=>depthOffsets(2,spacing));
});

test('depth coalesces changes, keeps immutable attributes/two groups, rejects invalid state, restores one and cleans up', () => {
  const base=new THREE.BoxGeometry(.42,9.1,9.1);base.clearGroups();base.addGroup(0,24,0);base.addGroup(24,12,1);
  base.setAttribute('corePosition',base.attributes.position.clone());base.setAttribute('uv1',base.attributes.uv.clone());
  const attributes=Object.fromEntries(Object.entries(base.attributes).map(([n,a])=>[n,a.array.slice()]));
  const mesh=new THREE.Mesh(base);mesh.rotation.y=-Math.PI/2;
  let renders=0,disposals=0;base.addEventListener('dispose',()=>disposals++);
  const stack=createDepthStack(mesh,()=>renders++);
  stack.set(100,1.7);stack.set(101,1.7);stack.set(200,10);
  assert.equal(mesh.geometry,base);stack.flush();assert.equal(disposals,1);assert.equal(renders,3);
  assert.equal(mesh.geometry.index.count,36*200);assert.deepEqual(mesh.geometry.groups.map(g=>g.count),[24*200,12*200]);
  for(const n of ['normal','uv','uv1','corePosition']) assert.deepEqual(mesh.geometry.attributes[n].array.slice(-attributes[n].length),attributes[n]);
  const valid=mesh.geometry;assert.equal(stack.set(201,1.7),false);stack.flush();assert.equal(mesh.geometry,valid);assert.equal(stack.state.count,200);
  const camera=new THREE.PerspectiveCamera(45,1,.1,2000);camera.position.z=500;stack.updateCameraClip(camera);assert.ok(camera.far>2490);
  stack.set(1,1.7);stack.flush();for(const [n,a] of Object.entries(attributes))assert.deepEqual(mesh.geometry.attributes[n].array,a);
  stack.set(200,1.7);const single=mesh.geometry;stack.dispose();stack.dispose();stack.flush();assert.equal(mesh.geometry,single);assert.equal(stack.set(2,1),false);
  mesh.geometry.dispose();mesh.material.dispose();
});
