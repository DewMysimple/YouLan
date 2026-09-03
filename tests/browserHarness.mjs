import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function browserHarness(output) {
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
  async function screenshot(name, samples = []) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    if (name) await writeFile(join(output, name), Buffer.from(data, 'base64'));
    if (!samples.length) return;
    return evaluate(`(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,${data}'; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      return ${JSON.stringify(samples)}.map(([x,y]) => Array.from(ctx.getImageData(x,y,1,1).data));
    })()`);
  }
  const click = (path, label) => evaluate(`button(${JSON.stringify(path)}, ${JSON.stringify(label)}).click()`);
  const set = (path, label, value) => evaluate(`setControl(${JSON.stringify(path)}, ${JSON.stringify(label)}, ${JSON.stringify(value)})`);
  async function open({ baseline = false } = {}) {
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__observed = []; window.__renderCount = 0;
      window.__THREE_DEVTOOLS__ = { dispatchEvent(event) {
        if (event.type !== 'observe') return;
        __observed.push(event.detail);
        if (event.detail.isScene) event.detail.onBeforeRender = (renderer, scene, camera) => {
          if (scene.name === '切片计数（不显示）') {
            window.__countRT = renderer.getRenderTarget(); window.__countScene = scene;
          }
          if (!scene.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS')) return;
          __renderCount++; window.__camera = camera; window.__renderer = renderer;
        };
      }};
    ` });
    await send('Page.navigate', { url: process.env.VIEWER_URL || 'http://127.0.0.1:5173/' });
    await until(`document.querySelectorAll('.lil-gui.root').length === 1 && document.querySelectorAll('.viewer-panel-status').length === 3 && __observed.some(o => o.isScene && o.getObjectByName('SPECIMEN_FRAME_MATERIAL_SLOTS')) && !!window.__camera`);
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
    `);
    await delay(300);
    if (baseline) {
      // Legacy feature regression in a neutral single-object scene, separate
      // from browser-depth's assertions of the new delivered defaults.
      await click(['深邃效果'], '纯透射对照');
      await click(['阵列修改器'], '重置全部');
      await click(['HDRI 环境设置'], '清除贴图');
      for (const path of [['外框插槽管理'], ['内框插槽管理']]) {
        await set(path, '仅局部光纹发光', false);
        await set(path, '自发光颜色', '#ffffff');
        await set(path, '粗糙度', 0);
        await set(path, '折射率（IOR）', 1.5);
        await set(path, '厚度', 0.01);
      }
      for (const [label,value] of [['环境强度',1],['背景亮度',1],['背景模糊',0],['水平旋转（°）',0]]) await set(['HDRI 环境设置'],label,value);
      await set(['渲染设置'], '切片颜色累积', true);
      await set(['渲染设置'], '累积强度', 0.18);
      await set(['渲染设置'], 'HDRI 分级显色', 0.75);
      await delay(200);
    }
  }
  return { send, evaluate, until, screenshot, click, set, open, delay, errors, close: () => ws.close() };
}
