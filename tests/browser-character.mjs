import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browserHarness } from './browserHarness.mjs';

const output=process.argv[2];if(!output)throw Error('Provide output directory');
await mkdir(output,{recursive:true});
const b=await browserHarness(output), panel=['场景11·字符物理实验'], select=['场景选择'];
const report={};
const read=()=>b.evaluate('structuredClone(cs.userData.character)');
const capture=async name=>{await b.delay(120);return b.screenshot(name);};
try {
  await b.send('Runtime.discardConsoleEntries');
  await b.send('Emulation.setEmulatedMedia',{features:[]});
  await b.open({dream:true});
  await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  await b.set(['指针视差'],'启用指针视差',false);
  await b.set(['梦境背景与迎光'],'背景流动',false);
  await b.evaluate(`window.cs=__observed.findLast(o=>o.name==='场景11·字符物理实验');void 0;`);
  assert.equal((await read()).ready,false,'engine stays lazy outside scene11');
  const originalCamera=await b.evaluate('__camera.position.toArray()');
  report.options=await b.evaluate(`Array.from(controller(['场景选择'],'当前场景').querySelector('select').options).map(o=>o.textContent)`);
  assert.equal(report.options.at(-1),'场景11·字符物理实验');
  assert.ok(['场景8·纵深花廊','场景9·狮城手记','场景10·纸间来信'].every(name=>report.options.includes(name)),'existing scenes coexist with explicitly numbered scene11');
  await b.set(select,'当前场景','场景11·字符物理实验');
  await b.until('cs.userData.character.ready&&cs.userData.character.snapshot.time>.1');
  await b.set(panel,'播放动画',false);
  await b.set(panel,'时间预览（秒）',0);
  await b.evaluate(`folder(['场景11·字符物理实验']).classList.remove('closed');void 0;`);
  await capture('01-intro.png');
  assert.equal(await b.evaluate('document.querySelectorAll("canvas").length'),1,'one shared DOM canvas');
  const idle=await read();await b.delay(300);assert.deepEqual(await read(),idle,'pause returns to idle');
  report.stages=[];
  for(const t of [2,4.5,8]) {
    await b.set(panel,'时间预览（秒）',t);await capture(`02-time-${t}.png`);
    const snapshot=(await read()).snapshot;report.stages.push(snapshot);assert.ok(Math.abs(snapshot.time-t)<.001);
  }
  const final=(await read()).snapshot;
  assert.ok(final.butterflies>0&&final.flowers>0,'characters really become butterflies and a garden');
  const garden=await b.screenshot(null,[[500,680],[650,740],[740,790],[850,650]]);
  await b.set(panel,'播放动画',true);await b.delay(800);
  assert.equal((await read()).snapshot.time,8,'timeline stops at8 while life continues');
  const gardenMoving=await b.screenshot(null,[[500,680],[650,740],[740,790],[850,650]]);
  assert.notDeepEqual(gardenMoving,garden,'completed garden continues moving');
  await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:700,y:720});
  await b.delay(350);await capture('03-pointer-garden.png');
  await b.set(panel,'播放动画',false);await b.delay(150);
  const saved=await read();
  await b.set(select,'当前场景','场景7·斑驳光影');await b.delay(250);
  await b.set(select,'当前场景','场景1·标本纵深');await b.delay(250);
  assert.deepEqual(await read(),saved,'inactive engine and canvas never advance');
  assert.deepEqual(await b.evaluate('__camera.position.toArray()'),originalCamera);
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'r',code:'KeyR'});
  await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR'});
  assert.deepEqual(await read(),saved,'Character shortcuts are inactive in other scenes');
  await b.set(select,'当前场景','场景11·字符物理实验');
  for(const mode of ['局部扩散','同列坍方（整列缺口）','中心聚拢','波纹塌落']) {
    await b.set([...panel,'文字坍塌'],'文字变化形式',mode);
    await b.set(panel,'时间预览（秒）',2);assert.ok((await read()).snapshot.activeGlyphs>0);
  }
  for(const count of [100,220]) {
    await b.set([...panel,'文字坍塌'],'字符数量',count);await b.set(panel,'时间预览（秒）',8);
    assert.ok((await read()).snapshot.butterflies>0);
  }
  await b.set([...panel,'蝴蝶飞行'],'围绕半径',90);
  await b.click(panel,'恢复字符参数');
  assert.equal(await b.evaluate(`controller([...${JSON.stringify(panel)},'文字坍塌'],'字符数量').querySelector('input').value`),'160');
  assert.equal((await read()).snapshot.time,8,'parameter reset keeps time');
  const memory=await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  for(let i=0;i<3;i++) {
    await b.set(select,'当前场景','场景1·标本纵深');await b.set(select,'当前场景','场景11·字符物理实验');
    await b.set(panel,'时间预览（秒）',3);await b.delay(100);
  }
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),memory);
  report.resources=memory;
  await b.send('Emulation.setDeviceMetricsOverride',{width:900,height:1100,deviceScaleFactor:2,mobile:false});
  await capture('04-resize-dpr2.png');
  assert.equal(await b.evaluate('document.querySelectorAll("canvas").length'),1);
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await b.delay(150);
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),memory,'resize replaces texture without leaks');
  // Keyboard transport applies only to scene11 and never hijacks text entry.
  await b.evaluate('document.activeElement.blur()');
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});
  await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});
  await b.delay(180);assert.ok((await read()).snapshot.time>3);
  await b.set(panel,'播放动画',false);
  // Browser visibility pauses the shared scheduler and does not integrate hidden time.
  await b.set(panel,'播放动画',true);
  await b.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));`);
  await b.delay(150);const hidden=await read();await b.delay(250);assert.deepEqual(await read(),hidden);
  await b.evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));`);
  await b.delay(150);assert.ok((await read()).snapshot.time>hidden.snapshot.time);
  await b.set(panel,'播放动画',true);
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await b.delay(180);assert.equal(await b.evaluate(`controller(${JSON.stringify(panel)},'播放动画').querySelector('input').checked`),false);
  await b.click(panel,'重播字符花园');await b.delay(150);assert.equal((await read()).snapshot.time,0);
  await b.send('Emulation.setEmulatedMedia',{features:[]});
  // Exercise the exact numeric direct URL used in the delivered link.
  const base=process.env.VIEWER_URL||'http://127.0.0.1:5173/';
  await b.send('Page.navigate',{url:new URL('?scene=11',base).href});
  await b.until(`document.querySelector('.viewer-scene-status')?.dataset.scene==='character'`);
  await b.until(`Number(document.querySelector('.viewer-character-status')?.dataset.time)>.1`);
  await capture('05-direct-scene11.png');
  report.directScene11=true;report.errors=b.errors;
  assert.equal(b.errors.length,0,JSON.stringify(b.errors));
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally { b.close(); }
