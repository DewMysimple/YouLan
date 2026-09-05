import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createButterflyScene, BUTTERFLY_DEFAULTS } from '../src/viewer/butterflyScene.js';

async function loadGeometryAndAnimation() {
  const file=readFileSync(new URL('../public/models/blue-morpho-butterfly.glb',import.meta.url));
  const jsonLength=file.readUInt32LE(12);
  const json=JSON.parse(file.toString('utf8',20,20+jsonLength));
  const wings=json.materials.filter(m=>m.name.includes('wing membrane'));
  assert.equal(wings.length,2);
  for(const m of wings){
    assert.ok(m.pbrMetallicRoughness.baseColorTexture,'embedded pigment texture');
    assert.ok(m.normalTexture,'embedded vein and scale relief');
  }
  assert.equal(json.images.length,4);
  assert.ok(json.images.every(i=>i.bufferView!==undefined&&!i.uri),'self-contained GLB textures');
  // Node has no bitmap decoder. Validate the embedded images above, then parse
  // the unmodified geometry/animation buffers; the browser suite decodes all maps.
  for(const m of json.materials){delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;}
  const bytes=Buffer.from(JSON.stringify(json));const padded=Math.ceil(bytes.length/4)*4;
  const bin=file.subarray(20+jsonLength);
  const stripped=Buffer.alloc(20+padded+bin.length,0x20);
  file.copy(stripped,0,0,12);stripped.writeUInt32LE(stripped.length,8);
  stripped.writeUInt32LE(padded,12);stripped.writeUInt32LE(0x4e4f534a,16);
  bytes.copy(stripped,20);bin.copy(stripped,20+padded);
  return new GLTFLoader().parseAsync(stripped.buffer.slice(stripped.byteOffset,stripped.byteOffset+stripped.byteLength),'');
}

test('exported butterfly has four animated wing hinges, continuous mirrored wingbeats and a stable body', async () => {
  const gltf=await loadGeometryAndAnimation();
  assert.equal(gltf.animations.length,1);
  const clip=gltf.animations[0];
  assert.ok(Math.abs(clip.duration-.8)<1e-6);
  const hinges=['LeftForewingPivot','RightForewingPivot','LeftHindwingPivot','RightHindwingPivot']
    .map(name=>gltf.scene.getObjectByName(name));
  assert.ok(hinges.every(h=>h?.children.some(o=>o.isMesh)));
  assert.ok(hinges.every(h=>h.children[0].geometry.attributes.uv.count>0));
  const mixer=new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(clip).play();
  const body=gltf.scene.getObjectByName('Thorax');
  const bodyBefore=body.position.clone();
  mixer.setTime(0);const start=hinges.map(h=>h.quaternion.clone());
  for(const track of clip.tracks)assert.deepEqual(Array.from(track.values.slice(0,4)),Array.from(track.values.slice(-4)));
  mixer.setTime(clip.duration);hinges.forEach((h,i)=>assert.deepEqual(h.quaternion.toArray(),start[i].toArray()));
  mixer.setTime(.2);const peak=hinges[0].quaternion.clone();
  assert.ok(Math.abs(hinges[0].quaternion.y+hinges[1].quaternion.y)<1e-6,'left and right flap symmetrically');
  assert.deepEqual(hinges[0].quaternion.toArray(),hinges[2].quaternion.toArray(),'coupled same-side wings cannot shear through each other');
  assert.ok(Math.abs(2*Math.atan2(peak.y,peak.w)*180/Math.PI-82)<.01,'82 degree upstroke');
  mixer.setTime(.6);assert.ok(peak.angleTo(hinges[0].quaternion)>1.5,'wide, visible wing sweep');
  assert.ok(Math.abs(2*Math.atan2(hinges[0].quaternion.y,hinges[0].quaternion.w)*180/Math.PI+43)<.01,'preserved downward sweep');
  assert.ok(body.position.distanceTo(bodyBefore)<1e-9);
  mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
});

test('wing surfaces keep separate slabs and clear the body throughout the complete amplitude range',async()=>{
  const {scene,animations}=await loadGeometryAndAnimation();
  const names=['LeftForewing','RightForewing','LeftHindwing','RightHindwing'];
  const wings=names.map(n=>scene.getObjectByName(n));
  const body=new THREE.Box3();
  scene.updateMatrixWorld(true);
  for(const name of ['Thorax','ThoraxDown','Head','Abdomen'])body.union(new THREE.Box3().setFromObject(scene.getObjectByName(name)));
  assert.ok(body.max.x<.14&&body.min.x>-.14,'slender body including down');
  for(const wing of wings)wing.parent.quaternion.identity();
  const mixer=new THREE.AnimationMixer(scene),action=mixer.clipAction(animations[0]).play();
  const p=new THREE.Vector3();let minimumClearance=Infinity;
  mixer.setTime(0);action.setEffectiveWeight(0);mixer.update(0);scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(const sign of [-1,1])for(let x=.05;x<1.65;x+=.025){
    ray.set(new THREE.Vector3(sign*x,.15,5),new THREE.Vector3(0,0,-1));
    assert.ok(ray.intersectObject(scene,true).length,'continuous ivory silhouette across the wing junction');
  }
  assert.equal(BUTTERFLY_DEFAULTS.amplitude,1);
  for(const weight of [0,.25,.5,.75,1]){
    action.setEffectiveWeight(weight);
    for(let i=0;i<=120;i++){
      mixer.setTime(i*.8/120);scene.updateMatrixWorld(true);
      const bounds=wings.map(w=>{
        const b=new THREE.Box3(),a=w.geometry.attributes.position;
        // Each side has its own rotating separation normal.
        const n=new THREE.Vector3(0,0,1).applyQuaternion(w.parent.getWorldQuaternion(new THREE.Quaternion()));
        let lo=Infinity,hi=-Infinity;
        for(let j=0;j<a.count;j++){
          p.fromBufferAttribute(a,j).applyMatrix4(w.matrixWorld);b.expandByPoint(p);
          const d=p.dot(n);lo=Math.min(lo,d);hi=Math.max(hi,d);
        }
        b.slab={lo,hi};return b;
      });
      for(const j of [0,1]){
        assert.ok(bounds[j].slab.lo-bounds[j+2].slab.hi>.015,'overlapping wings remain in disjoint rotating depth slabs');
        const gap=j===0?body.min.x-Math.max(bounds[0].max.x,bounds[2].max.x)
          :Math.min(bounds[1].min.x,bounds[3].min.x)-body.max.x;
        minimumClearance=Math.min(minimumClearance,gap);
        assert.ok(gap>.001,`body clearance ${gap}, weight ${weight}, sample ${i}, body x ${body.max.x}`);
      }
    }
  }
  mixer.stopAllAction();mixer.uncacheRoot(scene);
  assert.ok(minimumClearance>.001);
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
