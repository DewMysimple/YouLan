// Real lil-gui interactions; screenshots only alter this isolated browser session.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { browserHarness } from './browserHarness.mjs';

const output = resolve(process.argv[2]);
const b = await browserHarness(output);
const { evaluate, set, click, screenshot, delay } = b;
const outer = ['外框插槽管理'], inner = ['内框插槽管理'];
const env = ['HDRI 环境设置'], array = ['阵列修改器'];
const state = () => evaluate('mesh.material.map(m => [m.color.getHexString(),m.emissive.getHexString(),m.emissiveIntensity])');
const samples = [[720,500],[370,500],[200,500]]; // inner / outer / background
const capture = async name => { await delay(150); return screenshot(name, samples); };
try {
  await b.open({ baseline: true });
  assert.deepEqual(await state(), [['f3faff','ffffff',0],['d1aaff','ffffff',0]]);
  const physicalDefaults = await evaluate('mesh.material.map(m => [m.transmission,m.opacity,m.metalness,m.roughness,m.ior,m.thickness,m.specularIntensity,m.specularColor.getHexString()])');
  assert.deepEqual(physicalDefaults, [[1,1,0,0,1.5,0.01,1,'ffffff'],[1,1,0,0,1.5,0.01,1,'ffffff']]);
  assert.deepEqual(await evaluate('mesh.geometry.groups.map(g=>g.count)'), [72,12]);
  await evaluate(`window.basePositions=Array.from(mesh.geometry.attributes.position.array);
    window.frontCamera=__camera.position.toArray();
    window.redraw=()=>{setControl(['渲染设置'],'曝光',0.99);setControl(['渲染设置'],'曝光',1);};
    folder(['HDRI 环境设置']).querySelector(':scope > .title').click();
    folder(['阵列修改器']).querySelector(':scope > .title').click();
    folder(['外框插槽管理']).querySelector(':scope > .title').click();
    folder(['内框插槽管理']).querySelector(':scope > .title').click();`);
  await delay(350);
  const baseline = await capture('emissive-default.png');
  assert.ok(baseline[0][0] < 250 && baseline[1][0] < 250);
  // At zero intensity the selected emissive color must make no difference.
  await set(inner,'自发光颜色','#d1aaff');
  assert.deepEqual(await capture(null), baseline);
  await set(inner,'自发光颜色','#ffffff');
  const levels = [];
  for (const strength of [1,10,0]) {
    await set(inner,'自发光强度',strength);
    levels.push({ strength, pixels: await capture(`emissive-inner-${strength}.png`) });
    assert.deepEqual((await state())[0], ['f3faff','ffffff',0]);
    assert.equal((await state())[1][0], 'd1aaff');
    assert.deepEqual(levels.at(-1).pixels[1], baseline[1]);
    assert.deepEqual(levels.at(-1).pixels[2], baseline[2]);
  }
  assert.ok(levels[0].pixels[0][1] > baseline[0][1]);
  assert.ok(levels[1].pixels[0][1] > levels[0].pixels[0][1]);
  assert.deepEqual(levels[2].pixels, baseline);
  await set(inner,'自发光颜色','#d1aaff'); await set(inner,'自发光强度',0.35);
  const colored = await capture('emissive-inner-lavender.png');
  assert.notDeepEqual(colored[0], baseline[0]);
  await set(outer,'自发光强度',1);
  const outerLit = await capture('emissive-both.png');
  assert.notDeepEqual(outerLit[1], colored[1]);
  assert.deepEqual((await state())[1], ['d1aaff','d1aaff',0.35]);
  await set(outer,'自发光颜色','#fff0dd');
  const warmOuter = await capture(null);
  assert.notDeepEqual(warmOuter[1],outerLit[1]);
  assert.deepEqual((await state())[0],['f3faff','fff0dd',1]);
  assert.deepEqual((await state())[1],['d1aaff','d1aaff',0.35]);
  await set(outer,'自发光颜色','#ffffff');
  assert.deepEqual(await capture(null),outerLit);
  await set(outer,'自发光强度',10); await capture('emissive-outer-10.png');
  assert.equal((await state())[0][2],10);
  await set(outer,'自发光强度',0);
  assert.deepEqual(await capture(null), colored);
  // Environment changes must never reset or scale emission properties.
  const litState = await state();
  await click(env,'使用内置 HDRI');
  await b.until(`scene.background?.isTexture && folder(['HDRI 环境设置']).querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await capture('emissive-hdri.png');
  await set(env,'环境强度',0); await set(inner,'环境贴图强度',0.4);
  assert.deepEqual(await state(),litState);
  await set(env,'显示贴图背景',false); await capture('emissive-hdri-hidden.png');
  assert.deepEqual(await state(),litState);
  assert.equal(await evaluate('scene.background.getHexString()'),'ffffff');
  await set(env,'显示贴图背景',true);
  await set(env,'环境强度',1); await set(inner,'环境贴图强度',1);
  // New geometry viewed from front, side and back without changing source materials.
  for (const [name, position] of [['side',[14,8,20]],['back',[0,0,-24]]]) {
    await evaluate(`__camera.position.fromArray(${JSON.stringify(position)});__camera.lookAt(0,0,0);redraw();`);
    await capture(`model-${name}.png`);
  }
  await evaluate('__camera.position.fromArray(frontCamera);__camera.lookAt(0,0,0);redraw();');
  // All copies still share the same two emissive materials.
  await click(array,'新增阵列');
  await set([...array,'阵列 1','相对偏移'],'X',0);
  await set([...array,'阵列 1','相对偏移'],'Z',-3);
  await set([...array,'阵列 1'],'数量（含原件）',100);
  await capture('emissive-100.png');
  assert.equal(await evaluate('mesh.geometry.index.count'),8400);
  assert.deepEqual(await evaluate('mesh.geometry.groups.map(g=>g.count)'),[7200,1200]);
  assert.equal(await evaluate(`(()=>{let n=0;scene.traverse(o=>{if(o.isMesh)n++;});return n;})()`),1);
  await set(['渲染设置'],'切片颜色累积',false); await capture('emissive-100-no-accumulation.png');
  await set(['渲染设置'],'切片颜色累积',true);
  assert.deepEqual(await state(),litState);
  await click(array,'重置全部'); await delay(150);
  assert.deepEqual(await evaluate('Array.from(mesh.geometry.attributes.position.array)'),await evaluate('basePositions'));
  await click(env,'清除贴图');
  await set(inner,'自发光强度',0); await set(inner,'自发光颜色','#ffffff');
  assert.deepEqual(await capture(null),baseline);
  assert.deepEqual(await evaluate('mesh.material.map(m => [m.transmission,m.opacity,m.metalness,m.roughness,m.ior,m.thickness,m.specularIntensity,m.specularColor.getHexString()])'),physicalDefaults);
  const resources = await evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  for (let i=0;i<8;i++) {
    await set(inner,'自发光强度',1); await delay(30);
    await set(inner,'自发光强度',0); await delay(30);
  }
  assert.deepEqual(await evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),resources);
  const resting=await evaluate('__renderCount'); await delay(350);
  assert.equal(await evaluate('__renderCount'),resting);
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await delay(350);
  await evaluate(`controller(['内框插槽管理'],'自发光强度').scrollIntoView({block:'center'});`);
  await set(inner,'自发光强度',0.35); await capture('emissive-mobile.png');
  assert.equal((await state())[1][2],0.35);
  assert.equal(await evaluate(`(()=>{const r=controller(['内框插槽管理'],'自发光强度').getBoundingClientRect();return r.top>=0&&r.bottom<=844;})()`),true);
  // Refresh restores the delivered depth preset (not the neutral test fixture).
  await b.open();
  assert.deepEqual(await state(),[['f3faff','fff0db',0.8],['d1aaff','ffe4fa',1.8]]);
  assert.equal(await evaluate('mesh.geometry.index.count'),84*16);
  await b.until(`scene.background?.isTexture && document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  assert.deepEqual(b.errors,[]);
  const report={baseline,levels,colored,resources,slots:'independent',environments:'white/HDRI/hidden/clear',array:100,refresh:'defaults restored',errors:b.errors};
  await writeFile(join(output,'emissive-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} catch(error) {
  await screenshot('emissive-failure.png'); console.error(JSON.stringify(b.errors)); throw error;
} finally { b.close(); }
