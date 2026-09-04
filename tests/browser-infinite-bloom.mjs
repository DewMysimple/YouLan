import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide output directory');
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
const selector = ['场景选择'];
const flowerFolder = ['场景4·无限花开'];
const report = {};

try {
  await b.open({ dream: true });
  await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  const specimenCamera = await b.evaluate('__camera.position.toArray()');
  await b.set(selector, '当前场景', '场景4·无限花开');
  await b.until(`__observed.some(object => object.isScene && object.name === '场景4·无限花开' && object.userData.infiniteBloom?.ready)`);
  await b.evaluate(`
    window.scene4 = __observed.findLast(object => object.isScene && object.name === '场景4·无限花开');
    window.flowerBatch = scene4.userData.infiniteBloom.instancedBloom;
    window.scene4Renders = 0;
    scene4.onAfterRender = () => scene4Renders++;
  `);
  report.isolation = await b.evaluate(`({
    scene1Visible: scene.visible,
    scene4Visible: scene4.visible,
    specimenInScene4: !!scene4.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS'),
    flowerInScene1: !!scene.getObjectByName('场景4·GPU实例花冠'),
    sameEnvironment: scene.environment === scene4.environment,
    ownBackground: !!scene4.getObjectByName('场景4·独立深夜花园'),
  })`);
  assert.deepEqual(report.isolation, {
    scene1Visible: false,
    scene4Visible: true,
    specimenInScene4: false,
    flowerInScene1: false,
    sameEnvironment: true,
    ownBackground: true,
  });
  report.asset = await b.evaluate(`({
    count: flowerBatch.count,
    drawCalls: __renderer.info.render.calls,
    morphTexture: !!flowerBatch.morphTexture,
    vertexCount: flowerBatch.geometry.attributes.position.count,
    morphTargets: flowerBatch.geometry.morphAttributes.position.length,
    mapColorSpace: flowerBatch.material.map.colorSpace,
    branch: !!scene4.getObjectByName('场景4·真实枝叶与花蕊'),
    folderVisible: getComputedStyle(folder(['场景4·无限花开'])).display !== 'none',
  })`);
  assert.equal(report.asset.count, 8);
  assert.equal(report.asset.morphTexture, true);
  assert.ok(report.asset.vertexCount > 7500);
  assert.equal(report.asset.morphTargets, 1);
  assert.equal(report.asset.branch, true);
  assert.equal(report.asset.folderVisible, true);

  await b.set(flowerFolder, '播放绽放', false);
  await b.set(flowerFolder, '背景缓慢流动', false);
  await b.set(flowerFolder, '叠加花冠代数', 1);
  await b.set(flowerFolder, '周期预览', .43);
  await b.delay(180);
  await b.screenshot('00-source-single-flower.png');
  await b.set(flowerFolder, '叠加花冠代数', 8);
  const samples = [
    ['01-flower-bud.png', 0],
    ['02-flower-opening.png', .17],
    ['03-flower-full.png', .43],
    ['04-flower-generations.png', .74],
  ];
  report.phasePixels = {};
  for (const [name, timeline] of samples) {
    await b.set(flowerFolder, '周期预览', timeline);
    await b.delay(180);
    report.phasePixels[name] = await b.screenshot(name, [[20, 20], [720, 480], [590, 460]]);
  }
  const luminance = ([red, green, blue]) => red * .2126 + green * .7152 + blue * .0722;
  assert.ok(luminance(report.phasePixels['03-flower-full.png'][0]) < 70, 'garden remains dark');
  assert.ok(luminance(report.phasePixels['03-flower-full.png'][1]) > 20, 'flower remains visible');

  const idleRenders = await b.evaluate('scene4Renders');
  await b.delay(450);
  assert.equal(await b.evaluate('scene4Renders'), idleRenders, 'paused scene4 returns to on-demand rendering');

  await b.set(flowerFolder, '叠加花冠代数', 12);
  assert.equal(await b.evaluate('flowerBatch.count'), 12);
  await b.set(flowerFolder, '花瓣粗糙度', .34);
  assert.ok(Math.abs(await b.evaluate('flowerBatch.material.roughness') - .34) < 1e-8);
  await b.set(flowerFolder, '次表面透光强度', .62);
  await b.set(flowerFolder, '显示原始枝叶', false);
  assert.equal(await b.evaluate(`scene4.getObjectByName('场景4·真实枝叶与花蕊').visible`), false);

  const scene4Camera = await b.evaluate('__camera.position.toArray()');
  await b.set(selector, '当前场景', '场景1·标本纵深');
  await b.delay(150);
  const restoredSpecimenCamera = await b.evaluate('__camera.position.toArray()');
  restoredSpecimenCamera.forEach((value, index) => assert.ok(Math.abs(value - specimenCamera[index]) < 1e-8));
  await b.set(selector, '当前场景', '场景4·无限花开');
  await b.delay(150);
  const restoredScene4Camera = await b.evaluate('__camera.position.toArray()');
  restoredScene4Camera.forEach((value, index) => assert.ok(Math.abs(value - scene4Camera[index]) < 1e-8));

  await b.evaluate(`folder(['场景4·无限花开']).classList.remove('closed');controller(['场景4·无限花开'],'HDRI 质感强度').scrollIntoView({block:'center'});`);
  await b.delay(150);
  assert.ok(await b.evaluate(`(()=>{const r=controller(['场景4·无限花开'],'HDRI 质感强度').getBoundingClientRect();return r.top>=0&&r.bottom<=1000;})()`));
  await b.screenshot('05-scene4-desktop-panel.png');
  assert.equal(b.errors.length, 0, JSON.stringify(b.errors));
  report.camera = { specimenCamera, restoredSpecimenCamera, scene4Camera, restoredScene4Camera };
  report.result = 'passed';
  await writeFile(join(output, 'scene4-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await b.screenshot('scene4-failure.png');
  console.error(b.errors);
  throw error;
} finally {
  b.close();
}
