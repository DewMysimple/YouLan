import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide output directory and isolated CDP_URL / VIEWER_URL.');
await mkdir(output, { recursive: true });
const b = await browserHarness(output), report = {};
const panel = ['场景8·纵深花廊'];
const choose = label => b.set(['场景选择'], '当前场景', label);
const move = (x, y, type = 'mouseMoved', extra = {}) => b.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
try {
  await b.open({ dream: true });
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.set(['梦境背景与迎光'], '背景流动', false);
  await b.delay(500);
  const original = await b.evaluate('__camera.position.toArray()');
  await choose('场景8·纵深花廊');
  await b.until(`document.querySelector('.viewer-gallery-status')?.textContent.includes('1 / 5')`);
  await b.evaluate(`window.g8=__observed.findLast(o=>o.name==='场景8·纵深花廊'); window.c8=null; window.frames8=0;
    g8.onBeforeRender=(renderer,scene,camera)=>{ c8=camera; frames8++; };
    window.bg8=g8.getObjectByName('纵深花廊·氛围背景');
    window.images8=g8.children.filter(o=>o.material?.map);
    folder(['场景8·纵深花廊']).classList.remove('closed');`);
  await b.until('!!c8');
  report.isolation = await b.evaluate(`({canvas:document.querySelectorAll('canvas').length===1,
    fiveImages:images8.length===5, independentCamera:c8!==__camera, noEnvironment:g8.environment===null,
    worldHidden:['HDRI 环境设置','梦境背景与迎光','指针视差'].every(s=>getComputedStyle(folder([s])).display==='none')})`);
  assert.ok(Object.values(report.isolation).every(Boolean));
  await b.screenshot('01-gallery-panel.png');
  await b.set(panel, '氛围动画', false);
  await b.evaluate(`document.querySelector('.lil-gui.root').style.visibility='hidden'`);
  for (let i = 0; i < 5; i++) {
    await b.set(panel, '穿行进度', i / 4); await b.delay(3000);
    await b.screenshot(`0${i + 2}-flower-${i + 1}.png`);
    const visible = await b.evaluate('images8.filter(o=>o.visible).map(o=>o.name)');
    assert.equal(visible.length, 1);
  }
  await b.set(panel, '穿行进度', .375); await b.delay(2800);
  assert.equal(await b.evaluate('images8.filter(o=>o.visible).length'), 2);
  await b.screenshot('07-transition.png');
  const idle = await b.evaluate('frames8'); await b.delay(300);
  assert.equal(await b.evaluate('frames8'), idle);
  await move(400, 300); await b.delay(1700);
  const x = await b.evaluate('images8[1].position.x');
  await move(900, 600); await b.delay(1700);
  assert.ok(await b.evaluate('images8[1].position.x') > x);
  await b.click(panel, '回到第一幅'); await b.delay(300);
  const z = await b.evaluate('c8.position.z');
  await move(600, 400, 'mouseWheel', { deltaY: 200, deltaX: 0 }); await b.delay(2000);
  assert.ok(await b.evaluate('c8.position.z') < z);
  await move(600, 400, 'mousePressed', { button: 'left', buttons: 1, clickCount: 1 });
  await move(600, 150, 'mouseMoved', { button: 'left', buttons: 1 });
  await move(600, 150, 'mouseReleased', { button: 'left', buttons: 0, clickCount: 1 });
  await b.delay(1800);
  assert.deepEqual(await b.evaluate('__camera.position.toArray()'), original);
  report.interaction = 'five images, crossfade, pointer parallax, wheel and drag, independent shared camera, idle stops';
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.set(panel, '氛围动画', true); await b.delay(300);
  const frozen = await b.evaluate('bg8.material.uniforms.uTime.value');
  await b.set(panel, '穿行进度', .75); await b.delay(250);
  assert.equal(await b.evaluate('bg8.material.uniforms.uTime.value'), frozen);
  assert.equal(await b.evaluate('images8.filter(o=>o.visible).length'), 1);
  assert.equal(await b.evaluate(`g8.getObjectByName('纵深花廊·光带微粒').visible`), false);
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await b.set(panel, '氛围动画', false);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await b.click(panel, '回到第一幅'); await b.delay(300);
  await b.screenshot('08-portrait.png');
  await b.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:180,y:600}]});
  await b.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:180,y:250}]});
  await b.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  await b.delay(1800); assert.ok(await b.evaluate('c8.position.z') < 5);
  report.responsive = '390x844 DPR2 and real touch navigation';
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const memory = await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  const labels = ['场景1·标本纵深','场景2·花粉星云','场景3·指尖花火','场景4·无限花开','场景5·纸飞机环游','场景6·蝶翼','场景7·斑驳光影'];
  for (const label of labels) {
    await choose(label); await b.delay(200); const frames=await b.evaluate('frames8');
    await b.delay(150); assert.equal(await b.evaluate('frames8'),frames);
    await choose('场景8·纵深花廊'); await b.delay(200);
  }
  const warmMemory = await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  for (let i = 0; i < 3; i++) { await choose('场景7·斑驳光影'); await choose('场景8·纵深花廊'); await b.delay(120); }
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),warmMemory);
  report.memory = { initial: memory, warmed: warmMemory, repeatedSwitchStable: true };
  await choose('场景1·标本纵深'); await b.delay(300);
  const returned = await b.evaluate('__camera.position.toArray()');
  assert.ok(returned.every((v,i)=>Math.abs(v-original[i])<1e-7));
  await move(600,400,'mousePressed',{button:'left',buttons:1,clickCount:1});
  await move(750,450,'mouseMoved',{button:'left',buttons:1});
  await move(750,450,'mouseReleased',{button:'left',buttons:0,clickCount:1});
  assert.notDeepEqual(await b.evaluate('__camera.position.toArray()'),returned);
  report.orbitRestored = true;
  assert.deepEqual(b.errors, []);
  report.errors = b.errors;
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { b.close(); }
