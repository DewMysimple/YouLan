// Vite + headless Chrome/CDP; pass a directory for screenshots/report.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { browserHarness } from './browserHarness.mjs';

const output = resolve(process.argv[2]);
const b = await browserHarness(output);
const { evaluate, set, click, screenshot, delay } = b;
const renderPath = ['渲染设置'];
const layerPath = ['阵列修改器','阵列 1'];
const offsetPath = [...layerPath,'相对偏移'];
try {
  await b.open();
  await evaluate(`window.forceTestRender = () => { setControl(['渲染设置'], '曝光', 0.99); setControl(['渲染设置'], '曝光', 1); };
    window.readCounts = async (x,y) => {
      const THREE = await import('/source/threejs-transmission/build/three.module.js');
      const pixel = new Uint16Array(4);
      __renderer.readRenderTargetPixels(__countRT, x, __countRT.height - y - 1, 1, 1, pixel);
      return Array.from(pixel, n => THREE.DataUtils.fromHalfFloat(n));
    };
    window.startCamera = __camera.position.toArray();
    window.startGeometry = Array.from(mesh.geometry.attributes.position.array);
  `);
  const colors = await evaluate('mesh.material.map(m => m.color.getHexString())');
  const materialParameters = await evaluate('mesh.material.map(m => [m.transmission,m.opacity,m.roughness,m.ior,m.thickness,m.envMapIntensity])');
  const singleOn = await screenshot('single-on.png', [[720,500],[710,300],[500,500]]);
  await set(['渲染设置'], '切片颜色累积', false); await delay(100);
  assert.deepEqual(await screenshot('single-off.png', [[720,500],[710,300],[500,500]]), singleOn);
  await set(['渲染设置'], '切片颜色累积', true);
  await click(['阵列修改器'], '新增阵列');
  await set(['阵列修改器','阵列 1','相对偏移'], 'X', 0);
  await set(['阵列修改器','阵列 1','相对偏移'], 'Z', -3);
  // Keep the original camera, so the near frame stays large and far layers shrink.
  const overlap = [];
  for (const count of [1, 2, 5, 10, 30, 100]) {
    await set(['阵列修改器','阵列 1'], '数量（含原件）', count);
    await delay(180);
    const pixels = await screenshot(`white-${count}.png`, [[720,500],[720,220],[500,500]]);
    overlap.push({ count, pixels });
    if (count > 1) assert.deepEqual((await evaluate('readCounts(720,500)')).slice(0,2), [0,count]);
  }
  for (let i = 1; i < overlap.length; i++) {
    assert.ok(overlap[i].pixels[0][0] < overlap[i-1].pixels[0][0]);
    assert.ok(overlap[i].pixels[0][1] < overlap[i-1].pixels[0][1]);
  }
  assert.ok(overlap.at(-1).pixels[1][0] > overlap.at(-1).pixels[2][0]);
  assert.ok(overlap.at(-1).pixels[2][0] > overlap.at(-1).pixels[0][0]);
  assert.deepEqual(await evaluate('mesh.material.map(m => m.color.getHexString())'), colors);
  assert.deepEqual(await evaluate('mesh.material.map(m => [m.transmission,m.opacity,m.roughness,m.ior,m.thickness,m.envMapIntensity])'), materialParameters);
  assert.equal(await evaluate(`(() => { let n=0; scene.traverse(o => { if(o.isMesh) n++; }); return n; })()`), 1);
  assert.equal(await evaluate('mesh.geometry.groups.length'), 2);
  assert.equal(await evaluate('__countScene.children[0].geometry === mesh.geometry'), true);
  // Same geometry, reversed triangle submission order: overlap counting is commutative.
  const countsBefore = await evaluate('readCounts(720,500)');
  await evaluate(`window.oldIndices = mesh.geometry.index.array.slice();
    const index = mesh.geometry.index.array;
    for (const g of mesh.geometry.groups) for (let a=g.start,b=g.start+g.count-3;a<b;a+=3,b-=3)
      for (let j=0;j<3;j++) [index[a+j],index[b+j]]=[index[b+j],index[a+j]];
    mesh.geometry.index.needsUpdate=true; forceTestRender();`);
  await delay(150);
  assert.deepEqual(await evaluate('readCounts(720,500)'), countsBefore);
  await evaluate('mesh.geometry.index.array.set(oldIndices); mesh.geometry.index.needsUpdate=true; forceTestRender();');
  await delay(100);
  const fullStrength = await screenshot(null, [[720,500]]);
  await set(renderPath, '累积强度', 0); await delay(100);
  const zeroStrength = await screenshot(null, [[720,500]]);
  await set(renderPath, '切片颜色累积', false); await delay(100);
  assert.deepEqual(await screenshot(null, [[720,500]]), zeroStrength);
  assert.ok(fullStrength[0][0] < zeroStrength[0][0]);
  await set(renderPath, '累积强度', 0.18);
  await set(renderPath, '切片颜色累积', true);
  await set(renderPath, '加深上限', 0.5); await delay(100);
  assert.ok((await screenshot(null, [[720,500]]))[0][0] > fullStrength[0][0]);
  await set(renderPath, '加深上限', 3);
  // One frame per 100-copy pile even when completely coincident, never 200 faces.
  await set(offsetPath, 'Z', 0); await delay(150);
  assert.deepEqual((await evaluate('readCounts(720,500)')).slice(0,2), [0,100]);
  await screenshot('coincident-100.png');
  await set(offsetPath, 'Z', -3); await delay(100);
  const depth = 0.42 * 3 * 99;
  await evaluate(`__camera.position.set(0,0, -${depth}-startCamera[2]); __camera.lookAt(0,0,-${depth}); forceTestRender();`);
  await delay(200);
  assert.deepEqual((await evaluate('readCounts(720,500)')).slice(0,2), [0,100]);
  const reverse = await screenshot('white-100-reverse.png', [[720,500]]);
  assert.ok(Math.abs(reverse[0][0] - fullStrength[0][0]) <= 2);
  await evaluate(' __camera.position.fromArray(startCamera); __camera.lookAt(0,0,0); forceTestRender();');
  await delay(150);
  // A row without screen overlap must not be darkened by the global copy count.
  await set(layerPath, '数量（含原件）', 5);
  await set(offsetPath, 'X', 1.2); await set(offsetPath, 'Z', 0);
  await click(['阵列修改器'], '适配全部'); await delay(150);
  const rowOn = await screenshot('row-on.png', [[450,500],[720,500],[850,500]]);
  assert.ok(rowOn[1][0] < 250);
  await set(renderPath, '切片颜色累积', false); await delay(100);
  assert.deepEqual(await screenshot('row-off.png', [[450,500],[720,500],[850,500]]), rowOn);
  await set(renderPath, '切片颜色累积', true);
  await set(offsetPath, 'X', 0); await set(offsetPath, 'Z', -3);
  await set(layerPath, '数量（含原件）', 100);
  await evaluate('__camera.position.fromArray(startCamera); __camera.lookAt(0,0,0); forceTestRender();');
  await click(['HDRI 环境设置'], '使用内置 HDRI');
  await b.until(`folder(['HDRI 环境设置']).querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await delay(300);
  const clarityOn = await screenshot('hdri-100-on.png', [[200,500],[720,500]]);
  await set(renderPath, 'HDRI 分级显色', 0); await delay(100);
  const clarityOff = await screenshot('hdri-100-clarity-zero.png', [[200,500],[720,500]]);
  assert.deepEqual(clarityOn[0], clarityOff[0]); // outside the model: same HDRI
  assert.notDeepEqual(clarityOn[1], clarityOff[1]);
  await set(['HDRI 环境设置'], '背景模糊', 0.3); await delay(100);
  await screenshot('hdri-100-background-blur.png');
  await set(['HDRI 环境设置'], '背景模糊', 0);
  await set(renderPath, 'HDRI 分级显色', 1); await delay(100);
  await screenshot('hdri-100-clarity-max.png');
  await set(renderPath, 'HDRI 分级显色', 0.75);
  await evaluate(`folder(['阵列修改器']).querySelector(':scope > .title').click(); folder(['HDRI 环境设置']).querySelector(':scope > .title').click(); folder(['渲染设置']).querySelector(':scope > .title').click();`);
  await delay(350);
  await screenshot('hdri-100-delivery.png');
  await set(['渲染设置'], '切片颜色累积', false); await delay(150);
  await screenshot('hdri-100-off.png');
  await set(['渲染设置'], '切片颜色累积', true); await delay(150);
  await set(['HDRI 环境设置'], '显示贴图背景', false); await delay(100);
  assert.equal(await evaluate('scene.background.getHexString()'), 'ffffff');
  assert.equal(await evaluate('mesh.material[1].envMap === scene.environment'), true);
  await screenshot('hdri-light-white-background.png');
  const hiddenBackground = await screenshot(null, [[720,500]]);
  await set(renderPath, 'HDRI 分级显色', 0); await delay(100);
  assert.deepEqual(await screenshot(null, [[720,500]]), hiddenBackground);
  await set(renderPath, 'HDRI 分级显色', 0.75);
  await set(['HDRI 环境设置'], '显示贴图背景', true);
  await set(['HDRI 环境设置'], '水平旋转（°）', 90);
  await set(['HDRI 环境设置'], '环境强度', 0.6);
  await set(['内框插槽管理'], '环境贴图强度', 0.5);
  assert.equal(await evaluate('mesh.material[1].envMapIntensity'), 0.3);
  await set(['HDRI 环境设置'], '水平旋转（°）', 0);
  await set(['HDRI 环境设置'], '环境强度', 1);
  await set(['内框插槽管理'], '环境贴图强度', 1);
  // An invisible inner slot contributes no additional absorption to outer glass.
  await set(['内框插槽管理'], '不透明度', 0); await delay(150);
  const hiddenInnerOn = await screenshot(null, [[720,500]]);
  await set(renderPath, '切片颜色累积', false); await delay(150);
  assert.deepEqual(await screenshot(null, [[720,500]]), hiddenInnerOn);
  await set(['内框插槽管理'], '不透明度', 1);
  await set(renderPath, '切片颜色累积', true);
  // Per-slot changes affect only their coefficient, not the other slot.
  await set(['内框插槽管理'], '颜色', '#dccbff'); await delay(100);
  assert.equal(await evaluate('mesh.material[0].color.getHexString()'), colors[0]);
  await set(['内框插槽管理'], '颜色', `#${colors[1]}`);
  await set(renderPath, '透射分辨率比例', 0.25); await delay(150);
  assert.deepEqual((await evaluate('readCounts(720,500)')).slice(0,2), [0,100]);
  await set(renderPath, '透射分辨率比例', 1);
  // Oblique view and real OrbitControls movement must refresh coverage.
  await set(layerPath, '数量（含原件）', 16);
  await evaluate('__camera.position.set(14,10,24); __camera.lookAt(0,0,-6); forceTestRender();');
  await delay(200); await screenshot('hdri-16-oblique.png');
  await b.send('Input.dispatchMouseEvent', { type:'mousePressed',x:700,y:500,button:'left',buttons:1,clickCount:1 });
  await b.send('Input.dispatchMouseEvent', { type:'mouseMoved',x:760,y:500,button:'left',buttons:1 });
  await b.send('Input.dispatchMouseEvent', { type:'mouseReleased',x:760,y:500,button:'left',buttons:0,clickCount:1 });
  await delay(150);
  const stableTextures = await evaluate('__renderer.info.memory.textures');
  for (let cycle=0; cycle<8; cycle++) {
    await set(renderPath, '切片颜色累积', false); await delay(40);
    await set(renderPath, '切片颜色累积', true); await delay(40);
  }
  assert.equal(await evaluate('__renderer.info.memory.textures'), stableTextures);
  // Fixed draw overhead: count proxy has two groups regardless of array size.
  const drawCalls = await evaluate(`(async () => {
    __countScene.updateMatrixWorld(); __renderer.info.autoReset=false; __renderer.info.reset();
    const target=__renderer.getRenderTarget(); __renderer.setRenderTarget(__countRT);
    __renderer.render(__countScene,__camera); const calls=__renderer.info.render.calls;
    __renderer.setRenderTarget(target); __renderer.info.autoReset=true; forceTestRender();
    return calls;
  })()`);
  assert.equal(drawCalls, 2);
  await delay(100);
  const idle = await evaluate('__renderCount'); await delay(350);
  assert.equal(await evaluate('__renderCount'), idle);
  // High-DPI resize aligns count pixels with the actual drawing buffer.
  await click(['阵列修改器'], '适配全部'); await delay(150);
  await b.send('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:2,mobile:true });
  await delay(250);
  assert.deepEqual(await evaluate('[__countRT.width,__countRT.height]'), [780,1688]);
  await delay(350);
  await screenshot('slices-mobile-panel.png');
  await b.send('Emulation.setDeviceMetricsOverride', { width:1440,height:1000,deviceScaleFactor:1,mobile:false });
  await click(['阵列修改器'], '重置全部'); await delay(150);
  assert.deepEqual(await evaluate('Array.from(mesh.geometry.attributes.position.array)'), await evaluate('startGeometry'));
  assert.deepEqual(await evaluate('mesh.material.map(m => m.color.getHexString())'), colors);
  assert.deepEqual(await evaluate('mesh.material.map(m => [m.transmission,m.opacity,m.roughness,m.ior,m.thickness,m.envMapIntensity])'), materialParameters);
  assert.deepEqual(b.errors, []);
  const report = { overlap, countPassDrawCalls: drawCalls, reverse, stableTextures, single:'unchanged', row:'unchanged',
    cases:'1/2/5/10/30/100, coincident, reverse, oblique, opacity, HDRI, HiDPI, mode toggles, idle, reset', errors: b.errors };
  await writeFile(join(output, 'slice-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await screenshot('slice-failure.png');
  console.error(JSON.stringify(b.errors));
  throw error;
} finally { b.close(); }
