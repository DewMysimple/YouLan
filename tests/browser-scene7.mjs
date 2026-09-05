import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide output directory; CDP_URL and VIEWER_URL select an isolated browser/server.');
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
const select = ['场景选择'];
const panel = ['场景8·斑驳光影'];
const report = {};
const move = (x, y, type = 'mouseMoved', extras = {}) => b.send('Input.dispatchMouseEvent', {type, x, y, ...extras});

try {
  await b.open({dream:true});
  await b.send('Emulation.setDeviceMetricsOverride', {width:1440,height:764,deviceScaleFactor:1,mobile:false});
  await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  await b.set(['梦境背景与迎光'], '背景流动', false);
  await b.delay(150);
  const camera = await b.evaluate(`({position:__camera.position.toArray(),quaternion:__camera.quaternion.toArray(),fov:__camera.fov})`);
  await b.set(select, '当前场景', '场景8·斑驳光影');
  await b.until(`__observed.some(s=>s.name==='场景8·斑驳光影')`);
  await b.evaluate(`
    window.scene7=__observed.findLast(s=>s.name==='场景8·斑驳光影');
    window.screen7=scene7.getObjectByName('场景8·二维斑驳光影');
    window.u7=screen7.material.uniforms;
    window.renders7=0;
    scene7.onAfterRender=()=>renders7++;
  `);
  report.isolation = await b.evaluate(`({
    onlyOneCanvas: document.querySelectorAll('canvas').length===1,
    onlyFlatPlane: scene7.children.length===1 && screen7.geometry.parameters.width===2,
    noEnvironment: scene7.environment===null,
    noSpecimen: !scene7.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS'),
    materialUnlit: screen7.material.toneMapped===false,
    worldPanelsHidden: ['HDRI 环境设置','梦境背景与迎光','指针视差'].every(s=>getComputedStyle(folder([s])).display==='none'),
    specimenHidden: !scene.visible,
  })`);
  assert.ok(Object.values(report.isolation).every(Boolean), JSON.stringify(report.isolation));
  const startTime = await b.evaluate('u7.uTime.value');
  await b.delay(300);
  assert.ok(await b.evaluate('u7.uTime.value') > startTime);

  await b.set(panel, '光影流动', false);
  await b.evaluate(`folder(['场景8·斑驳光影']).classList.remove('closed');`);
  await b.screenshot('01-scene7-panel.png');
  await b.evaluate(`document.querySelector('.lil-gui.root').style.visibility='hidden';`);
  await move(720,382);
  await b.delay(1500);
  await b.screenshot('02-scene7-center.png');
  const timePaused = await b.evaluate('u7.uTime.value');
  await move(300,245);
  await b.delay(200);
  const partial = await b.evaluate('u7.uPointer.value.toArray()');
  assert.ok(partial[0] > 300/1440 && partial[0] < 0.5);
  await b.delay(1500);
  const left = await b.evaluate('u7.uPointer.value.toArray()');
  assert.ok(Math.abs(left[0] - 300/1440) < 0.0002);
  assert.ok(Math.abs(left[1] - (1-245/764)) < 0.0002);
  await b.screenshot('03-scene7-left.png');
  await move(1070,285);
  await b.delay(1800);
  await b.screenshot('04-scene7-right.png');
  assert.equal(await b.evaluate('u7.uTime.value'),timePaused);
  const idle = await b.evaluate('renders7');
  await b.delay(350);
  assert.equal(await b.evaluate('renders7'),idle, 'paused and settled mode must stop rendering');

  // Real drag and wheel events must not orbit, zoom or disturb the 2D camera.
  await move(600,350,'mousePressed',{button:'left',buttons:1,clickCount:1});
  await move(850,420,'mouseMoved',{button:'left',buttons:1});
  await move(850,420,'mouseReleased',{button:'left',buttons:0,clickCount:1});
  await move(850,420,'mouseWheel',{deltaX:0,deltaY:250});
  const afterDrag = await b.evaluate(`({position:__camera.position.toArray(),quaternion:__camera.quaternion.toArray(),fov:__camera.fov})`);
  assert.deepEqual(afterDrag,camera);
  await b.evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerleave'));`);
  await b.delay(1900);
  assert.deepEqual(await b.evaluate('u7.uPointer.value.toArray()'),[0.5,0.5]);
  report.pointer = {partial,left,pausedOnDemand:true,orbitAndZoomDisabled:true,leaveRecenters:true};

  await b.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await b.set(panel,'光影流动',true);
  await b.delay(150);
  const reduced = await b.evaluate('({time:u7.uTime.value,renders:renders7})');
  await move(200,200);
  await b.delay(350);
  assert.equal(await b.evaluate('u7.uTime.value'),reduced.time);
  assert.deepEqual(await b.evaluate('u7.uPointer.value.toArray()'),[0.5,0.5]);
  const reducedIdle=await b.evaluate('renders7');
  await b.delay(250);
  assert.equal(await b.evaluate('renders7'),reducedIdle);
  await b.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await b.delay(250);
  assert.ok(await b.evaluate('u7.uTime.value') > reduced.time);
  report.reducedMotion = 'static, centered, no loop; live preference restored animation';

  // Repeated entry preserves existing worlds and does not allocate new GPU objects.
  await b.set(panel,'光影流动',false);
  const memory = await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  for (let i=0;i<3;i++) {
    await b.set(select,'当前场景','场景2·标本纵深');
    await b.delay(80);
    assert.equal(await b.evaluate('scene.visible'),true);
    await b.set(select,'当前场景','场景8·斑驳光影');
    await b.delay(80);
  }
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),memory);
  report.resources = memory;
  await b.set(select,'当前场景','场景2·标本纵深');
  await b.delay(150);
  assert.deepEqual(await b.evaluate(`({position:__camera.position.toArray(),quaternion:__camera.quaternion.toArray(),fov:__camera.fov})`),camera);
  assert.ok(await b.evaluate(`['HDRI 环境设置','梦境背景与迎光','指针视差'].every(s=>getComputedStyle(folder([s])).display!=='none')`));
  await move(500,350,'mousePressed',{button:'left',buttons:1,clickCount:1});
  await move(760,410,'mouseMoved',{button:'left',buttons:1});
  await move(760,410,'mouseReleased',{button:'left',buttons:0,clickCount:1});
  assert.notDeepEqual(await b.evaluate('__camera.position.toArray()'),camera.position,'OrbitControls is restored on returning to 3D');
  await b.set(select,'当前场景','场景8·斑驳光影');
  await b.send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:2,mobile:true});
  await b.delay(200);
  assert.ok(Math.abs(await b.evaluate('u7.uAspect.value')-390/844) < 1e-6);
  await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:240}]});
  await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240,y:320}]});
  await b.delay(1700);
  assert.ok(Math.abs((await b.evaluate('u7.uPointer.value.toArray()'))[0]-240/390)<0.001);
  await b.screenshot('05-scene7-portrait.png');
  await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  report.resizeAndTouch = 'portrait UV mapping and pointer-follow passed at DPR 2';

  // Dispose a separately mounted controller to check listener and GPU cleanup.
  report.cleanup = await b.evaluate(`(async()=>{
    const {createDappledLightScene}=await import('/src/viewer/dappledLightScene.js');
    const scratch=scene7.clone(false);scratch.clear();
    let requested=0;
    const effect=createDappledLightScene(scratch,__renderer,()=>requested++);
    effect.activate();effect.setSize(100,100);effect.update(0);effect.render();
    const before={...__renderer.info.memory};
    effect.dispose();effect.dispose();
    const after={...__renderer.info.memory};const mark=requested;
    document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove',{clientX:100,clientY:100}));
    return {geometryReleased:after.geometries===before.geometries-1,texturesReleased:after.textures===before.textures-2,listenersRemoved:requested===mark,empty:scratch.children.length===0};
  })()`);
  assert.ok(Object.values(report.cleanup).every(Boolean),JSON.stringify(report.cleanup));

  report.existingScenes = [];
  for (const [id,label] of [['pollen','场景3·花粉星云'],['firework','场景4·指尖花火'],['flower','场景5·无限花开'],['paper','场景6·纸飞机环游'],['butterfly','场景7·蝶翼']]) {
    await b.set(select,'当前场景',label);
    await b.until(`document.querySelector('.viewer-scene-status').dataset.scene===${JSON.stringify(id)}`);
    await b.delay(350);
    assert.equal(await b.evaluate('scene7.visible'),false);
    await b.set(select,'当前场景','场景8·斑驳光影');
    await b.delay(100);
    assert.equal(await b.evaluate('scene7.visible'),true);
    report.existingScenes.push(label);
  }
  assert.equal(b.errors.length,0,JSON.stringify(b.errors));
  report.result='passed';
  await writeFile(join(output,'scene7-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} catch(error) {
  await b.screenshot('scene7-failure.png');
  console.error(JSON.stringify(b.errors));
  throw error;
} finally { b.close(); }
