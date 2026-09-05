import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide output directory');
await mkdir(output, { recursive: true });
const b = await browserHarness(output), report = {};
const select = ['场景选择'], panel = ['场景5·纸飞机环游'];
try {
  await b.open({ dream: true });
  await b.set(['指针视差'], '启用指针视差', false);
  const originalCamera = await b.evaluate('__camera.position.toArray()');
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*paper-orbit-earth.glb'] });
  await b.set(select, '当前场景', '场景5·纸飞机环游');
  await b.until(`document.querySelector('.viewer-paper-status').dataset.kind === 'error'`);
  await b.send('Network.setBlockedURLs', { urls: [] });
  await b.click(panel, '重试模型加载');
  await b.until(`document.querySelector('.viewer-paper-status').dataset.kind === 'ready'`);
  await b.click(panel, '跳过入场');
  report.failureRecovery = true;
  await b.evaluate(`window.paperScene = __observed.findLast(o => o.name === '场景5·纸飞机环游');
    window.aircraft = paperScene.getObjectByName('万架纸飞机·GPU航道');
    window.paperRenders=0; paperScene.onAfterRender=()=>paperRenders++;`);
  await b.delay(500);
  report.default = await b.evaluate(`({count:aircraft.count, calls:__renderer.info.render.calls,
    triangles:__renderer.info.render.triangles, oneCanvas:document.querySelectorAll('canvas').length===1,
    isolated:!paperScene.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS') && !scene.visible,
    sharedEnvironment:paperScene.environment===scene.environment,
    instanced:aircraft.isInstancedMesh, attributes:aircraft.geometry.attributes.orbitData.count})`);
  assert.equal(report.default.count, 2400);
  assert.equal(report.default.calls, 6);
  for (const key of ['oneCanvas', 'isolated', 'sharedEnvironment', 'instanced']) assert.equal(report.default[key], true);
  assert.equal(report.default.attributes, 10000);
  await b.screenshot('01-default.png');

  report.timing = await b.evaluate(`new Promise(resolve=>{
    const samples=[];let last=performance.now();
    function tick(now){samples.push(now-last);last=now;
      if(samples.length<90)requestAnimationFrame(tick);
      else resolve({averageFrameMs:samples.reduce((a,b)=>a+b)/samples.length,maxFrameMs:Math.max(...samples)});}
    requestAnimationFrame(tick);
  })`);
  const movingTime = await b.evaluate('paperScene.userData.paperOrbit.time');
  await b.delay(200);
  assert.ok(await b.evaluate('paperScene.userData.paperOrbit.time') > movingTime);
  await b.set(panel, '播放环游', false); await b.delay(250);
  const paused = await b.evaluate('({time:paperScene.userData.paperOrbit.time,renders:paperRenders})');
  await b.delay(350);
  assert.deepEqual(await b.evaluate('({time:paperScene.userData.paperOrbit.time,renders:paperRenders})'), paused);
  report.pauseOnDemand = true;

  await b.set(panel, '显示飞行路径', true);
  await b.set(panel, '航道起伏', .7);
  await b.set(panel, '环绕半径', 4.2);
  await b.delay(100);
  assert.equal(await b.evaluate(`paperScene.getObjectByName('环绕航道预览').visible`), true);
  await b.screenshot('02-routes.png');
  await b.set(panel, '纸飞机数量', 10000);
  await b.set(panel, '纸飞机大小', .6);
  await b.set(panel, '播放环游', true);
  await b.delay(300);
  assert.equal(await b.evaluate('aircraft.count'), 10000);
  report.maximum = await b.evaluate('({...__renderer.info.render})');
  await b.set(panel, '纸飞机数量', 0);
  await b.delay(100); assert.equal(await b.evaluate('aircraft.count'), 0);
  await b.click(panel, '重置纸飞机环游');
  await b.delay(100);
  const paperCamera = await b.evaluate('__camera.position.toArray()');
  await b.set(select, '当前场景', '场景1·标本纵深');
  await b.delay(100);
  assert.deepEqual(await b.evaluate('__camera.position.toArray()'), originalCamera);
  const inactive = await b.evaluate('paperScene.userData.paperOrbit.time');
  await b.delay(250); assert.equal(await b.evaluate('paperScene.userData.paperOrbit.time'), inactive);
  await b.set(select, '当前场景', '场景5·纸飞机环游');
  await b.delay(100);
  assert.deepEqual(await b.evaluate('__camera.position.toArray()'), paperCamera);
  const resources = await b.evaluate('({...__renderer.info.memory})');
  for (let i = 0; i < 4; i++) {
    await b.set(select, '当前场景', '场景1·标本纵深'); await b.delay(60);
    await b.set(select, '当前场景', '场景5·纸飞机环游'); await b.delay(60);
  }
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory})'), resources);
  report.switchingAndResources = true;

  // Exercise real OrbitControls input, then ensure its pose survives scene switches.
  await b.send('Input.dispatchMouseEvent', { type:'mousePressed', x:500, y:450, button:'left', clickCount:1 });
  await b.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:680, y:530, button:'left', buttons:1 });
  await b.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:680, y:530, button:'left', clickCount:1 });
  await b.delay(100);
  const rotated = await b.evaluate('__camera.position.toArray()');
  assert.notDeepEqual(rotated, paperCamera);
  await b.set(select, '当前场景', '场景4·无限花开'); await b.delay(150);
  await b.set(select, '当前场景', '场景5·纸飞机环游'); await b.delay(100);
  (await b.evaluate('__camera.position.toArray()')).forEach((value, i) => assert.ok(Math.abs(value - rotated[i]) < 1e-10));
  await b.screenshot('03-orbited.png');
  await b.click(select, '重置当前场景视角');
  await b.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await b.delay(250);
  const reducedTime = await b.evaluate('paperScene.userData.paperOrbit.time');
  await b.delay(250); assert.equal(await b.evaluate('paperScene.userData.paperOrbit.time'), reducedTime);
  report.reducedMotion = true;
  await b.send('Emulation.setEmulatedMedia', {features:[]});
  await b.click(panel, '重置纸飞机环游');
  await b.evaluate(`folder(['场景5·纸飞机环游']).querySelector(':scope > .title').click()`);
  await b.delay(350);
  await b.screenshot('04-controls.png');
  assert.deepEqual(b.errors, []);
  report.errors = b.errors;
  await writeFile(join(output, 'scene5-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await b.send('Network.setBlockedURLs', { urls: [] });
  b.close();
}
