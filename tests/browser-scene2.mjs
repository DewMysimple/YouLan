import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide output directory');
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
const selector = ['场景选择'];
const pollenFolder = ['场景2·花粉星云'];
const atmosphere = ['梦境背景与迎光'];
const report = {};

try {
  await b.open({ dream: true });
  await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  await b.set(atmosphere, '背景流动', false);
  await b.delay(250);
  const specimenCamera = await b.evaluate('__camera.position.toArray()');
  assert.equal(await b.evaluate(`controller(${JSON.stringify(selector)},'当前场景').querySelector('select').value`), '场景1·标本纵深');
  assert.equal(await b.evaluate(`getComputedStyle(folder(${JSON.stringify(pollenFolder)})).display`), 'none');

  await b.set(selector, '当前场景', '场景2·花粉星云');
  await b.until(`__observed.some(object => object.isScene && object.name === '场景2·花粉星云')`);
  await b.evaluate(`
    window.scene2 = __observed.findLast(object => object.isScene && object.name === '场景2·花粉星云');
    window.pollenRoot = scene2.getObjectByName('场景2·幽兰花粉星云');
    window.scene2Renders = 0;
    scene2.onAfterRender = () => scene2Renders++;
  `);
  report.isolation = await b.evaluate(`({
    scene1Visible: scene.visible,
    scene2Visible: scene2.visible,
    specimenInScene2: !!scene2.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS'),
    pollenInScene1: !!scene.getObjectByName('场景2·幽兰花粉星云'),
    sameEnvironment: scene.environment === scene2.environment,
    sharedBackdrop: !!scene2.getObjectByName('流动混色天空（共享背景）'),
    staleCounts: scene2.getObjectByName('流动混色天空（共享背景）').material.uniforms.dreamHasCounts.value,
  })`);
  assert.deepEqual(report.isolation, {
    scene1Visible: false,
    scene2Visible: true,
    specimenInScene2: false,
    pollenInScene1: false,
    sameEnvironment: true,
    sharedBackdrop: true,
    staleCounts: false,
  });
  report.layers = await b.evaluate(`({
    points: pollenRoot.children.filter(child => child.isPoints).map(child => ({name: child.name, count: child.geometry.drawRange.count, maximum: child.geometry.attributes.position.count})),
    core: !!pollenRoot.getObjectByName('中央能量核心'),
    scene1FoldersHidden: ['深邃效果','外框插槽管理','内框插槽管理','渲染设置'].every(title => getComputedStyle(folder([title])).display === 'none'),
    scene2FolderVisible: getComputedStyle(folder(['场景2·花粉星云'])).display !== 'none',
  })`);
  assert.deepEqual(report.layers.points.map((entry) => entry.name), ['远层微尘', '中层花粉', '近层幽兰花瓣']);
  assert.deepEqual(report.layers.points.map((entry) => entry.count), [2200, 620, 120]);
  assert.deepEqual(report.layers.points.map((entry) => entry.maximum), [4000, 1200, 300]);
  assert.equal(report.layers.core, true);
  assert.equal(report.layers.scene1FoldersHidden, true);
  assert.equal(report.layers.scene2FolderVisible, true);
  await b.screenshot('01-scene2-default.png');

  await b.set(atmosphere, '背景流动', true);
  const time = await b.evaluate(`pollenRoot.children.find(child => child.isPoints).material.uniforms.pollenTime.value`);
  await b.delay(700);
  assert.ok(await b.evaluate(`pollenRoot.children.find(child => child.isPoints).material.uniforms.pollenTime.value`) > time);
  await b.set(pollenFolder, '远层微尘数量', 32);
  await b.set(pollenFolder, '中层花粉数量', 48);
  await b.set(pollenFolder, '近层花瓣数量', 16);
  assert.deepEqual(await b.evaluate(`pollenRoot.children.filter(child => child.isPoints).map(child => child.geometry.drawRange.count)`), [32, 48, 16]);
  await b.screenshot('02-scene2-adjusted.png');

  await b.set(pollenFolder, '粒子流动', false);
  await b.set(atmosphere, '背景流动', false);
  await b.delay(350);
  const idleRenders = await b.evaluate('scene2Renders');
  await b.delay(450);
  assert.equal(await b.evaluate('scene2Renders'), idleRenders, 'paused scene2 returns to on-demand rendering');

  const scene2Camera = await b.evaluate('__camera.position.toArray()');
  assert.notDeepEqual(scene2Camera, specimenCamera);
  await b.set(selector, '当前场景', '场景1·标本纵深');
  await b.delay(250);
  const restoredSpecimenCamera = await b.evaluate('__camera.position.toArray()');
  restoredSpecimenCamera.forEach((value, index) => assert.ok(Math.abs(value - specimenCamera[index]) < 1e-8));
  assert.equal(await b.evaluate('scene.visible'), true);
  assert.equal(await b.evaluate('scene2.visible'), false);
  assert.equal(await b.evaluate(`getComputedStyle(folder(${JSON.stringify(pollenFolder)})).display`), 'none');
  assert.equal(await b.evaluate(`getComputedStyle(folder(['深邃效果'])).display`), 'block');
  await b.screenshot('03-scene1-restored.png');

  await b.set(selector, '当前场景', '场景2·花粉星云');
  await b.delay(250);
  const restoredScene2Camera = await b.evaluate('__camera.position.toArray()');
  restoredScene2Camera.forEach((value, index) => assert.ok(Math.abs(value - scene2Camera[index]) < 1e-8));
  const resources = await b.evaluate('({...__renderer.info.memory, programs: __renderer.info.programs.length})');
  for (let index = 0; index < 6; index++) {
    await b.set(selector, '当前场景', '场景1·标本纵深');
    await b.delay(60);
    await b.set(selector, '当前场景', '场景2·花粉星云');
    await b.delay(60);
  }
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory, programs: __renderer.info.programs.length})'), resources);
  report.resources = resources;

  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await b.evaluate(`folder(['场景2·花粉星云']).classList.remove('closed');controller(['场景2·花粉星云'],'能量核心大小').scrollIntoView({block:'center'});`);
  await b.delay(150);
  assert.ok(await b.evaluate(`(()=>{const r=controller(['场景2·花粉星云'],'能量核心大小').getBoundingClientRect();return r.top>=0&&r.bottom<=844;})()`));
  await b.screenshot('04-scene2-mobile-panel.png');
  assert.equal(b.errors.length, 0, JSON.stringify(b.errors));
  report.camera = { specimenCamera, restoredSpecimenCamera, scene2Camera, restoredScene2Camera };
  report.result = 'passed';
  await writeFile(join(output, 'scene2-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await b.screenshot('scene2-failure.png');
  console.error(b.errors);
  throw error;
} finally {
  b.close();
}
