// Run against Vite + Chrome --headless=new --remote-debugging-port=9223.
// Generate fixtures with generateEnvironmentFixtures.py first; pass their directory.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const output = resolve(process.argv[2]);
const targets = await (await fetch(process.env.CDP_URL || 'http://127.0.0.1:9223/json/list')).json();
const ws = new WebSocket(targets.find((item) => item.type === 'page').webSocketDebuggerUrl);
await new Promise((done, reject) => { ws.onopen = done; ws.onerror = reject; });
let sequence = 0;
const pending = new Map();
const errors = [];
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const task = pending.get(message.id);
    if (!task) return;
    clearTimeout(task.timer); pending.delete(message.id);
    message.error ? task.reject(message.error) : task.done(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
};
function send(method, params = {}) {
  return new Promise((done, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { done, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error(`Timed out: ${expression}\n${JSON.stringify(errors)}`);
}
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(output, name), Buffer.from(data, 'base64'));
}
const click = (path, label) => evaluate(`button(${JSON.stringify(path)}, ${JSON.stringify(label)}).click()`);
const set = (path, label, value) => evaluate(`setControl(${JSON.stringify(path)}, ${JSON.stringify(label)}, ${JSON.stringify(value)})`);
async function selectFile(path) {
  const { root } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await send('DOM.setFileInputFiles', { nodeId, files: [path] });
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__observed = []; window.__renderCount = 0;
    window.__THREE_DEVTOOLS__ = { dispatchEvent(event) {
      if (event.type !== 'observe') return;
      __observed.push(event.detail);
      if (event.detail.isScene) event.detail.onBeforeRender = (renderer, scene, camera) => {
        if (!scene.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS')) return;
        __renderCount++; window.__camera = camera; window.__renderer = renderer;
      };
    }};
  ` });
  await send('Page.navigate', { url: process.env.VIEWER_URL || 'http://127.0.0.1:5173/' });
  await until(`document.querySelectorAll('.lil-gui.root').length === 1 && document.querySelectorAll('.viewer-panel-status').length === 3 && __observed.some(o => o.isScene && o.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS'))`);
  await evaluate(`
    window.scene = __observed.findLast(o => o.isScene && o.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS'));
    window.mesh = scene.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS');
    window.folder = (path) => {
      let root = document.querySelector('.lil-gui.root');
      for (const title of path) root = Array.from(root.querySelectorAll('.lil-gui')).find(el => el.querySelector(':scope > .title')?.textContent === title);
      return root;
    };
    window.controller = (path, label) => Array.from(folder(path).querySelectorAll(':scope > .children > .controller')).find(el => el.querySelector('.name')?.textContent === label);
    window.button = (path, label) => controller(path, label).querySelector('button');
    window.setControl = (path, label, value) => {
      const control = controller(path, label);
      const input = control.querySelector(typeof value === 'boolean' ? 'input[type=checkbox]' : typeof value === 'string' && value.startsWith('#') ? 'input[type=color]' : 'input[type=number]');
      if (typeof value === 'boolean') { if (input.checked !== value) input.click(); }
      else { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    window.envStatus = () => folder(['HDRI 环境设置']).querySelector('.viewer-panel-status').textContent;
    window.depthStatus = () => folder(['深邃效果']).querySelector('.viewer-panel-status').textContent;
  `);
  await delay(300);
  await click(['深邃效果'], '纯透射对照');
  await set(['深邃效果'], '纵深数量', 1);
  await click(['HDRI 环境设置'], '清除贴图');
  await delay(200);
  assert.equal(await evaluate(`scene.background.getHexString()`), 'ffffff');
  assert.equal(await evaluate(`mesh.geometry.index.count`), 84);
  assert.equal(await evaluate(`mesh.material[0] !== mesh.material[1]`), true);
  assert.deepEqual(await evaluate('mesh.material.map(m => m.color.getHexString())'), ['f3faff', 'd1aaff']);
  assert.deepEqual(await evaluate('mesh.material.map(m => [m.transmission, m.opacity, m.roughness, m.ior, m.thickness])'), [[1,1,0.05,1.35,0.2],[1,1,0.05,1.35,0.2]]);
  await screenshot('white-default.png');
  await set(['渲染设置'], '曝光', 0.2);
  assert.deepEqual(await evaluate(`(() => { __renderer.render(scene, __camera); const gl = __renderer.getContext(); const pixel = new Uint8Array(4); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel); return Array.from(pixel); })()`), [255, 255, 255, 255]);
  await set(['渲染设置'], '曝光', 1);
  await delay(100);
  const initialGeometry = await evaluate(`Array.from(mesh.geometry.attributes.position.array)`);
  const idle = await evaluate('__renderCount'); await delay(400); assert.equal(await evaluate('__renderCount'), idle);
  await set(['HDRI 环境设置'], '环境强度', 2);
  await set(['外框插槽管理'], '环境贴图强度', 0.4);
  assert.deepEqual(await evaluate('mesh.material.map(m => m.envMapIntensity)'), [0.8, 2]);
  // Actual native file selection: all four formats, plus gainmap JPEG.
  const formats = [];
  for (const extension of ['hdr', 'exr', 'png', 'jpg']) {
    await selectFile(join(output, `panorama.${extension}`));
    await until(`envStatus().includes('panorama.${extension}') && envStatus().includes('加载完成')`);
    formats.push(await evaluate(`({name: envStatus(), width: scene.environment.image.width, height: scene.environment.image.height, flipY: scene.environment.flipY})`));
    assert.equal(formats.at(-1).width, 64); assert.equal(formats.at(-1).height, 32);
  }
  assert.equal(formats[1].flipY, false);
  await selectFile(resolve('source/threejs-transmission/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg'));
  await until(`envStatus().includes('royal_esplanade') && envStatus().includes('加载完成')`);
  assert.equal(await evaluate('scene.background === scene.environment'), true);
  await set(['HDRI 环境设置'], '水平旋转（°）', 90);
  assert.deepEqual(await evaluate('mesh.material.map(m => m.envMapRotation.y)'), [Math.PI / 2, Math.PI / 2]);
  await set(['HDRI 环境设置'], '背景模糊', 0.4);
  await set(['HDRI 环境设置'], '背景亮度', 0.7);
  await set(['HDRI 环境设置'], '显示贴图背景', false);
  assert.equal(await evaluate('scene.background.getHexString()'), 'ffffff');
  assert.equal(await evaluate('mesh.material[0].envMap === scene.environment'), true);
  // Damaged selected image is a panel error, not a scene failure.
  await writeFile(join(output, 'invalid.hdr'), Buffer.from('invalid test fixture'));
  const imageId = await evaluate('scene.environment.uuid');
  await selectFile(join(output, 'invalid.hdr'));
  await until(`envStatus().includes('加载失败')`);
  assert.equal(await evaluate('scene.environment.uuid'), imageId);
  assert.equal(await evaluate('!!document.querySelector(".error-message")'), false);
  await click(['HDRI 环境设置'], '使用内置 HDRI');
  await click(['HDRI 环境设置'], '清除贴图');
  await delay(400);
  assert.equal(await evaluate('scene.background.getHexString()'), 'ffffff');
  assert.ok((await evaluate('envStatus()')).includes('无贴图'));
  await click(['HDRI 环境设置'], '使用内置 HDRI');
  await until(`envStatus().includes('加载完成')`);
  // Repeated replacement must not accumulate GPU environment textures.
  await delay(200);
  const textureBaseline = await evaluate('__renderer.info.memory.textures');
  for (let cycle = 0; cycle < 4; cycle++) {
    await selectFile(join(output, 'panorama.png'));
    await until(`envStatus().includes('panorama.png') && envStatus().includes('加载完成')`);
    await click(['HDRI 环境设置'], '使用内置 HDRI');
    await until(`envStatus().includes('citrus_orchard') && envStatus().includes('加载完成')`);
    await delay(100);
  }
  assert.ok(await evaluate('__renderer.info.memory.textures') <= textureBaseline + 1);
  await set(['HDRI 环境设置'], '显示贴图背景', true);
  await set(['HDRI 环境设置'], '水平旋转（°）', 0);
  await set(['HDRI 环境设置'], '背景模糊', 0);
  await set(['HDRI 环境设置'], '背景亮度', 1);
  await set(['HDRI 环境设置'], '环境强度', 1);
  await set(['外框插槽管理'], '环境贴图强度', 1);
  // One depth control replaces the removed modifier UI.
  assert.equal(await evaluate("!!folder(['阵列修改器'])"), false);
  const position = await evaluate('__camera.position.toArray()');
  const geometryBaseline = await evaluate('__renderer.info.memory.geometries');
  for (const count of [2, 6, 100, 101, 200]) {
    await set(['深邃效果'], '纵深数量', count); await delay(150);
    assert.equal(await evaluate('mesh.geometry.index.count'), count * 84);
    assert.deepEqual(await evaluate('mesh.geometry.groups.map(g=>g.count)'), [count*72,count*12]);
    assert.deepEqual(await evaluate('__camera.position.toArray()'), position);
  }
  await set(['深邃效果'], '纵深数量', 201); await delay(150);
  assert.equal(await evaluate('mesh.geometry.index.count'), 84*200);
  await set(['外框插槽管理'], '颜色', '#ff0000');
  await set(['内框插槽管理'], '颜色', '#00ff00');
  assert.deepEqual(await evaluate('mesh.material.map(m=>m.color.getHexString())'), ['ff0000','00ff00']);
  await set(['外框插槽管理'], '颜色', '#f3faff');
  await set(['内框插槽管理'], '颜色', '#d1aaff');
  await evaluate(`window.geometryDisposals=0;mesh.geometry.addEventListener('dispose',()=>geometryDisposals++);
    [3,4,5].forEach(n=>setControl(['深邃效果'],'纵深数量',n));`);
  await delay(150);assert.equal(await evaluate('geometryDisposals'),1);
  await click(['深邃效果'], '适配全部'); await screenshot('depth-five.png');
  await set(['深邃效果'], '纵深数量', 1); await delay(150);
  assert.deepEqual(await evaluate('Array.from(mesh.geometry.attributes.position.array)'), initialGeometry);
  assert.ok(await evaluate('__renderer.info.memory.geometries') <= geometryBaseline);
  await click(['深邃效果'], '适配全部');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 600, y: 500, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 740, y: 500, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 740, y: 500, button: 'left', buttons: 0, clickCount: 1 });
  assert.ok(Math.abs((await evaluate('__camera.position.toArray()'))[0]) > 0.1);
  await set(['外框插槽管理'], '颜色', '#f3faff');
  await set(['内框插槽管理'], '颜色', '#d1aaff');
  await click(['HDRI 环境设置'], '清除贴图');
  await delay(200);
  const resting = await evaluate('__renderCount'); await delay(400); assert.equal(await evaluate('__renderCount'), resting);
  // The complete panel remains inside the mobile viewport, with a scrollable body.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(200); await screenshot('mobile-panel.png');
  const panel = await evaluate(`(() => { const el = document.querySelector('.lil-gui.root'); const r = el.getBoundingClientRect(); return {left:r.left, right:r.right, bottom:r.bottom, height:r.height}; })()`);
  assert.ok(panel.left >= 0 && panel.right <= 390 && panel.bottom <= 844 && panel.height <= 844 * 0.52 + 1);
  // Explicit viewer mount/unmount exercises disposal independently of React StrictMode.
  const disposal = await evaluate(`(async () => {
    const { createSpecimenViewer } = await import('/src/viewer/createSpecimenViewer.js');
    const host = document.createElement('div'); host.style.cssText = 'width:200px;height:200px'; document.body.appendChild(host);
    const before = document.querySelectorAll('.lil-gui.root').length;
    const dispose = createSpecimenViewer(host);
    await new Promise(r => setTimeout(r, 300));
    dispose(); dispose(); host.remove();
    return {before, after:document.querySelectorAll('.lil-gui.root').length};
  })()`);
  assert.equal(disposal.before, disposal.after);
  assert.deepEqual(errors, []);
  const report = { formats, slots: 'independent', depth: '1–200, two slots, unchanged camera, coalescing and restore single passed', resources: 'stable GPU texture/geometry counts', whitePixel: [255,255,255,255], idle: 'passed', panel, disposal, errors };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await screenshot('failure.png');
  console.error('Browser errors:', JSON.stringify(errors));
  throw error;
} finally { ws.close(); }
