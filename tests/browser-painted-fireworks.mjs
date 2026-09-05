import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide screenshot output directory.');
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
const panel = ['场景3·指尖花火'];
const report = {};
try {
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__audioContexts=[]; window.__audioStarts=0;
    const NativeAudioContext=window.AudioContext;
    window.AudioContext=class extends NativeAudioContext {
      constructor(...args){super(...args);window.__audioContexts.push(this);}
      createBufferSource(){const source=super.createBufferSource();const start=source.start.bind(source);source.start=(...args)=>{window.__audioStarts++;return start(...args)};return source;}
    };
  `});
  await b.open({ dream: true });
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.set(['场景选择'], '当前场景', '场景3·指尖花火');
  await b.evaluate(`window.fireScene=__observed.findLast(s=>s.name==='场景3·指尖花火');window.ribbon=fireScene.getObjectByName('彩色花火·固定批量色带');window.fu=ribbon.material.uniforms;window.frames=0;fireScene.onAfterRender=()=>frames++;`);
  await b.set(panel, '时间预览（秒）', 3.2);
  await b.delay(200);
  assert.deepEqual(await b.evaluate(`__renderer.info.programs.filter(p=>p.diagnostics && !p.diagnostics.runnable).map(p=>({name:p.name,log:p.diagnostics.fragmentShader.log}))`), []);
  await b.screenshot('fireworks-01-new-default.png');
  report.initial = await b.evaluate(`({canvas:document.querySelectorAll('canvas').length,instanced:ribbon.geometry.isInstancedBufferGeometry,instances:ribbon.geometry.instanceCount,visible:ribbon.parent.visible,classicHidden:!fireScene.getObjectByName('场景3·金菊闪柳烟花主体').visible,time:fu.clockTime.value})`);
  assert.equal(report.initial.canvas, 1); assert.equal(report.initial.instanced, true); assert.equal(report.initial.classicHidden, true);
  const frames = await b.evaluate('frames'); await b.delay(350); assert.equal(await b.evaluate('frames'), frames);
  report.pausedOnDemand = true;
  assert.equal(await b.evaluate('__audioContexts.length'),0,'No audio context before a user gesture');
  await b.set(panel, '时间预览（秒）', 5.1); await b.delay(100); await b.screenshot('fireworks-02-layered.png');
  await b.set(panel, '时间预览（秒）', 7.2); await b.delay(100); await b.screenshot('fireworks-03-crowns.png');
  const camera = await b.evaluate('__camera.position.toArray()');
  await b.set(panel, '自动烟花秀', false);
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 780, y: 350, button: 'left', clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 780, y: 350, button: 'left', clickCount: 1 });
  await b.delay(1500);
  report.click = await b.evaluate(`({target:fu.shells.value.find(s=>Math.abs(s.x-780/1440)<.001)?.toArray(),time:fu.clockTime.value,status:document.querySelector('.viewer-painted-status').textContent})`);
  assert.ok(report.click.target); assert.ok(Math.abs(report.click.target[1] - (1 - 350/900)) < .001);
  assert.ok(await b.evaluate('__audioContexts.some(c=>c.state==="running") && __audioStarts>0'));
  report.audioUnlockedOnClick = true;
  assert.deepEqual(await b.evaluate('__camera.position.toArray()'), camera);
  await b.screenshot('fireworks-04-click.png');
  await b.set(panel, '播放动画', false);
  const beforeDrag = await b.evaluate('fu.shells.value.map(s=>s.toArray())');
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:700,y:430,button:'left',clickCount:1});
  for(let i=1;i<=12;i++)await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:700+i*15,y:430+i*3,buttons:1});
  await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:880,y:466,button:'left',clickCount:1});
  await b.delay(400);
  assert.notDeepEqual(await b.evaluate('__camera.position.toArray()'),camera);
  assert.deepEqual(await b.evaluate('fu.shells.value.map(s=>s.toArray())'),beforeDrag);
  const rotated=await b.evaluate('__camera.position.toArray()');
  await b.screenshot('fireworks-07-threejs-rotated.png');
  await b.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:650,y:400,deltaX:0,deltaY:-170}); await b.delay(350);
  assert.notDeepEqual(await b.evaluate('__camera.position.toArray()'),rotated);
  report.orbit = { rotation:true, zoom:true, dragDoesNotLaunch:true };
  // Ray-plane picking must still hit the requested screen point after orbit.
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:510,y:290,button:'left',clickCount:1});
  await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:510,y:290,button:'left',clickCount:1});
  const projected = await b.evaluate(`(()=>{const index=fu.shells.value.findIndex(s=>Math.abs(s.x-510/1440)<.001);if(index<0)return null;return fu.centers.value[index].clone().project(__camera).toArray();})()`);
  assert.ok(projected); assert.ok(Math.abs(projected[0]-(510/1440*2-1))<.01); assert.ok(Math.abs(projected[1]-(1-290/900*2))<.01);
  report.orbit.clickAfterRotation=true;
  await b.click(['场景选择'],'重置当前场景视角');
  await b.set(panel,'播放速度',.1);
  const slowStart=await b.evaluate('fu.clockTime.value');await b.delay(800);
  const slowDelta=await b.evaluate(`fu.clockTime.value-${slowStart}`);
  assert.ok(slowDelta>0 && slowDelta<.15);
  report.tenPercentMotionChecked=true;
  await b.set(panel,'播放速度',1);
  if (process.env.PREVIEW_ONLY) { console.log(JSON.stringify(report)); }
  else {
    await b.set(panel, '烟花音效', false);
    assert.ok((await b.evaluate(`document.querySelector('.viewer-painted-status').textContent`)).includes('静音'));
    await b.set(panel, '烟花模式', '金菊闪柳（原版）');
    assert.equal(await b.evaluate(`ribbon.parent.visible`), false);
    assert.equal(await b.evaluate(`fireScene.getObjectByName('场景3·金菊闪柳烟花主体').visible`), true);
    await b.set(panel, '烟花模式', '彩色指尖花火');
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await b.delay(150);
    const time = await b.evaluate('fu.clockTime.value');
    await b.delay(200); assert.equal(await b.evaluate('fu.clockTime.value'), time);
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 460, y: 240, button: 'left', clickCount: 1 });
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 460, y: 240, button: 'left', clickCount: 1 });
    await b.delay(200); assert.equal(await b.evaluate('fu.clockTime.value'), time);
    report.reducedMotionStatic = true;
    await b.send('Emulation.setEmulatedMedia', { features: [] });
    await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await b.set(panel, '时间预览（秒）', 4.2);
    await b.evaluate(`document.querySelector('.lil-gui.root').style.visibility='hidden'`);
    await b.screenshot('fireworks-05-portrait.png');
    assert.deepEqual(await b.evaluate('fu.resolution.value.toArray()'), [390, 844]);
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 170, y: 230 }] });
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await b.delay(100);
    assert.ok(await b.evaluate('fu.shells.value.some(s=>Math.abs(s.x-170/390)<.001)'));
    report.touch = true;
    await b.evaluate(`document.querySelector('.lil-gui.root').style.visibility=''`);
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const label of ['场景1·标本纵深','场景2·花粉星云','场景4·无限花开','场景5·纸飞机环游','场景6·蝶翼','场景7·斑驳光影']) {
      await b.set(['场景选择'], '当前场景', label); await b.delay(100);
      assert.equal(await b.evaluate('ribbon.parent.visible'), false);
      await b.set(['场景选择'], '当前场景', '场景3·指尖花火');
    }
    report.sceneRoundtrips = true;
    // Compile / upload the classic mode once before measuring live allocations.
    await b.set(panel,'烟花模式','金菊闪柳（原版）'); await b.delay(200);
    await b.set(panel,'烟花模式','彩色指尖花火'); await b.delay(200);
    const before = await b.evaluate('JSON.stringify(__renderer.info.memory)');
    for (let i=0;i<6;i++) {
      await b.set(panel,'烟花模式','金菊闪柳（原版）'); await b.delay(50);
      await b.set(panel,'烟花模式','彩色指尖花火'); await b.delay(50);
    }
    assert.equal(await b.evaluate('JSON.stringify(__renderer.info.memory)'),before);
    report.stableResources = true;
    await b.set(panel,'时间预览（秒）',3.2);
    await b.evaluate(`folder(['场景3·指尖花火']).classList.remove('closed')`);
    await b.screenshot('fireworks-06-final-preview.png');
    assert.equal(b.errors.length,0,JSON.stringify(b.errors));
    report.consoleErrors = b.errors;
    await writeFile(join(output,'fireworks-report.json'),JSON.stringify(report,null,2));
    await b.send('Page.navigate',{url:new URL('?scene=3',process.env.VIEWER_URL || 'http://127.0.0.1:5173/').href});
    await b.until(`document.querySelector('.viewer-scene-status')?.dataset.scene==='firework'`);
    await b.delay(350); await b.screenshot('fireworks-08-live-preview.png');
    assert.equal(b.errors.length,0,JSON.stringify(b.errors));
    report.directScene3=true;
    await writeFile(join(output,'fireworks-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }
} finally { b.close(); }
