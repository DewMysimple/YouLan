import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browserHarness } from './browserHarness.mjs';

const output = process.argv[2];
if (!output) throw Error('Provide output directory');
await mkdir(output, { recursive: true });
const b = await browserHarness(output), report = {};
const dream = ['梦境背景与迎光'], flow = [...dream, '流动混色个性化'];
const points = [[50,100],[250,200],[800,100],[100,600],[250,850],[950,850]];
const pixels = async name => { await b.delay(120); return b.screenshot(name, points); };
const changed = (a, c) => a.some((p, i) => p.slice(0,3).some((n,j) => Math.abs(n-c[i][j])>3));
try {
  await b.send('Runtime.discardConsoleEntries');
  await b.open({ dream: true });
  await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  await b.set(['指针视差'], '启用指针视差', false);
  await b.set(dream, '背景流动', false);
  await b.set(['场景选择'], '当前场景', '场景6·蝶翼');
  await b.until(`document.querySelector('.viewer-butterfly-status').dataset.kind==='ready'`);
  await b.set(['场景6·蝶翼'], '播放扇翅', false);
  await b.set(['场景6·蝶翼'], '飞行起伏', false);
  await b.evaluate(`window.bf=__observed.findLast(o=>o.name==='场景6·蝶翼');
    window.sky=bf.getObjectByName('流动混色天空（独立环境）');window.bfRenders=0;
    bf.onAfterRender=()=>bfRenders++;void 0;`);
  await b.delay(1500);
  await b.evaluate(`folder(['梦境背景与迎光']).classList.remove('closed');
    folder(${JSON.stringify(flow)}).classList.remove('closed');
    folder(['场景6·蝶翼']).classList.add('closed');void 0;`);
  await pixels('01-default-panel.png');
  // Freeze the background and isolate it from the solar glare to compare actual pixels.
  await b.set(dream, '尽头亮心强度', 0);
  const baseline = await pixels();
  await b.set(flow, '颜色1 · 底色', '#004477');
  await b.set(flow, '颜色2 · 混合色', '#43ffd1');
  await b.set(flow, '颜色3 · 覆盖色', '#2645a0');
  const custom = await pixels('02-custom-colors.png');
  assert.ok(changed(baseline, custom), 'color pickers change visible background');
  const initialMemory = await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  report.pixelChanges = [];
  for (const [label, value] of [['色块大小',2.5],['流动扭曲',2.4],['混色过渡柔和度',.15],
    ['颜色2占比偏移',.3],['颜色3覆盖强度',.1],['图案种子',23]]) {
    const before = await pixels(); await b.set(flow, label, value); const after = await pixels();
    assert.ok(changed(before, after), `${label} visibly changes the pattern`);
    report.pixelChanges.push(label);
  }
  for (const mode of ['颜色1 / 2 混合','颜色3覆盖']) {
    await b.set(flow, '混色遮罩预览', mode);
    const mask = await pixels(mode === '颜色3覆盖' ? '03-procedural-mask.png' : null);
    mask.forEach(p => assert.ok(Math.max(...p.slice(0,3))-Math.min(...p.slice(0,3))<=1,'mask preview is grayscale'));
  }
  await b.click(flow,'恢复混色默认');
  assert.deepEqual(await pixels(),baseline,'flow-only reset restores visible default exactly at frozen time');
  assert.equal(await b.evaluate(`controller(${JSON.stringify(dream)},'尽头亮心强度').querySelector('input').value`),'0');
  await b.set(dream,'尽头亮心强度',40);
  for (const [label, value] of [['放射色带强度',0],['放射色带数量',15],['色带旋转（°）',90]]) {
    await b.click(flow,'恢复混色默认');
    const before=await pixels();await b.set(flow,label,value);
    assert.ok(changed(before,await pixels()),`${label} changes sun-facing bands`);
  }
  await b.click(flow,'恢复混色默认');
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),initialMemory);
  const renders=await b.evaluate('bfRenders');await b.delay(400);
  assert.equal(await b.evaluate('bfRenders'),renders,'editing paused background returns to idle');
  for (const mode of ['HDRI / 纯白','纯黑对照']) {
    await b.set(dream,'背景模式',mode);
    assert.equal(await b.evaluate(`controller(${JSON.stringify(flow)},'色块大小').querySelector('input').disabled`),true);
  }
  await b.set(dream,'背景模式','流动混色');
  assert.equal(await b.evaluate(`controller(${JSON.stringify(flow)},'色块大小').querySelector('input').disabled`),false);
  await b.set(flow,'颜色1 · 底色','#124578');await b.set(flow,'色块大小',2.2);
  for (const target of ['场景1·标本纵深','场景2·花粉星云','场景6·蝶翼']) {
    await b.set(['场景选择'],'当前场景',target);await b.delay(250);
    const state=await b.evaluate(`(()=>{const s=__observed.findLast(o=>o.name===${JSON.stringify(target)});
      const sky=s.getObjectByName('流动混色天空（独立环境）')||s.getObjectByName('流动混色天空（共享背景）');
      return {color:sky.material.uniforms.pink.value.getHexString(),size:sky.material.uniforms.blockSize.value,
        counts:sky.material.uniforms.dreamHasCounts.value};})()`);
    assert.equal(state.color,'124578');assert.equal(state.size,2.2);
    if(target!=='场景1·标本纵深')assert.equal(state.counts,false);
  }
  report.sharedControls=true;
  await b.set(['场景选择'],'当前场景','场景1·标本纵深');
  await b.set(dream,'背景模式','纯黑对照');
  for (const slot of [['外框插槽管理'],['内框插槽管理']]) {
    await b.set(slot,'不透明度',1);await b.set(slot,'透射率',0);await b.set(slot,'写入深度（遮挡后层）',true);
  }
  const occluded=await pixels();await b.set(dream,'模型遮挡影响（场景1）',0);
  assert.ok(changed(occluded,await pixels('04-occlusion-disabled.png')),'generated model mask controls solar glare');
  await b.click(['深邃效果'],'恢复调好的默认效果');
  await b.set(['场景选择'],'当前场景','场景6·蝶翼');
  await b.set(dream,'背景流动',false);
  await b.evaluate(`folder(['梦境背景与迎光']).scrollIntoView();void 0;`);
  await pixels('05-final-panel.png');
  assert.equal(b.errors.length,0,JSON.stringify(b.errors));
  report.errors=b.errors;report.resetAndIdle=true;report.resources=initialMemory;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { b.close(); }
