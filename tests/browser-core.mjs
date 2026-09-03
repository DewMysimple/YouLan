import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide a screenshot/report output directory.');
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
const render = ['渲染设置'], depth = ['深邃效果'], inner = ['内框插槽管理'];
const results = {};
try {
  await b.open();
  await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.set(depth, '纵深数量', 1);
  await b.delay(300);
  // At a perfectly edge-on view the middle must show an insert, not just the
  // nearly zero projected width of the two purple front/back faces.
  async function view(position, name) {
    await b.evaluate(`__camera.up.set(0,1,0); __camera.position.set(${position}); __camera.lookAt(0,0,0); __camera.updateMatrixWorld(); setControl(['渲染设置'],'曝光',1);`);
    await b.delay(250);
    return b.screenshot(name, [[720,500],[720,185],[720,815],[720,50],[720,950]]);
  }
  const angles = { right:'16,0,0', left:'-16,0,0', top:'0,16,0.001', bottom:'0,-16,0.001', oblique:'14,4,4', front:'0,0,16', back:'0,0,-16' };
  for (const [name,position] of Object.entries(angles)) {
    await b.set(render,'内嵌色体透射',false);
    const before = await view(position,`${name}-before.png`);
    await b.set(render,'内嵌色体透射',true);
    const after = await view(position,`${name}-after.png`);
    results[name] = {before,after};
  }
  console.log(JSON.stringify(results));
  for (const name of ['right','left','top','bottom']) {
    const {before,after} = results[name];
    assert.ok(after[0][1] < before[0][1] - 20, `${name}: violet core is visible edge-on`);
    assert.ok(after[0][2] > after[0][1] + 30, `${name}: original violet hue`);
  }
  assert.deepEqual(results.front.before,results.front.after, 'front pixels unchanged');
  assert.deepEqual(results.back.before,results.back.after, 'back pixels unchanged');
  for (const name of ['right','left']) for (const i of [3,4]) {
    assert.deepEqual(results[name].before[i],results[name].after[i], 'transparent end margins stay clear');
  }
  await view(angles.right, null);
  await b.set(inner,'不透明度',0);
  await b.delay(200);
  const invisible = await b.screenshot('invisible-core.png', [[720,500]]);
  assert.deepEqual(invisible[0],results.right.before[0], 'hidden inner material leaves no ghost core');
  await b.set(inner,'不透明度',1);
  await b.set(inner,'颜色','#ffffff');
  await b.delay(200);
  const neutral = await b.screenshot(null, [[720,500]]);
  assert.deepEqual(neutral[0],results.right.before[0], 'core reads actual slot color, not a fixed purple');
  await b.set(inner,'颜色','#d1aaff');
  await b.set(inner,'透射率',0);
  await b.delay(200);
  results.opaque = await b.screenshot('opaque-core.png', [[720,500]]);
  assert.ok(results.opaque[0][2] > results.opaque[0][1] + 15, 'opaque endpoint does not erase the insert');
  await b.set(inner,'透射率',1);
  await b.click(['HDRI 环境设置'],'清除贴图');
  await b.delay(200);
  results.white = await b.screenshot('white-side.png', [[720,500],[10,10]]);
  assert.deepEqual(results.white[1],[255,255,255,255]);
  assert.ok(results.white[0][2] > results.white[0][1] + 30);
  await b.click(['HDRI 环境设置'],'使用内置 HDRI');
  await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.set(['HDRI 环境设置'],'显示贴图背景',false);
  await b.delay(200);
  results.hiddenHDRI = await b.screenshot('hidden-hdri-side.png', [[720,500]]);
  assert.ok(results.hiddenHDRI[0][2] > results.hiddenHDRI[0][1] + 30);
  await b.click(depth,'纯透射对照');
  assert.equal(await b.evaluate(`controller(['渲染设置'],'内嵌色体透射').querySelector('input').checked`),false);
  await b.click(depth,'恢复调好的默认效果');
  await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.set(depth,'纵深数量',100);
  await b.set(depth,'纵深间距',10);
  const arrayFirst = await view('16,0,0','100-side.png');
  await b.evaluate(`__camera.position.set(16,0,-530); __camera.lookAt(0,0,-530); __camera.updateMatrixWorld();setControl(['渲染设置'],'曝光',1);`);
  await b.delay(250);
  const arrayLater = await b.screenshot('100-copy54-side.png', [[720,500]]);
  assert.deepEqual(arrayLater[0],arrayFirst[0], 'translated copies use their own inner volume');
  assert.equal(await b.evaluate('mesh.geometry.attributes.corePosition.count'),4000);
  assert.equal(await b.evaluate('mesh.geometry.index.count'),8400);
  const memory = await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  for(let cycle=0;cycle<6;cycle++) {
    await b.set(render,'内嵌色体透射',false); await b.delay(50);
    await b.set(render,'内嵌色体透射',true); await b.delay(50);
  }
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),memory);
  const idle = await b.evaluate('__renderCount'); await b.delay(500);
  assert.equal(await b.evaluate('__renderCount'),idle);
  await b.click(depth,'恢复调好的默认效果');
  await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.delay(300);
  await b.screenshot('delivery-front.png');
  await view('16,2,2','delivery-side.png');
  assert.equal(b.errors.length,0,JSON.stringify(b.errors));
  await writeFile(join(output,'core-report.json'),JSON.stringify({results,memory,errors:b.errors},null,2));
} catch(error) {
  await b.screenshot('core-failure.png'); console.error(b.errors); throw error;
} finally { b.close(); }
