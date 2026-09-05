import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createButterflyScene } from '../src/viewer/butterflyScene.js';

test('exported butterfly has four animated wing hinges, continuous mirrored wingbeats and a stable body', async () => {
  const file=readFileSync(new URL('../public/models/blue-morpho-butterfly.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
  assert.equal(gltf.animations.length,1);
  const clip=gltf.animations[0];
  assert.ok(Math.abs(clip.duration-.8)<1e-6);
  const hinges=['LeftForewingPivot','RightForewingPivot','LeftHindwingPivot','RightHindwingPivot']
    .map(name=>gltf.scene.getObjectByName(name));
  assert.ok(hinges.every(h=>h?.children.some(o=>o.isMesh)));
  assert.ok(hinges.every(h=>h.children[0].geometry.attributes.color.count>0));
  const mixer=new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(clip).play();
  const body=gltf.scene.getObjectByName('Thorax');
  const bodyBefore=body.position.clone();
  mixer.setTime(0);const start=hinges.map(h=>h.quaternion.clone());
  for(const track of clip.tracks)assert.deepEqual(Array.from(track.values.slice(0,4)),Array.from(track.values.slice(-4)));
  mixer.setTime(clip.duration);hinges.forEach((h,i)=>assert.deepEqual(h.quaternion.toArray(),start[i].toArray()));
  mixer.setTime(.2);const peak=hinges[0].quaternion.clone();
  assert.ok(Math.abs(hinges[0].quaternion.y+hinges[1].quaternion.y)<1e-6,'left and right flap symmetrically');
  assert.ok(hinges[0].quaternion.angleTo(hinges[2].quaternion)>.02,'hindwing lags the forewing');
  mixer.setTime(.6);assert.ok(peak.angleTo(hinges[0].quaternion)>1.5,'wide, visible wing sweep');
  assert.ok(body.position.distanceTo(bodyBefore)<1e-9);
  mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
});

test('butterfly scene owns and releases its geometry/materials without disposing a shared environment', () => {
  const scene=new THREE.Scene();const environment=new THREE.Texture();scene.environment=environment;
  let envDisposed=false;environment.addEventListener('dispose',()=>{envDisposed=true;});
  const butterfly=createButterflyScene(scene,()=>{},{reducedMotion:true});
  assert.equal(butterfly.parameters.playing,false);
  let disposed=0,total=0;
  butterfly.root.traverse(o=>{if(o.geometry){total++;o.geometry.addEventListener('dispose',()=>disposed++);}});
  assert.equal(butterfly.update(1000),false);
  butterfly.dispose();butterfly.dispose();
  assert.equal(disposed,total);assert.equal(envDisposed,false);assert.equal(scene.children.length,0);
});
