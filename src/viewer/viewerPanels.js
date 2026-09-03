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

export function bindEnvironmentPanel(gui, environment, onUserBackground = () => {}) {
  const folder = gui.addFolder('HDRI 环境设置');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.hdr,.exr,.jpg,.jpeg,.png';
  input.hidden = true;
  input.setAttribute('aria-label', '选择 HDRI 全景图片');
  folder.domElement.appendChild(input);
  let selection = 0;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      const ticket = ++selection;
      if (await environment.loadFile(file) && ticket === selection) onUserBackground();
    }
  });
  const actions = {
    choose: () => input.click(), clear: () => { selection++; environment.clear(); onUserBackground(); },
    builtin: async () => { const ticket = ++selection; if (await environment.loadBuiltin() && ticket === selection) onUserBackground(); },
  };
  folder.add(actions, 'choose').name('选择本地贴图');
  folder.add(actions, 'clear').name('清除贴图');
  folder.add(actions, 'builtin').name('使用内置 HDRI');
  const status = statusLine(folder);
  status.dataset.environment = 'true';
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
  return () => { selection++; unsubscribe(); input.remove(); };
}
