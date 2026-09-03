import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Provide a screenshot/report output directory.');
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
try {
  await b.open();
  await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.delay(500);
  const env = ['HDRI 环境设置'], depth = ['深邃效果'];
  const capture = async (name, points = [[200,500],[720,500],[540,500],[480,500]]) => {
    await b.delay(200); return b.screenshot(name, points);
  };
  const state = await b.evaluate(`({materials:mesh.material.map(m=>({color:m.color.getHexString(),emission:m.emissiveIntensity,opacity:m.opacity,transmission:m.transmission,map:m.emissiveMap.channel})),indices:mesh.geometry.index.count,environment:document.querySelector('.viewer-panel-status').textContent})`);
  assert.deepEqual(state.materials.map(m=>m.color),['f3faff','d1aaff']);
  assert.ok(state.materials.every(m=>m.opacity===1 && m.transmission===1 && m.map===1));
  assert.equal(state.indices,84*16);
  assert.ok(state.environment.startsWith('citrus_orchard_road_puresky_4k.exr'));
  assert.equal(await b.evaluate('scene.environment.image.width'),4096);
  const initial = await capture('01-default.png');
  assert.ok(initial[1][1] < initial[2][1] && initial[2][1] < initial[3][1], 'deeper overlap is darker at the same midline');
  const preserved = await b.evaluate('({camera:__camera.position.toArray(),color:mesh.material.map(m=>m.color.getHexString()),indices:mesh.geometry.index.count,env:scene.environment.uuid})');
  await b.click(depth, '纯透射对照');
  const baseline = await capture('02-physical-baseline.png');
  assert.ok(baseline[1][1] > initial[1][1] + 10);
  assert.ok(await b.evaluate('mesh.material.every(m=>m.opacity===1 && m.emissiveIntensity===0)'));
  assert.equal(await b.evaluate(`controller(['渲染设置'],'HDRI 分级显色').querySelector('input[type=number]').value`),'0');
  await b.click(depth, '仅颜色层级对照');
  const layers = await capture('03-layers-only.png');
  assert.deepEqual(await b.evaluate('({camera:__camera.position.toArray(),color:mesh.material.map(m=>m.color.getHexString()),indices:mesh.geometry.index.count,env:scene.environment.uuid})'),preserved);
  assert.ok(layers[1][1] < baseline[1][1] - 10);
  // The linear lighting result with Bloom disabled must match the post pipeline
  // when threshold excludes every light trace. No duplicate tone mapping/emission.
  await b.click(depth, '恢复调好的默认效果');
  await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.set(depth,'光晕阈值',5);
  const highThreshold = await capture('04-no-halo.png');
  await b.set(depth,'局部 Bloom 光晕',false);
  const bypass = await capture(null);
  highThreshold.forEach((pixel,i)=>pixel.forEach((n,c)=>assert.ok(Math.abs(n-bypass[i][c])<=1, 'linear OutputPass equivalence')));
  await b.set(depth,'局部 Bloom 光晕',true);
  await b.set(depth,'光晕阈值',1);
  await b.set(depth,'光晕强度',1.2);
  const strong = await capture('05-local-halo.png',[[200,500],[465,242],[720,500]]);
  await b.set(depth,'局部 Bloom 光晕',false);
  const noHalo = await capture(null,[[200,500],[465,242],[720,500]]);
  assert.deepEqual(strong[0],noHalo[0], 'HDRI is excluded from Bloom');
  assert.ok(strong[1][1]>noHalo[1][1], 'light trace creates a halo outside its line');
  // Single mesh/two physical slots at 100 layers; later stages still change.
  await b.click(depth,'仅颜色层级对照');
  const progressive = [];
  for (const count of [1,2,5,16,30,50,80,100]) {
    await b.set(depth,'纵深数量',count);
    const pixel = (await capture(count===100?'06-hundred.png':null,[[720,500]]))[0];
    progressive.push({count,pixel});
  }
  progressive.slice(1).forEach((item,i)=>assert.ok(item.pixel[1]<progressive[i].pixel[1],`count ${item.count} still deepens`));
  assert.equal(await b.evaluate('mesh.geometry.index.count'),8400);
  assert.deepEqual(await b.evaluate('mesh.geometry.groups.map(g=>g.count)'),[7200,1200]);
  assert.equal(await b.evaluate('(()=>{let n=0;scene.traverse(o=>{if(o.isMesh)n++;});return n;})()'),1);
  assert.equal(await b.evaluate('mesh.geometry.attributes.uv1.count'),4000);
  // White fallback stays truly white even through the Bloom OutputPass.
  await b.click(depth,'恢复调好的默认效果');
  await b.click(env,'清除贴图');
  assert.deepEqual((await capture('07-white-bloom.png',[[10,10]]))[0],[255,255,255,255]);
  await b.set(['内框插槽管理'],'不透明度',0);
  const invisible = await capture(null,[[720,500]]);
  assert.deepEqual(invisible[0],[255,255,255,255]);
  await b.set(['内框插槽管理'],'不透明度',1);
  await b.click(env,'使用内置 HDRI');
  await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  const emissionState = await b.evaluate('mesh.material.map(m=>[m.emissive.getHexString(),m.emissiveIntensity])');
  await b.set(env,'显示贴图背景',false);
  await capture('08-hdri-hidden.png');
  assert.deepEqual(await b.evaluate('mesh.material.map(m=>[m.emissive.getHexString(),m.emissiveIntensity])'),emissionState);
  await b.set(env,'显示贴图背景',true);
  await b.delay(150);
  const resources = await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  for(let cycle=0;cycle<5;cycle++) {
    await b.set(depth,'局部 Bloom 光晕',false); await b.delay(70);
    await b.set(depth,'局部 Bloom 光晕',true); await b.delay(70);
  }
  await b.delay(150);
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),resources);
  const idle = await b.evaluate('__renderCount'); await b.delay(500);
  assert.equal(await b.evaluate('__renderCount'),idle);
  // Oblique/reverse + explicit fit, then restore exact default camera/settings.
  await b.evaluate(`__camera.position.set(14,9,24);__camera.lookAt(0,0,-6);setControl(['渲染设置'],'曝光',0.99);`);
  await capture('09-oblique.png');
  await b.evaluate(`__camera.position.set(0,0,-45);__camera.lookAt(0,0,-25);setControl(['渲染设置'],'曝光',1);`);
  await capture('10-reverse.png');
  await b.click(['阵列修改器'],'适配全部');
  await capture('11-fit-all.png');
  await b.click(depth,'恢复调好的默认效果');
  await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await b.click(depth,'首层正面取景');
  await b.delay(200);
  await b.evaluate(`controller(['深邃效果'],'光晕阈值').scrollIntoView({block:'center'});`);
  await capture('12-mobile.png');
  assert.deepEqual(await b.evaluate('[__countRT.width,__countRT.height]'),[780,1688]);
  assert.ok(await b.evaluate(`(()=>{const r=controller(['深邃效果'],'光晕阈值').getBoundingClientRect();return r.top>=0&&r.bottom<=844;})()`));
  await b.open();
  await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  const restored = await capture('13-delivery.png');
  assert.deepEqual(restored,initial);
  assert.equal(b.errors.length, 0, JSON.stringify(b.errors));
  const report = {state,initial,baseline,layers,progressive,resources,idle:'no continuous rendering',refresh:'exact default pixels restored',errors:b.errors};
  await writeFile(join(output,'depth-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} catch(error) {
  await b.screenshot('depth-failure.png'); console.error(b.errors); throw error;
} finally { b.close(); }
