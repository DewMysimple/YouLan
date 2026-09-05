import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output=process.argv[2];
if(!output)throw new Error('Provide output directory');
await mkdir(output,{recursive:true});
const b=await browserHarness(output), report={};
const panel=['场景6·蝶翼'],select=['场景选择'];
try {
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await b.open({dream:true});
  await b.set(['指针视差'],'启用指针视差',false);
  const original=await b.evaluate('__camera.position.toArray()');
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs',{urls:['*blue-morpho-butterfly.glb']});
  await b.set(select,'当前场景','场景6·蝶翼');
  await b.until(`document.querySelector('.viewer-butterfly-status').dataset.kind==='error'`);
  await b.send('Network.setBlockedURLs',{urls:[]});
  await b.click(panel,'重试模型加载');
  await b.until(`document.querySelector('.viewer-butterfly-status').dataset.kind==='ready'`);
  await b.evaluate(`window.bf=__observed.findLast(o=>o.name==='场景6·蝶翼');
    window.hinge=bf.getObjectByName('LeftForewingPivot');window.bfRenders=0;
    bf.onAfterRender=()=>bfRenders++;void 0;`);
  report.failureRecovery=true;
  const before=await b.evaluate('hinge.quaternion.toArray()');
  await b.delay(210);
  assert.notDeepEqual(await b.evaluate('hinge.quaternion.toArray()'),before);
  report.model=await b.evaluate(`({clips:bf.userData.butterfly.animationClips,
    canvasCount:document.querySelectorAll('canvas').length,calls:__renderer.info.render.calls,
    triangles:__renderer.info.render.triangles,sharedHDRI:bf.environment===scene.environment,
    isolated:!bf.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS')&&!scene.visible})`);
  assert.equal(report.model.clips,1);assert.equal(report.model.canvasCount,1);
  assert.equal(report.model.sharedHDRI,true);assert.equal(report.model.isolated,true);
  report.textures=await b.evaluate(`['LeftForewing','RightForewing','LeftHindwing','RightHindwing'].map(n=>{
    const m=bf.getObjectByName(n).material;
    return {name:n,colorWidth:m.map?.image.width,reliefWidth:m.normalMap?.image.width,metalness:m.metalness};
  })`);
  assert.ok(report.textures.every(t=>t.colorWidth===1536&&t.reliefWidth===1536&&t.metalness===0));
  await b.evaluate(`folder(['场景6·蝶翼']).classList.remove('closed');void 0`);
  await b.screenshot('01-wingbeat.png');
  await b.set(panel,'播放扇翅',false);await b.delay(150);
  const paused=await b.evaluate('({time:bf.userData.butterfly.time,q:hinge.quaternion.toArray(),renders:bfRenders})');
  await b.delay(250);
  assert.deepEqual(await b.evaluate('({time:bf.userData.butterfly.time,q:hinge.quaternion.toArray(),renders:bfRenders})'),paused);
  report.pauseOnDemand=true;
  await b.click(panel,'展开翅膀观察');await b.delay(100);
  assert.ok(await b.evaluate('Math.abs(hinge.quaternion.w-1)<1e-6'));
  await b.screenshot('02-open-wings.png');
  await b.set(panel,'飞行起伏',false);
  // Inspect exact poses from the exported clip with the normal scene animation paused.
  await b.evaluate(`(async()=>{
    const THREE=await import('/source/threejs-transmission/build/three.module.js');
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const {disposeButterflyTree}=await import('/src/viewer/butterflyScene.js');
    const exported=await new GLTFLoader().loadAsync('/models/blue-morpho-butterfly.glb');
    window.poseMixer=new THREE.AnimationMixer(bf.getObjectByName('Butterfly'));
    poseMixer.clipAction(exported.animations[0]).play();disposeButterflyTree(exported.scene);
    __camera.position.set(4.7,2.7,7);__camera.lookAt(0,.35,0);
  })()`);
  for(const [time,label] of [[.2,'05-upstroke-82'],[.6,'06-downstroke-43']]){
    await b.evaluate(`poseMixer.setTime(${time});__renderer.render(bf,__camera);`);
    await b.screenshot(label+'.png');
  }
  await b.evaluate('poseMixer.stopAllAction();poseMixer.uncacheRoot(bf.getObjectByName("Butterfly"));delete window.poseMixer;');
  await b.click(select,'重置当前场景视角');
  report.extremePoses=true;
  await b.set(panel,'林间微光',false);await b.delay(100);
  assert.equal(await b.evaluate(`bf.getObjectByName('林间微尘与远处散景').visible`),false);
  await b.click(panel,'重置蝴蝶');
  await b.set(panel,'扇翅速度',0);await b.delay(100);
  const zero=await b.evaluate('bf.userData.butterfly.time');await b.delay(180);
  assert.equal(await b.evaluate('bf.userData.butterfly.time'),zero);
  await b.set(panel,'扇翅速度',1);
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:500,y:500,button:'left',clickCount:1});
  await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:760,y:550,button:'left',buttons:1});
  await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:760,y:550,button:'left',clickCount:1});
  await b.delay(100);await b.screenshot('03-side-view.png');
  const rotated=await b.evaluate('__camera.position.toArray()');
  await b.set(select,'当前场景','场景1·标本纵深');await b.delay(100);
  assert.deepEqual(await b.evaluate('__camera.position.toArray()'),original);
  const inactive=await b.evaluate('bf.userData.butterfly.time');await b.delay(220);
  assert.equal(await b.evaluate('bf.userData.butterfly.time'),inactive);
  await b.set(select,'当前场景','场景6·蝶翼');await b.delay(120);
  assert.deepEqual(await b.evaluate('__camera.position.toArray()'),rotated);
  const memory=await b.evaluate('({...__renderer.info.memory})');
  for(let i=0;i<3;i++){
    await b.set(select,'当前场景','场景1·标本纵深');await b.delay(60);
    await b.set(select,'当前场景','场景6·蝶翼');await b.delay(60);
  }
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory})'),memory);
  report.switchingAndResources=true;
  await b.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));`);
  const hidden=await b.evaluate('bf.userData.butterfly.time');await b.delay(200);
  assert.equal(await b.evaluate('bf.userData.butterfly.time'),hidden);
  await b.evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));`);
  await b.delay(60);assert.ok(await b.evaluate('bf.userData.butterfly.time')-hidden<.15);
  report.visibilityPause=true;
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await b.delay(120);const reduced=await b.evaluate('bf.userData.butterfly.time');await b.delay(180);
  assert.equal(await b.evaluate('bf.userData.butterfly.time'),reduced);
  report.reducedMotion=true;
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await b.click(select,'重置当前场景视角');await b.click(panel,'重置蝴蝶');
  // Direct preview uses the normal scene entry, with the same single canvas.
  await b.send('Page.navigate',{url:'http://127.0.0.1:5173/?scene=butterfly'});
  await b.until(`document.querySelector('.viewer-scene-status')?.dataset.scene==='butterfly'&&document.querySelector('.viewer-butterfly-status')?.dataset.kind==='ready'`);
  report.directEntry=true;
  await b.delay(250);await b.screenshot('04-direct-preview.png');
  assert.deepEqual(b.errors,[]);report.errors=b.errors;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {
  await b.send('Network.setBlockedURLs',{urls:[]});
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  b.close();
}
