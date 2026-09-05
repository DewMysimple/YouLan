import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide output directory');
await mkdir(output, { recursive: true });
const b = await browserHarness(output), report = {};
const selection = ['场景选择'], panel = ['场景6·纸飞机环游'];
try {
  await b.open({ dream: true });
  // Keep default pointer parallax enabled to test its camera ownership boundary.
  await b.set(selection, '当前场景', '场景6·纸飞机环游');
  await b.until(`__observed.findLast(o=>o.name==='场景6·纸飞机环游')?.userData.paperOrbit.intro?.state==='flying'`);
  await b.evaluate(`window.paperScene=__observed.findLast(o=>o.name==='场景6·纸飞机环游');
    window.hero=paperScene.getObjectByName('入场领航纸飞机');
    window.aircraft=paperScene.getObjectByName('万架纸飞机·GPU航道'); true;`);
  report.opening = await b.evaluate(`({state:paperScene.userData.paperOrbit.intro.state,
    hero:hero.visible, leadScale:aircraft.geometry.attributes.orbitData.getW(0), calls:__renderer.info.render.calls,
    camera:__camera.position.toArray()})`);
  assert.equal(report.opening.hero, true);
  assert.equal(report.opening.leadScale, 0);
  report.sky = await b.evaluate(`({clouds:paperScene.getObjectByName('场景6·远近云层').count,
    sun:paperScene.getObjectByName('场景6·粉彩天空').material.uniforms.sunStrength.value})`);
  assert.equal(report.sky.clouds, 660);
  assert.ok(report.sky.sun > 0);
  // The instanced batch still submits a draw when its vertices are offscreen.
  await b.screenshot('01-single-plane.png');
  await b.delay(2200); await b.screenshot('02-follow.png');
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 160, y: 180 });
  await b.delay(2800); await b.screenshot('03-reveal.png');
  await b.delay(2500); await b.screenshot('04-pullback.png');
  await b.until(`paperScene.userData.paperOrbit.intro.state==='complete'`);
  report.completed = await b.evaluate(`({hero:hero.visible, leadScale:aircraft.geometry.attributes.orbitData.getW(0),
    camera:__camera.position.toArray(),calls:__renderer.info.render.calls})`);
  assert.equal(report.completed.hero, false);
  assert.ok(report.completed.leadScale > 0);
  assert.ok(Math.abs(report.completed.camera[2]-18.8)<1e-8);
  await b.screenshot('05-overview.png');
  const settled = report.completed.camera;
  await b.delay(150);
  (await b.evaluate('__camera.position.toArray()')).forEach((v,i)=>assert.ok(Math.abs(v-settled[i])<1e-8));
  await b.send('Input.dispatchMouseEvent', {type:'mousePressed',x:500,y:450,button:'left',clickCount:1});
  await b.send('Input.dispatchMouseEvent', {type:'mouseMoved',x:650,y:500,buttons:1});
  await b.send('Input.dispatchMouseEvent', {type:'mouseReleased',x:650,y:500,button:'left',clickCount:1});
  assert.notDeepEqual(await b.evaluate('__camera.position.toArray()'), settled);
  report.handoff = true;

  await b.click(panel, '重播入场'); await b.delay(200);
  await b.set(selection, '当前场景', '场景2·标本纵深');
  const otherCamera = await b.evaluate('__camera.position.toArray()');
  await b.delay(150);
  assert.deepEqual(await b.evaluate('__camera.position.toArray()'), otherCamera);
  await b.set(selection, '当前场景', '场景6·纸飞机环游');
  assert.equal(await b.evaluate('paperScene.userData.paperOrbit.intro.state'), 'complete');
  assert.ok(Math.abs((await b.evaluate('__camera.position.toArray()'))[2]-18.8)<1e-8);
  report.interruptedSwitch = true;

  await b.click(panel, '重播入场'); await b.delay(100);
  await b.click(panel, '跳过入场');
  assert.equal(await b.evaluate('paperScene.userData.paperOrbit.intro.state'), 'complete');
  await b.click(panel, '重播入场'); await b.delay(100);
  await b.click(selection, '重置当前场景视角');
  assert.equal(await b.evaluate('paperScene.userData.paperOrbit.intro.state'), 'complete');
  report.replaySkipReset = true;

  await b.set(panel, '播放环游', false);
  await b.set(panel, '显示云层', false); await b.delay(100);
  assert.equal(await b.evaluate('__renderer.info.render.calls'), 6);
  await b.set(panel, '太阳柔光', 0);
  assert.equal(await b.evaluate(`paperScene.getObjectByName('场景6·粉彩天空').material.uniforms.sunStrength.value`), 0);
  await b.set(panel, '显示云层', true);
  await b.set(panel, '云层浓度', 1);
  await b.set(panel, '太阳柔光', .65);
  await b.delay(100);
  assert.equal(await b.evaluate('__renderer.info.render.calls'), 7);
  assert.equal(await b.evaluate(`paperScene.getObjectByName('场景6·远近云层').material.uniforms.opacity.value`), 1);
  report.skyControls = true;
  await b.click(panel, '重置纸飞机环游');

  await b.click(panel, '重播入场'); await b.delay(100);
  await b.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await b.delay(200);
  assert.equal(await b.evaluate('paperScene.userData.paperOrbit.intro.state'), 'complete');
  await b.click(panel, '重播入场');
  assert.equal(await b.evaluate('paperScene.userData.paperOrbit.intro.state'), 'complete');
  report.reducedMotion = true;
  await b.send('Page.addScriptToEvaluateOnNewDocument', {source:`
    window.__introScenes=[];
    window.__THREE_DEVTOOLS__={dispatchEvent(e){if(e.type==='observe'&&e.detail.isScene){
      __introScenes.push(e.detail);e.detail.onBeforeRender=(r,s,c)=>{window.__introCamera=c;};
    }}};`});
  await b.send('Page.navigate', {url:'http://127.0.0.1:5173/?scene=paper'});
  await b.until(`__introScenes.findLast(s=>s.name==='场景6·纸飞机环游')?.userData.paperOrbit.ready`);
  assert.equal(await b.evaluate(`__introScenes.findLast(s=>s.name==='场景6·纸飞机环游').getObjectByName('入场领航纸飞机').visible`), false);
  assert.ok(Math.abs(await b.evaluate('__introCamera.position.z')-18.8)<1e-8);
  report.reducedMotionStartup = true;
  await b.send('Emulation.setEmulatedMedia', {features:[]});
  await b.send('Page.navigate', {url:'http://127.0.0.1:5173/?scene=paper'});
  await b.until(`__introScenes.findLast(s=>s.name==='场景6·纸飞机环游')?.userData.paperOrbit.intro?.state==='flying'`);
  await b.screenshot('06-direct-entry.png');
  assert.ok(await b.evaluate('__introCamera.position.z')>30);
  report.directEntry = true;
  assert.deepEqual(b.errors, []);
  report.errors = b.errors;
  await writeFile(join(output, 'intro-report.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {
  await b.send('Emulation.setEmulatedMedia', {features:[]});
  b.close();
}
