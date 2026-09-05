import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide output directory');
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
const selector = ['场景选择'];
const panel = ['场景5·无限花开'];
const report = {};
try {
  await b.open({ dream: true });
  await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  const specimenCamera = await b.evaluate('__camera.position.toArray()');
  await b.set(selector, '当前场景', '场景5·无限花开');
  await b.until(`__observed.some(o => o.name === '场景5·无限花开' && o.userData.infiniteBloom?.ready)`);
  await b.evaluate(`window.scene4=__observed.findLast(o=>o.name==='场景5·无限花开');window.batches=scene4.userData.infiniteBloom.petalBatches;window.scene4Renders=0;scene4.onAfterRender=()=>scene4Renders++`);
  report.isolation = await b.evaluate(`({scene1Visible:scene.visible,scene4Visible:scene4.visible,sameEnvironment:scene.environment===scene4.environment,petalsInScene1:!!scene.getObjectByName(batches[0].name)})`);
  assert.deepEqual(report.isolation,{scene1Visible:false,scene4Visible:true,sameEnvironment:true,petalsInScene1:false});
  assert.equal(await b.evaluate('batches.length'),5);
  assert.equal(await b.evaluate('batches.reduce((n,b)=>n+b.geometry.attributes.position.count,0)'),8084);
  assert.ok(await b.evaluate(`batches.every(b=>b.material.map.colorSpace==='srgb'&&b.geometry.attributes.petalBend.isInstancedBufferAttribute)`));
  await b.set(panel,'播放绽放',false);await b.set(panel,'背景缓慢流动',false);
  await b.set(panel,'周期预览',0);
  await b.delay(150);
  const snapshots=[];
  for(const [index,time] of [0,.2,.4,.6,.8,.999].entries()) {
    await b.set(panel,'周期预览',time);await b.delay(100);
    await b.evaluate(`document.querySelector('.lil-gui.root').style.display='none'`);
    await b.screenshot(`flower-${index}.png`);
    const state=await b.evaluate(`({time:scene4.userData.infiniteBloom.elapsed,growing:scene4.userData.infiniteBloom.petals.filter(p=>!p.falling).length,falling:scene4.userData.infiniteBloom.petals.filter(p=>p.falling).length,matrices:batches.map(b=>Array.from(b.instanceMatrix.array))})`);
    assert.equal(state.growing,35);assert.ok(state.falling>8);
    snapshots.push(state);
  }
  assert.notDeepEqual(snapshots[0].matrices,snapshots[1].matrices,'actual renderer transforms must move');
  // Track the rendered center of one detached petal (including its tumble),
  // project with the real default camera, then seek two seconds later.
  await b.evaluate(`window.projectPetal=async id=>{
    const T=await import('/source/threejs-transmission/build/three.module.js');
    const sample=scene4.userData.infiniteBloom.petals.find(p=>p.id===id);
    const type=(id%5+5)%5;
    const peers=scene4.userData.infiniteBloom.petals.filter(p=>p.visible&&(p.id%5+5)%5===type);
    const batch=batches[type];const matrix=new T.Matrix4();batch.getMatrixAt(peers.findIndex(p=>p.id===id),matrix);
    const k=sample.bend/2.5,a=1.2*k;
    const center=new T.Vector3(0,Math.sin(a)/k-.1*Math.sin(a),(1-Math.cos(a))/k+.1*Math.cos(a));
    center.applyMatrix4(matrix).applyMatrix4(batch.matrixWorld).project(__camera);
    return {x:center.x,y:center.y,bend:sample.bend,scale:sample.scale};
  }`);
  await b.set(panel,'周期预览',.2);
  const id=await b.evaluate('scene4.userData.infiniteBloom.petals.find(p=>p.falling&&p.fallTime>.3&&p.fallTime<1).id');
  const start=await b.evaluate(`projectPetal(${id})`);
  await b.set(panel,'周期预览',.4);await b.delay(100);
  const end=await b.evaluate(`projectPetal(${id})`);
  assert.ok(end.x>start.x+.12 && end.y<start.y-.10,'rendered detached petal must travel down-right');
  assert.equal(start.scale,end.scale);assert.equal(start.bend,end.bend);
  report.flight={id,start,end};
  const idle=await b.evaluate('scene4Renders');await b.delay(400);
  assert.equal(await b.evaluate('scene4Renders'),idle,'pause stops rendering');
  for(const layers of [1,12,7]) {
    await b.set(panel,'生长花瓣层数',layers);
    assert.equal(await b.evaluate('scene4.userData.infiniteBloom.petals.filter(p=>!p.falling).length'),layers*5);
  }
  await b.set(panel,'花瓣在枝时长（秒）',3);await b.set(panel,'飘落持续（秒）',8);await b.set(panel,'生长花瓣层数',12);
  assert.ok(await b.evaluate('batches.every(b=>b.count<=b.instanceMatrix.count)'));
  await b.click(panel,'重置无限花开');await b.set(panel,'背景缓慢流动',false);await b.set(panel,'绽放速度',2);
  const initial=await b.evaluate('scene4.userData.infiniteBloom.elapsed');
  await b.delay(11500);
  const advanced=await b.evaluate('scene4.userData.infiniteBloom.elapsed');
  assert.ok(advanced-initial>20,'actual RAF must run across multiple age cycles');
  await b.set(panel,'播放绽放',false);
  report.continuousPlayback={initial,advanced,instances:await b.evaluate('batches.map(b=>b.count)')};
  const camera4=await b.evaluate('__camera.position.toArray()');
  await b.set(selector,'当前场景','场景2·标本纵深');await b.delay(150);
  const restored=await b.evaluate('__camera.position.toArray()');
  restored.forEach((v,i)=>assert.ok(Math.abs(v-specimenCamera[i])<1e-8));
  const inactiveTime=await b.evaluate('scene4.userData.infiniteBloom.elapsed');await b.delay(200);
  assert.equal(await b.evaluate('scene4.userData.infiniteBloom.elapsed'),inactiveTime);
  await b.set(selector,'当前场景','场景5·无限花开');await b.delay(150);
  assert.deepEqual(await b.evaluate('__camera.position.toArray()'),camera4);
  await b.evaluate(`document.querySelector('.lil-gui.root').style.display='';folder(['场景5·无限花开']).classList.remove('closed');controller(['场景5·无限花开'],'向右风力').scrollIntoView({block:'center'})`);
  await b.screenshot('flower-panel.png');
  assert.equal(b.errors.length,0,JSON.stringify(b.errors));
  report.result='passed';report.phaseCounts=snapshots.map(({time,growing,falling})=>({time,growing,falling}));
  await writeFile(join(output,'scene4-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} catch(error) {await b.screenshot('scene4-failure.png');console.error(b.errors);throw error;}finally{b.close();}
