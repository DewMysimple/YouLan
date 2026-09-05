import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPaintedRibbons, createPaintedFireworks, fireworkRandom, PAINTED_LIMITS } from '../src/viewer/paintedFireworks.js';
import { createFireworkAudio } from '../src/viewer/fireworkAudio.js';

function fixture() {
  const canvas = new EventTarget(); canvas.getBoundingClientRect = () => ({ left:0, top:0, width:1440, height:900 });
  const audio = { configure(){}, stop(){}, launch(){}, burst(){}, dispose(){}, unlock:async()=>true, state:'locked' };
  const scene = new THREE.Scene();
  const firework = createPaintedFireworks(scene, { domElement:canvas, getPixelRatio:()=>1 }, ()=>{}, { audioFactory:()=>audio });
  return { scene, firework, canvas };
}
test('painted ribbons use one finite indexed instance batch with bounded capacity', () => {
  const geometry = buildPaintedRibbons();
  assert.equal(geometry.instanceCount, PAINTED_LIMITS.shells*(PAINTED_LIMITS.branches+PAINTED_LIMITS.tips+1));
  assert.equal(geometry.index.count, PAINTED_LIMITS.segments*6);
  for (const attribute of Object.values(geometry.attributes)) assert.ok([...attribute.array].every(Number.isFinite));
  const a=fireworkRandom(12),b=fireworkRandom(12);
  assert.deepEqual(Array.from({length:20},a),Array.from({length:20},b)); geometry.dispose();
});
test('seek is deterministic and secondaries inherit actual parent branch geometry', () => {
  const {firework:f} = fixture();
  f.seek(4.2); const snapshot = f.ribbons.material.uniforms.shells.value.map(s=>s.toArray());
  const strokes = f.ribbons.geometry.attributes.stroke;
  const parents = f.ribbons.geometry.attributes.parentStroke;
  const stride = PAINTED_LIMITS.branches+PAINTED_LIMITS.tips+1;
  for (let i=0;i<PAINTED_LIMITS.tips;i++) {
    const parent = [parents.getX(64+i),parents.getY(64+i),parents.getZ(64+i)];
    assert.ok(Array.from({length:f.parameters.density},(_,j)=>[strokes.getX(j),strokes.getY(j),strokes.getZ(j)]).some(p=>p.every((n,k)=>n===parent[k])));
  }
  f.seek(8.1); f.seek(4.2); assert.deepEqual(f.ribbons.material.uniforms.shells.value.map(s=>s.toArray()),snapshot);
  assert.equal(f.ribbons.geometry.instanceCount,10*stride); f.dispose();
});
test('hidden time, pause, inactive scene and reduced motion never advance the show', () => {
  const {firework:f}=fixture(); f.activate(); f.update(0); f.update(50);
  const start=f.parameters.timeline; f.update(5000,false); f.update(10000); assert.equal(f.parameters.timeline,start);
  f.deactivate(); assert.equal(f.update(10100),false); f.activate(); f.update(20000); assert.equal(f.parameters.timeline,start);
  f.setReducedMotion(true); assert.equal(f.update(20100),false); assert.equal(f.parameters.playing,false); assert.equal(f.parameters.autoLaunch,false);
  f.dispose();
});
test('full shell pool preserves in-flight flowers and repeated disposal releases all batches', () => {
  const {firework:f,scene}=fixture(); f.seek(0);
  for(let i=0;i<20;i++)f.launch(.4,.6);
  const snapshot=f.ribbons.material.uniforms.shells.value.map(s=>s.toArray());
  assert.equal(f.launch(.8,.7),false); assert.equal(f.activeCount,10);
  assert.deepEqual(f.ribbons.material.uniforms.shells.value.map(s=>s.toArray()),snapshot);
  let disposed=0;
  f.root.children.forEach(child=>{child.geometry.addEventListener('dispose',()=>disposed++);child.material.addEventListener('dispose',()=>disposed++);});
  f.dispose(); f.dispose(); assert.equal(disposed,6); assert.equal(scene.children.length,0);
});
test('manual mode drains to on-demand rendering, and launch accepts world-space targets', () => {
  const {firework:f}=fixture(); f.seek(0); f.parameters.playing=true; f.parameters.autoLaunch=false; f.activate();
  const world=new THREE.Vector3(3,4,-5); f.launch(.4,.6,{world});
  assert.ok(f.ribbons.material.uniforms.centers.value.some(p=>p.equals(world)));
  for(let i=0;i<=60;i++)f.update(i*100);
  assert.equal(f.update(6100),false); f.dispose();
});
test('procedural audio stays locked before gesture, bounds voices, mutes and cleans up', async () => {
  let contexts=0,closed=0;
  const param=()=>({value:0,setTargetAtTime(){},setValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param(),Q:param(),pan:param(),threshold:param(),ratio:param()});
  class FakeContext {
    constructor(){contexts++;this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.destination={};}
    createGain=node; createDynamicsCompressor=node; createBiquadFilter=node; createStereoPanner=node;
    createBuffer(channels,length){return{getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){return{...node(),start(){},stop(when){if(when===undefined)this.onended?.();}};}
    async resume(){this.state='running';} async close(){this.state='closed';closed++;}
  }
  const audio=createFireworkAudio({contextFactory:FakeContext,random:()=>.5});
  audio.launch(0); assert.equal(contexts,0); assert.equal(audio.state,'locked');
  assert.equal(await audio.unlock(),true); audio.launch(-.5); audio.burst(.5);
  assert.deepEqual(audio.stats,{launches:1,bursts:1});
  for(let i=0;i<50;i++)audio.burst(); assert.ok(audio.voiceCount<=18);
  audio.configure(false,.3); assert.equal(audio.voiceCount,0);
  audio.dispose();audio.dispose();assert.equal(closed,1);
});
