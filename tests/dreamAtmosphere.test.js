import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createDreamAtmosphere, projectSun } from '../src/viewer/dreamAtmosphere.js';
import { createTransparentOrdering } from '../src/viewer/transparentOrdering.js';

test('source projection produces a smooth viewport-edge gate and still reaches exact endpoints', () => {
  const c = new THREE.PerspectiveCamera(75, 1.44, .1, 2000), p = new THREE.Vector3(0, 0, -40);
  c.position.set(0,0,14); c.lookAt(p); c.updateMatrixWorld();
  assert.equal(projectSun(c,p,.6,false,6).gate,1);
  assert.deepEqual(projectSun(c,p,.6).uv.toArray(),[.5,.5]);
  c.lookAt(45,0,-40); c.updateMatrixWorld();
  const oblique=projectSun(c,p,.6,false,6); assert.equal(oblique.gate,1); assert.ok(oblique.uv.x<.15);
  const edgePoint = new THREE.Vector3(-1.01, 0, 0).unproject(c);
  edgePoint.sub(c.position).normalize().multiplyScalar(54).add(c.position);
  const edge = projectSun(c,edgePoint,2,false,6);
  assert.ok(edge.gate>0 && edge.gate<1, 'partially visible disk fades without popping');
  const outsidePoint = new THREE.Vector3(-1.2, 0, 0).unproject(c);
  outsidePoint.sub(c.position).normalize().multiplyScalar(54).add(c.position);
  assert.equal(projectSun(c,outsidePoint,.1,false,6).gate,0, 'disk beyond the feather stops rays exactly');
  c.position.set(0,0,-70); c.lookAt(0,0,-100); c.updateMatrixWorld(); assert.equal(projectSun(c,p,.6).gate,0);
});

test('ray visibility damps both directions, reverses continuously, and eventually idles', () => {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1.44,.1,2000);
  camera.position.z=14;camera.lookAt(0,0,0);
  const a=createDreamAtmosphere(scene,camera,{requireCounts(){},optics(){return {texture:null};}});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(9,9,.4));scene.add(mesh);a.attach(mesh);
  a.parameters.animated=false;a.parameters.edgeFade=0;a.parameters.transitionTime=.5;
  assert.equal(a.update(0),true);assert.equal(a.uniforms.dreamGate.value,0);
  a.update(100);const entering=a.uniforms.dreamGate.value;assert.ok(entering>0&&entering<1);
  for(let t=200;t<=1300;t+=100)a.update(t);
  assert.equal(a.uniforms.dreamGate.value,1);
  camera.lookAt(1,0,14);camera.updateMatrixWorld();
  assert.equal(a.update(1400),true);assert.equal(a.uniforms.dreamGate.value,1,'first frame after idle does not jump');
  a.update(1500);const leaving=a.uniforms.dreamGate.value;assert.ok(leaving>0&&leaving<1);
  camera.lookAt(0,0,-40);camera.updateMatrixWorld();
  a.update(1600);assert.ok(a.uniforms.dreamGate.value>=leaving,'reversing direction remains continuous');
  let active=true;for(let t=1700;t<=3000;t+=100)active=a.update(t);
  assert.equal(a.uniforms.dreamGate.value,1);assert.equal(active,false,'transition stops requesting frames at the endpoint');
  a.parameters.sunIntensity=0;assert.equal(a.update(3100),false);
  assert.equal(a.uniforms.dreamGate.value,0,'explicitly disabling the source remains immediate');
  a.dispose();mesh.geometry.dispose();mesh.material.dispose();
});

test('atmosphere owns separate source, holds material colors, restores background even on failure, and disposes', () => {
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(45,1,.1,2000);
  camera.position.z=14; camera.lookAt(0,0,0);
  let counts=false;
  const slices={ requireCounts(v){counts=v;},optics(){return {texture:null};},parameters:{enabled:true,strength:.09,limit:3} };
  const a=createDreamAtmosphere(scene,camera,slices);
  a.parameters.transitionTime=0;
  a.parameters.sunMode='有限距离';
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(9,9,.4),[new THREE.MeshPhysicalMaterial({color:'#f3faff'}),new THREE.MeshPhysicalMaterial({color:'#d1aaff'})]);
  mesh.position.z=-20;scene.add(mesh);a.attach(mesh);
  const before=mesh.material.map(m=>m.color.getHexString());
  a.update(0); a.update(100); assert.ok(a.uniforms.dreamTime.value>0);assert.ok(counts);
  assert.ok(a.sun.position.z < -20.2);const fixed=a.sun.position.toArray();
  camera.position.x=40; a.update(200); assert.deepEqual(a.sun.position.toArray(),fixed);
  a.parameters.animated=false;const time=a.uniforms.dreamTime.value;a.update(1000);assert.equal(a.uniforms.dreamTime.value,time);
  const white=new THREE.Color('#ffffff');scene.background=white;
  assert.throws(()=>a.renderWithBackground(()=>{assert.equal(scene.background,null);throw Error('test');}));assert.equal(scene.background,white);
  a.parameters.background='纯黑对照';a.renderWithBackground(()=>assert.equal(scene.background.getHex(),0));assert.equal(scene.background,white);
  assert.deepEqual(mesh.material.map(m=>m.color.getHexString()),before);
  a.setReducedMotion(true);a.restore();assert.equal(a.parameters.animated,false);
  a.parameters.enabled=false;a.update(2000);assert.equal(a.group.parent,null);assert.equal(counts,false);
  a.dispose();a.dispose();assert.equal(scene.children.length,1);mesh.geometry.dispose();mesh.material.forEach(m=>m.dispose());
});

test('infinite sun preserves direction and angular size under translation and depth changes, including large near plane', () => {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1.44,.1,2000);
  camera.position.z=14;camera.lookAt(0,0,0);
  const a=createDreamAtmosphere(scene,camera,{requireCounts(){},optics(){return {texture:null};}});
  a.parameters.transitionTime=0;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(9,9,.4));scene.add(mesh);a.attach(mesh);a.update(0);
  const radius=a.uniforms.dreamRadius.value, uv=a.uniforms.dreamSunUv.value.toArray();
  for(const p of [[30,12,1000],[-100,5,-4000],[0,0,14]]) {
    camera.position.set(...p);camera.near=100;camera.far=10000;camera.updateProjectionMatrix();
    mesh.scale.z=200;mesh.position.z=-900;a.update(100);
    assert.deepEqual(a.uniforms.dreamSunUv.value.toArray(),uv);
    assert.equal(a.uniforms.dreamRadius.value,radius);assert.equal(a.uniforms.dreamGate.value,1);
    assert.ok(a.sun.position.toArray().every(Number.isFinite));
  }
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(1,0,0)));a.update(200);assert.equal(a.uniforms.dreamGate.value,0);
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(0,0,1)));a.update(300);assert.equal(a.uniforms.dreamGate.value,0);
  const shader={uniforms:{},vertexShader:'#include <project_vertex>'};a.sun.material.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('gl_Position.w * 0.999999'));
  assert.equal(shader.uniforms.distantSun.value,true);
  a.parameters.sunMode='有限距离';a.update(400);assert.equal(shader.uniforms.distantSun.value,false);
  a.dispose();mesh.geometry.dispose();mesh.material.dispose();
});

test('solar shader is inserted after precision and before one final output transfer', () => {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const a=createDreamAtmosphere(scene,camera,{requireCounts(){}}),output=new OutputPass();
  output.material.fragmentShader=output.material.fragmentShader.replace('gl_FragColor = texture2D( tDiffuse, vUv );','gl_FragColor = texture2D(tDiffuse, vUv);');
  a.patchOutput(output);const shader=output.material.fragmentShader;
  assert.ok(shader.indexOf('precision highp float')<shader.indexOf('uniform bool dreamActive'));
  assert.ok(shader.indexOf('gl_FragColor.rgb += dreamGlare')<shader.indexOf('// tone mapping'));
  assert.equal((shader.match(/gl_FragColor.rgb \+= dreamGlare/g)||[]).length,1);
  assert.ok(shader.includes('dreamTransmittance'));a.dispose();output.dispose();
});

test('alpha sorting preserves all triangles, winding, groups and attributes, and restores canonical indices', () => {
  const geometry=new THREE.BoxGeometry(2,2,2);geometry.clearGroups();geometry.addGroup(0,18,0);geometry.addGroup(18,18,1);
  const index=geometry.index.array.slice(),positions=geometry.attributes.position.array.slice(),groups=structuredClone(geometry.groups);
  const mesh=new THREE.Mesh(geometry,[new THREE.MeshPhysicalMaterial({opacity:.5,depthWrite:false}),new THREE.MeshPhysicalMaterial({opacity:.6,depthWrite:false})]);
  const sort=createTransparentOrdering(mesh),camera=new THREE.PerspectiveCamera();camera.position.set(10,4,12);camera.lookAt(0,0,0);
  sort.update(camera);const version=geometry.index.version;sort.update(camera);assert.equal(geometry.index.version,version);
  assert.deepEqual(geometry.groups,groups);assert.deepEqual(geometry.attributes.position.array,positions);
  const tris=(data,start)=>Array.from({length:6},(_,i)=>Array.from(data.slice(start+i*3,start+i*3+3)).join(',')).sort();
  for(const start of [0,18])assert.deepEqual(tris(index,start),tris(geometry.index.array,start));
  mesh.material.forEach(m=>{m.depthWrite=true;});sort.update(camera);assert.deepEqual(geometry.index.array,index);
  sort.dispose();sort.dispose();geometry.dispose();mesh.material.forEach(m=>m.dispose());
});
