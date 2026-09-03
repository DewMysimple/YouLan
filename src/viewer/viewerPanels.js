import { ARRAY_LIMITS, createArrayLayer, evaluateArray, arrayBaseBounds, buildArrayGeometry } from './arrayModifier.js';

function statusLine(folder) {
  const element = document.createElement('div');
  element.className = 'viewer-panel-status';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  folder.$children.appendChild(element);
  return element;
}

export function bindSlicePanel(folder, slices, requestRender) {
  const { parameters, state } = slices;
  const enabled = folder.add(parameters, 'enabled').name('切片颜色累积').onChange(refresh);
  const strength = folder.add(parameters, 'strength', 0, 1, 0.01).name('累积强度').onChange(requestRender);
  const limit = folder.add(parameters, 'limit', 0.1, 8, 0.1).name('加深上限').onChange(requestRender);
  const clarity = folder.add(parameters, 'clarity', 0, 1, 0.01).name('HDRI 分级显色').onChange(requestRender);
  const status = statusLine(folder);
  function refresh() {
    enabled.enable(state.supported);
    strength.enable(state.supported && parameters.enabled);
    limit.enable(state.supported && parameters.enabled);
    clarity.enable(state.supported && parameters.enabled);
    status.dataset.kind = state.supported ? 'ready' : 'warning';
    status.textContent = !state.supported ? state.message : parameters.enabled
      ? '按实际重叠累积染色，单片不额外加深。\nHDRI 显色：减少片内背景干扰，0 保留原透射细节。\n直线视线近似，不含逐层多次折射。'
      : '原有玻璃渲染；切片不额外累积染色。';
    requestRender();
  }
  refresh();
}

export function bindEnvironmentPanel(gui, environment) {
  const folder = gui.addFolder('HDRI 环境设置');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.hdr,.exr,.jpg,.jpeg,.png';
  input.hidden = true;
  input.setAttribute('aria-label', '选择 HDRI 全景图片');
  folder.domElement.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void environment.loadFile(file);
    input.value = '';
  });
  const actions = {
    choose: () => input.click(), clear: () => environment.clear(),
    builtin: () => environment.loadBuiltin(),
  };
  folder.add(actions, 'choose').name('选择本地贴图');
  folder.add(actions, 'clear').name('清除贴图');
  folder.add(actions, 'builtin').name('使用内置 HDRI');
  const status = statusLine(folder);
  const parameters = environment.parameters;
  folder.add(parameters, 'intensity', 0, 5, 0.01).name('环境强度').onChange(environment.apply);
  const show = folder.add(parameters, 'showBackground').name('显示贴图背景').onChange(() => {
    environment.apply(); refresh(environment.state);
  });
  const brightness = folder.add(parameters, 'brightness', 0, 5, 0.01).name('背景亮度').onChange(environment.apply);
  const blur = folder.add(parameters, 'blur', 0, 1, 0.01).name('背景模糊').onChange(environment.apply);
  const rotation = folder.add(parameters, 'rotation', -180, 180, 1).name('水平旋转（°）').onChange(environment.apply);
  function refresh(state) {
    status.textContent = `${state.filename}\n${state.status}`;
    status.dataset.kind = state.kind;
    const hasImage = state.filename !== '无贴图（纯白环境）';
    show.enable(hasImage);
    rotation.enable(hasImage);
    brightness.enable(hasImage && parameters.showBackground);
    blur.enable(hasImage && parameters.showBackground);
  }
  const unsubscribe = environment.subscribe(refresh);
  return () => { unsubscribe(); input.remove(); };
}

export function bindArrayPanel(gui, mesh, requestRender, fit) {
  const folder = gui.addFolder('阵列修改器');
  const base = mesh.geometry.clone();
  mesh.updateWorldMatrix(true, false);
  const matrixWorld = mesh.matrixWorld.clone();
  const baseBounds = arrayBaseBounds(base, matrixWorld);
  let layers = [];
  let renderedLayers = [];
  let frame = 0;
  let disposed = false;
  let layerFolders = [];
  const actions = {
    add() { change([...layers, createArrayLayer()], true); },
    reset() { change([], true); },
    fit() { flush(); fit(); },
  };
  const add = folder.add(actions, 'add').name('新增阵列');
  const reset = folder.add(actions, 'reset').name('重置全部');
  folder.add(actions, 'fit').name('适配全部');
  const status = statusLine(folder);

  function showResult(result) {
    status.dataset.kind = result.overlapping ? 'warning' : 'ready';
    status.textContent = `${layers.length} / 8 层 · ${result.count} / 256 份（含原件）\nX 左右 · Y 上下 · Z 前后${result.overlapping ? '\n零步距：副本完全重叠。' : ''}`;
    add.enable(layers.length < ARRAY_LIMITS.layers);
    reset.enable(layers.length > 0);
  }

  function flush() {
    if (disposed) return;
    if (frame) { cancelAnimationFrame(frame); frame = 0; } else return;
    try {
      const result = evaluateArray(layers, baseBounds);
      const geometry = buildArrayGeometry(base, matrixWorld, result.offsets);
      const previous = mesh.geometry;
      mesh.geometry = geometry;
      previous.dispose();
      renderedLayers = structuredClone(layers);
      requestRender();
    } catch (error) {
      layers = structuredClone(renderedLayers);
      rebuild();
      showResult(evaluateArray(layers, baseBounds));
      status.dataset.kind = 'error';
      status.textContent = `阵列更新失败：${error.message}`;
    }
  }

  function change(next, structural = false) {
    try {
      const result = evaluateArray(next, baseBounds);
      layers = next;
      if (structural) rebuild();
      showResult(result);
      if (!frame) frame = requestAnimationFrame(flush);
      return true;
    } catch (error) {
      status.dataset.kind = 'error';
      status.textContent = error.message;
      return false;
    }
  }

  function rebuild() {
    layerFolders.forEach((item) => item.destroy());
    layerFolders = layers.map((layer, index) => {
      const group = folder.addFolder(`阵列 ${index + 1}`);
      const view = { ...layer };
      const controls = [];
      const offsetControls = { relative: [], constant: [] };
      function refresh() {
        Object.assign(view, layers[index]);
        controls.forEach((control) => control.updateDisplay());
        for (const type of ['relative', 'constant']) {
          offsetControls[type].forEach((control) => control.enable(view.enabled && view[type]));
        }
      }
      function bind(target, property, label, ...range) {
        const control = target.add(view, property, ...range).name(label).onChange((value) => {
          const next = structuredClone(layers);
          next[index][property] = value;
          change(next);
          refresh();
        });
        controls.push(control);
        return control;
      }
      bind(group, 'enabled', '启用');
      bind(group, 'count', '数量（含原件）', 1, 100, 1);
      for (const [type, title] of [['relative', '相对偏移'], ['constant', '恒定偏移']]) {
        const offset = group.addFolder(title);
        bind(offset, type, '启用偏移');
        for (const axis of ['X', 'Y', 'Z']) {
          offsetControls[type].push(bind(offset, type + axis, axis).step(0.01));
        }
      }
      const actions = {
        remove() { change(layers.filter((_, i) => i !== index), true); },
        up() { move(index - 1); }, down() { move(index + 1); },
      };
      function move(to) {
        const next = structuredClone(layers);
        [next[index], next[to]] = [next[to], next[index]];
        change(next, true);
      }
      group.add(actions, 'up').name('上移').enable(index > 0);
      group.add(actions, 'down').name('下移').enable(index < layers.length - 1);
      group.add(actions, 'remove').name('删除此层');
      refresh();
      return group;
    });
  }
  showResult(evaluateArray(layers, baseBounds));
  const dispose = () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    base.dispose();
  };
  // Internal preset API; the public viewer still returns its original cleanup.
  dispose.setLayers = (next) => {
    if (disposed) return false;
    const valid = change(structuredClone(next), true);
    if (valid) flush();
    return valid;
  };
  dispose.baseBounds = baseBounds;
  return dispose;
}
