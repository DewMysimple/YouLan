import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareSpecimenMesh } from '../src/viewer/specimenModel.js';
import { coreBounds, coreRayLength, createEmbeddedCore, patchCoreShader, patchCoreCountShader } from '../src/viewer/embeddedCore.js';
import { patchSliceShader } from '../src/viewer/sliceAccumulation.js';
import { buildArrayGeometry } from '../src/viewer/arrayModifier.js';

const asset = await readFile(new URL('../public/models/specimen-frame.glb',import.meta.url));
async function model() {
  const gltf = await new GLTFLoader().parseAsync(asset.buffer.slice(asset.byteOffset,asset.byteOffset+asset.byteLength),'');
  return prepareSpecimenMesh(gltf.scene);
}
const vector = (...xyz) => new THREE.Vector3(...xyz);

test('actual insert volume intersects four side directions, not transparent margins or rays pointing away',async()=>{
  const mesh = await model(), bounds = coreBounds(mesh.geometry);
  const center = bounds.getCenter(vector()), size = bounds.getSize(vector());
  assert.ok(Math.abs(size.x-.42)<1e-6);
  assert.ok(size.y>6 && size.y<9 && size.z>6 && size.z<9);
  for(const axis of ['y','z']) for(const sign of [-1,1]) {
    const origin=center.clone(); origin[axis]+=sign*10;
    const direction=vector(); direction[axis]=-sign;
    assert.ok(Math.abs(coreRayLength(origin,direction,bounds)-size[axis])<1e-6);
    assert.equal(coreRayLength(origin,direction.clone().negate(),bounds),0);
    origin.x=bounds.max.x+1;
    assert.equal(coreRayLength(origin,direction,bounds),0);
  }
  mesh.geometry.dispose(); mesh.material.forEach(m=>m.dispose());
});

test('closed projection composes before slice absorption and guards native backface prepass',()=>{
  const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
  patchSliceShader(shader,{}); patchCoreShader(shader,{});
  assert.ok(shader.fragmentShader.includes('sliceOuterAbsorption'));
  assert.ok(!shader.fragmentShader.includes('vCoreSide'));
  assert.ok(shader.fragmentShader.includes('vec3 coreRay = -v;'));
  assert.ok(!shader.fragmentShader.includes('refract(-v, normalize(n), 1.0 / material.ior)'));
  assert.ok(shader.fragmentShader.indexOf('vec3 coreRay = -v;') < shader.fragmentShader.indexOf('transmitted.rgb *= exp(-opticalDepth)'));
  assert.ok(shader.fragmentShader.includes('vec3(2.0 - backIsInner)'));
  assert.ok(shader.fragmentShader.includes('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance'));
  assert.equal(shader.fragmentShader.split('#ifndef FLIP_SIDED').length,3);
  assert.throws(()=>patchCoreShader({vertexShader:'',fragmentShader:'',uniforms:{}},{}),/接口已改变/);
});

test('coverage uses the same closed projection, reclassifies rather than double-counts',()=>{
  const uniforms={coreWeight:{value:1}}, shader={uniforms:{}};
  patchCoreCountShader(shader,uniforms);
  assert.equal(shader.uniforms.coreWeight,uniforms.coreWeight);
  assert.ok(shader.vertexShader.includes('vCorePosition = corePosition'));
  assert.ok(shader.fragmentShader.includes('coreInterval(vCorePosition, ray)'));
  assert.ok(shader.fragmentShader.includes('inner ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 0.0, 1.0)'));
  const beauty={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
  patchCoreShader(beauty,uniforms);
  const intersection=source=>source.slice(source.indexOf('vec2 coreInterval'),source.indexOf('return farT > nearT'));
  assert.equal(intersection(beauty.fragmentShader),intersection(shader.fragmentShader));
});

test('grazing rays cannot tint the outer top but do hit the inset top through the front border',async()=>{
  const mesh=await model(), bounds=coreBounds(mesh.geometry);
  // The former side-only refracted direction spuriously hit the core from here.
  const outside=vector(0,bounds.max.y+1,0);
  assert.equal(coreRayLength(outside,vector(-1,-.1,0).normalize(),bounds),0);
  assert.ok(coreRayLength(outside,vector(-.04,-1,0).normalize(),bounds)>0);
  // Straight line through the front border sees the real inner top, closing
  // the edge without adding a purple stripe on the distant outer top face.
  const frontBorder=vector(bounds.max.x,bounds.max.y+.15,0);
  assert.ok(coreRayLength(frontBorder,vector(-.5,-1,0).normalize(),bounds)>0);
  mesh.geometry.dispose(); mesh.material.forEach(m=>m.dispose());
});

test('copy-relative core attribute, source data, independent materials and hook cleanup survive arrays',async()=>{
  const mesh=await model();
  const before=mesh.geometry.attributes.position.array.slice();
  const materials=mesh.material.map(m=>m.toJSON());
  const hooks=[mesh.material[0].onBeforeCompile,mesh.material[0].customProgramCacheKey];
  const core=createEmbeddedCore(mesh);
  const uniforms={};
  const shader={uniforms,vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  mesh.material[0].onBeforeCompile(shader,{});
  mesh.material[1].transmission=1;
  core.update();
  assert.deepEqual(uniforms.coreColor.value.toArray(),mesh.material[1].color.toArray());
  mesh.material[1].opacity=0; core.update(); assert.equal(uniforms.coreWeight.value,0);
  mesh.material[1].opacity=1; mesh.material[1].visible=false; core.update(); assert.equal(uniforms.coreWeight.value,0);
  mesh.material[1].visible=true; mesh.material[1].transmission=0; core.update();
  assert.equal(uniforms.coreWeight.value,1); assert.equal(uniforms.coreTransmission.value,0);
  mesh.position.set(12,3,-4); mesh.rotation.y=1; core.update();
  const identity=mesh.matrixWorld.clone().multiply(uniforms.coreWorldInverse.value).elements;
  identity.forEach((n,i)=>assert.ok(Math.abs(n-new THREE.Matrix4().elements[i])<1e-10));
  const array=buildArrayGeometry(mesh.geometry,mesh.matrixWorld,[vector(),vector(0,0,-100)]);
  assert.deepEqual(array.attributes.corePosition.array.slice(before.length),before);
  assert.deepEqual(mesh.geometry.attributes.position.array,before);
  assert.deepEqual(mesh.material[0].toJSON(),materials[0]);
  assert.notEqual(mesh.material[0],mesh.material[1]);
  core.dispose(); core.dispose(); core.update();
  assert.equal(mesh.material[0].onBeforeCompile,hooks[0]);
  assert.equal(mesh.material[0].customProgramCacheKey,hooks[1]);
  array.dispose(); mesh.geometry.dispose(); mesh.material.forEach(m=>m.dispose());
});
