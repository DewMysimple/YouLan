import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide output directory');
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
const selector = ['场景选择'];
const fireworkFolder = ['场景3·金菊闪柳烟花'];
const report = {};

try {
  await b.open({ dream: true });
  await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  const specimenCamera = await b.evaluate('__camera.position.toArray()');
  await b.set(selector, '当前场景', '场景3·金菊闪柳烟花');
  await b.until(`__observed.some(object => object.isScene && object.name === '场景3·金菊闪柳烟花')`);
  await b.evaluate(`
    window.scene3 = __observed.findLast(object => object.isScene && object.name === '场景3·金菊闪柳烟花');
    window.fireworkRoot = scene3.getObjectByName('场景3·金菊闪柳烟花主体');
    window.scene3Renders = 0;
    scene3.onAfterRender = () => scene3Renders++;
  `);
  report.isolation = await b.evaluate(`({
    scene1Visible: scene.visible,
    scene3Visible: scene3.visible,
    specimenInScene3: !!scene3.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS'),
    fireworkInScene1: !!scene.getObjectByName('场景3·金菊闪柳烟花主体'),
    sameEnvironment: scene.environment === scene3.environment,
    ownBackground: !!scene3.getObjectByName('场景3独立夜空背景'),
  })`);
  assert.deepEqual(report.isolation, {
    scene1Visible: false,
    scene3Visible: true,
    specimenInScene3: false,
    fireworkInScene1: false,
    sameEnvironment: true,
    ownBackground: true,
  });
  report.batches = await b.evaluate(`({
    points: fireworkRoot.children.filter(child => child.isPoints).map(child => ({
      name: child.name,
      allocated: child.geometry.attributes.position.count,
      visible: child.geometry.drawRange.count,
    })),
    flash: !!fireworkRoot.getObjectByName('爆心闪光与青绿烟晕'),
    continuousTrails: fireworkRoot.getObjectByName('金菊柳尾连续线')?.geometry.attributes.position.count,
    scene1FoldersHidden: ['深邃效果','外框插槽管理','内框插槽管理','渲染设置'].every(title => getComputedStyle(folder([title])).display === 'none'),
    scene3FolderVisible: getComputedStyle(folder(['场景3·金菊闪柳烟花'])).display !== 'none',
  })`);
  assert.deepEqual(report.batches.points.map(({ name }) => name), ['上升火箭尾迹', '金菊放射主枝', '冷绿白闪烁簇']);
  assert.deepEqual(report.batches.points.map(({ allocated }) => allocated), [192, 5760, 10000]);
  assert.equal(report.batches.points[2].visible, 9200);
  assert.equal(report.batches.flash, true);
  assert.equal(report.batches.continuousTrails, 11376);
  assert.equal(report.batches.scene1FoldersHidden, true);
  assert.equal(report.batches.scene3FolderVisible, true);

  await b.set(fireworkFolder, '播放动画', false);
  await b.set(fireworkFolder, '夜空缓慢流动', false);
  const samples = [
    ['01-launch.png', 2.8],
    ['02-initial-burst.png', 4.15],
    ['03-full-chrysanthemum.png', 5.8],
    ['04-flashing-willow.png', 7.2],
    ['05-falling-embers.png', 9.0],
  ];
  report.phasePixels = {};
  for (const [name, time] of samples) {
    await b.set(fireworkFolder, '时间预览（秒）', time);
    await b.delay(160);
    report.phasePixels[name] = await b.screenshot(name, [[20, 20], [720, 500]]);
  }
  const luminance = ([red, green, blue]) => red * .2126 + green * .7152 + blue * .0722;
  for (const pixels of Object.values(report.phasePixels)) {
    assert.ok(luminance(pixels[0]) < 32, 'scene3 background must not become an all-white post-processing frame');
  }
  assert.ok(luminance(report.phasePixels['02-initial-burst.png'][1]) > 72, 'initial burst must remain visibly luminous');

  const idleRenders = await b.evaluate('scene3Renders');
  await b.delay(450);
  assert.equal(await b.evaluate('scene3Renders'), idleRenders, 'paused scene3 returns to on-demand rendering');

  await b.set(fireworkFolder, '性能档位', '省电');
  assert.equal(await b.evaluate(`fireworkRoot.getObjectByName('冷绿白闪烁簇').geometry.drawRange.count`), 4232);
  await b.set(fireworkFolder, '金菊主枝数量', 24);
  assert.equal(await b.evaluate(`fireworkRoot.getObjectByName('金菊放射主枝').material.uniforms.fireworkBranches.value`), 24);

  const scene3Camera = await b.evaluate('__camera.position.toArray()');
  await b.set(selector, '当前场景', '场景1·标本纵深');
  await b.delay(180);
  const restoredSpecimenCamera = await b.evaluate('__camera.position.toArray()');
  restoredSpecimenCamera.forEach((value, index) => assert.ok(Math.abs(value - specimenCamera[index]) < 1e-8));
  await b.set(selector, '当前场景', '场景3·金菊闪柳烟花');
  await b.delay(180);
  const restoredScene3Camera = await b.evaluate('__camera.position.toArray()');
  restoredScene3Camera.forEach((value, index) => assert.ok(Math.abs(value - scene3Camera[index]) < 1e-8));

  // Warm every scene once before taking the stability baseline because Three.js
  // compiles scene-specific programs lazily on first render.
  await b.set(selector, '当前场景', '场景2·花粉星云');
  await b.delay(120);
  await b.set(selector, '当前场景', '场景3·金菊闪柳烟花');
  await b.delay(120);
  const resources = await b.evaluate('({...__renderer.info.memory, programs: __renderer.info.programs.length})');
  for (let index = 0; index < 5; index++) {
    await b.set(selector, '当前场景', '场景2·花粉星云');
    await b.delay(50);
    await b.set(selector, '当前场景', '场景3·金菊闪柳烟花');
    await b.delay(50);
  }
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory, programs: __renderer.info.programs.length})'), resources);
  report.resources = resources;

  await b.evaluate(`folder(['场景3·金菊闪柳烟花']).classList.remove('closed');controller(['场景3·金菊闪柳烟花'],'性能档位').scrollIntoView({block:'center'});`);
  await b.delay(150);
  assert.ok(await b.evaluate(`(()=>{const r=controller(['场景3·金菊闪柳烟花'],'性能档位').getBoundingClientRect();return r.top>=0&&r.bottom<=1000;})()`));
  await b.screenshot('06-scene3-desktop-panel.png');
  assert.equal(b.errors.length, 0, JSON.stringify(b.errors));
  report.camera = { specimenCamera, restoredSpecimenCamera, scene3Camera, restoredScene3Camera };
  report.result = 'passed';
  await writeFile(join(output, 'scene3-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await b.screenshot('scene3-failure.png');
  console.error(b.errors);
  throw error;
} finally {
  b.close();
}
