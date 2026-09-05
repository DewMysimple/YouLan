import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { browserHarness } from './browserHarness.mjs';

const output = process.env.QA_OUTPUT || 'artifacts/scene10';
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
const report = [];
const scene10 = '场景11·纸间来信';
const select = name => b.set(['场景选择'], '当前场景', name);
const move = (x, y) => b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const activeAnimations = `document.querySelector('.viewer-feather').getAnimations({subtree:true}).filter(a=>a.playState==='running').length`;
const positions = `Array.from(document.querySelectorAll('.feather-card')).map(i=>{const r=i.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})`;
const gathered = `document.querySelector('.viewer-feather').dataset.gathered`;
const key = async (key, code, virtualKey) => {
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
};
try {
  await b.open({ dream: true });
  assert.equal(await b.evaluate(`document.querySelectorAll('.feather-card').length`), 0);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 824, deviceScaleFactor: 1, mobile: false });
  await move(100, 400); await select(scene10);
  await b.until(`document.querySelectorAll('.feather-card').length===22 && Array.from(document.querySelectorAll('.viewer-feather img')).every(i=>i.complete&&i.naturalWidth>0)`);
  await b.delay(750);
  assert.equal(await b.evaluate(`document.querySelectorAll('canvas').length`), 1);
  assert.equal(await b.evaluate(`document.querySelector('.viewer-feather iframe, .viewer-feather a')`), null);
  assert.equal(await b.evaluate(activeAnimations), 0);
  const scattered = await b.evaluate(positions);
  await b.screenshot('01-desktop.png');
  report.push('Lazy local assets: 22 stickers, complete owl; single shared canvas; static idle');

  await move(800, 412); await b.delay(250); await b.screenshot('02-gathering.png');
  const before = await b.evaluate(positions);
  await move(100, 400); const after = await b.evaluate(positions);
  assert.ok(before.every((point, i) => Math.hypot(point[0] - after[i][0], point[1] - after[i][1]) < 60), 'reversal preserves current pose');
  await b.delay(180); await move(800, 412); await b.delay(180); await move(100, 400); await b.delay(750);
  const restored = await b.evaluate(positions);
  assert.ok(restored.every((point, i) => point.every((v, j) => Math.abs(v - scattered[i][j]) < 1)), 'all stickers return exactly');
  assert.equal(await b.evaluate(activeAnimations), 0);
  await move(800, 412); await b.until(`!!document.querySelector('.viewer-feather').dataset.preview`);
  await b.delay(450); await b.screenshot('03-mail-preview.png');
  assert.ok(await b.evaluate(activeAnimations) >= 21);
  const preview = await b.evaluate(`document.querySelector('.viewer-feather').dataset.preview`);
  for (let i = 0; i < 3; i++) {
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 412, button: 'left', clickCount: 1 });
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 412, button: 'left', clickCount: 1 });
  }
  await b.until(`document.querySelector('.viewer-feather').dataset.preview !== ${JSON.stringify(preview)}`);
  await move(100, 400); await b.delay(700);
  assert.equal(await b.evaluate(activeAnimations), 0);
  report.push('Mouse gathering, orbit, popup, repeated interruption and exact return');

  await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 800, y: 700, deltaY: 900, deltaX: 0 });
  assert.equal(await b.evaluate(`document.querySelector('.viewer-scene-status').dataset.scene`), 'feather');
  assert.equal(await b.evaluate('window.scrollY'), 0);
  await key('Tab', 'Tab', 9);
  // Focus through the actual keyboard, skipping any GUI controls preceding it.
  for (let i = 0; i < 20 && !await b.evaluate(`document.activeElement.matches('.feather-handle')`); i++) await key('Tab', 'Tab', 9);
  assert.equal(await b.evaluate(`document.activeElement.matches('.feather-handle')`), true);
  await key('Enter', 'Enter', 13); await b.delay(700);
  await key('Escape', 'Escape', 27); await b.delay(700);
  assert.equal(await b.evaluate(gathered), 'false');
  await b.set([scene10], '贴纸尺寸', 1.2);
  assert.ok(await b.evaluate(`parseFloat(document.querySelector('.feather-card').style.width)`) > scattered[0][2] * 1.19);
  await b.click([scene10], '恢复参考效果');
  report.push('Keyboard, reset, live sizing and first-viewport scroll boundary');

  await move(800, 412); await b.delay(700);
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.delay(100); assert.equal(await b.evaluate(activeAnimations), 0);
  assert.equal(await b.evaluate(`document.querySelector('.feather-owl').naturalWidth>0`), true);
  await b.send('Emulation.setEmulatedMedia', { features: [] }); await b.delay(700);
  assert.ok(await b.evaluate(activeAnimations) > 0);
  await b.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`);
  await b.evaluate(`Promise.all(document.querySelector('.viewer-feather').getAnimations({subtree:true}).map(a=>a.ready)).then(()=>true)`);
  const frozen = await b.evaluate(positions); await b.delay(1200);
  assert.deepEqual(await b.evaluate(positions), frozen);
  assert.equal(await b.evaluate(activeAnimations), 0);
  await b.evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))`);
  await b.delay(700); assert.ok(await b.evaluate(activeAnimations) > 0);
  report.push('Live reduced motion and simulated tab visibility pause/resume');

  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await b.click(['场景选择'], '重置当前场景视角'); await b.delay(750);
  await b.screenshot('04-mobile.png');
  assert.equal(await b.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
  const tap = async () => {
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 422 }] });
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await tap(); await b.delay(1100); assert.equal(await b.evaluate(gathered), 'true');
  await b.screenshot('05-mobile-preview.png');
  await tap(); await b.delay(750); assert.equal(await b.evaluate(gathered), 'false');
  assert.equal(await b.evaluate(activeAnimations), 0);
  report.push('390px touch toggle, complete central hit area, no horizontal overflow');

  await b.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 824, deviceScaleFactor: 1, mobile: false });
  await select('场景2·标本纵深');
  const camera = await b.evaluate(`__camera.position.toArray()`);
  for (const name of ['场景3·花粉星云', '场景4·指尖花火', '场景5·无限花开', '场景6·纸飞机环游', '场景7·蝶翼', '场景8·斑驳光影', '场景9·纵深花廊', '场景10·狮城手记']) {
    await select(name); await b.delay(150); await select(scene10); await b.delay(100);
  }
  await select('场景12·字符物理实验');
  await b.until(`__observed.some(o=>o.userData?.character?.ready)`);
  await b.delay(250); await select(scene10);
  const characterFrames = await b.evaluate(`__observed.find(o=>o.userData?.character?.ready).userData.character.frames`);
  await b.delay(250);
  assert.equal(await b.evaluate(`__observed.find(o=>o.userData?.character?.ready).userData.character.frames`), characterFrames);
  await select('场景2·标本纵深');
  assert.deepEqual(await b.evaluate(`__camera.position.toArray()`), camera);
  assert.equal(await b.evaluate(activeAnimations), 0);
  assert.equal(await b.evaluate(`document.querySelector('.viewer-feather').hidden`), true);
  assert.equal(await b.evaluate(`document.querySelector('canvas').checkVisibility({visibilityProperty:true})`), true);
  await b.evaluate(`(async()=>{const {createFeatherScene}=await import('/src/viewer/featherScene.js');const host=document.createElement('div');document.body.append(host);const scene=createFeatherScene(host);scene.activate();scene.dispose();scene.dispose();host.remove()})()`);
  assert.equal(await b.evaluate(`document.querySelectorAll('.viewer-feather').length`), 1);
  await select(scene10); await b.delay(800);
  assert.deepEqual(b.errors, []);
  report.push('All nine earlier scenes and remotely added scene11 round-trip; camera restored; inactive cleanup; double dispose; zero browser errors');
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: report }, null, 2));
  console.log(report.join('\n'));
} finally { b.close(); }
