import { SCENE_LABELS } from './sceneCatalog.js';
import { createParameterHistory } from './parameterHistory.js';
import './parameterWorkspace.css';

// Capabilities follow the actual render branches, not whether a scene is 3D.
export const PANEL_CAPABILITIES = Object.freeze({
  dream: ['specimen', 'pollen', 'butterfly'],
  sun: ['specimen', 'butterfly'],
  parallax: ['specimen', 'pollen', 'flower', 'paper', 'butterfly'],
  environment: ['specimen', 'pollen', 'flower', 'paper', 'butterfly'],
  lighting: ['specimen', 'flower', 'paper', 'butterfly'],
  exposure: ['specimen', 'pollen', 'firework', 'flower', 'paper', 'butterfly'],
});

export function createParameterWorkspace(gui, { switcher, atmosphere, paper, refreshAtmosphere, requestRender }) {
  const root = gui.domElement;
  root.classList.add('parameter-workspace');
  gui.open();
  const all = gui.controllersRecursive();
  const top = c => { let f = c.parent; while (f.parent && f.parent !== gui) f = f.parent; return f; };
  const owners = new Map(all.map(c => [c, top(c)]));
  all.forEach(c => {
    const path = [];
    for (let f = c.parent; f && f !== gui; f = f.parent) path.unshift(f._title);
    c.domElement.dataset.parameterPath = JSON.stringify(path);
    c.domElement.dataset.parameterKey = c.property;
    if (['skyStyle', 'backgroundStyle'].includes(c.property)) c.historyDerived = true;
  });
  const folder = title => gui.folders.find(f => f._title === title);
  const dream = folder('梦境背景与迎光'), env = folder('HDRI 环境设置'), parallax = folder('指针视差');
  env.controllers.filter(c => ['choose', 'clear', 'builtin'].includes(c.property)).forEach(c => { c.historyIgnore = true; });
  const imageNote = document.createElement('p'); imageNote.className = 'parameter-scope';
  imageNote.textContent = '贴图文件单独管理；撤销与默认恢复作用于参数值，不替换已加载文件。';
  env.$children.append(imageNote);
  const selection = folder('场景选择');
  const sceneFolders = new Map(Object.entries(SCENE_LABELS).map(([id, label]) => [folder(label), id]).filter(([f]) => f));
  const shared = new Set([dream, env, parallax, selection]);
  const common = gui.addFolder('通用参数 · 当前场景');
  const output = gui.addFolder('画面输出');
  const orderedFolders = [...gui.$children.children].map(node => gui.folders.find(f => f.domElement === node)).filter(Boolean);
  const exposure = all.find(c => c.property === 'exposure');
  output.$children.append(exposure.domElement);
  // Same labels are grouped on the left, but retain each scene's own values.
  const names = new Map();
  for (const c of all) {
    if ((!sceneFolders.has(owners.get(c)) && !shared.has(owners.get(c))) || typeof c.getValue() === 'function') continue;
    if (!names.has(c._name)) names.set(c._name, new Set());
    names.get(c._name).add(owners.get(c));
  }
  const repeated = all.filter(c => sceneFolders.has(owners.get(c)) && names.get(c._name)?.size > 1 && typeof c.getValue() !== 'function');
  const moved = repeated.map(c => {
    const wrapper = document.createElement('div'); wrapper.className = 'parameter-common-control';
    wrapper.append(c.domElement); common.$children.append(wrapper);
    return { c, wrapper };
  });
  function button(text, action, parent) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.addEventListener('click', action); parent.append(b); return b;
  }
  function sidebar(side, title, subtitle) {
    const element = document.createElement('aside'); element.className = `parameter-sidebar parameter-${side}`;
    element.setAttribute('aria-label', title);
    const head = document.createElement('header'); head.className = 'parameter-header';
    const heading = document.createElement('strong'); heading.textContent = title;
    const collapse = button('收起', () => setCollapsed(side, true), head); collapse.setAttribute('aria-label', `收起${title}`);
    head.prepend(heading);
    const note = document.createElement('p'); note.className = 'parameter-subtitle'; note.textContent = subtitle;
    const tools = document.createElement('div'); tools.className = 'parameter-tools';
    const body = document.createElement('div'); body.className = 'parameter-body'; body.id = `parameter-${side}-body`;
    element.append(head, note, tools, body); gui.$children.append(element);
    return { element, body, tools, heading, note };
  }
  const left = sidebar('left', '场景与公共参数', '共享设置随场景显示，同名参数保留各场景数值。');
  const right = sidebar('right', '场景详细参数', '只显示当前场景支持的细节。');
  const handles = document.createElement('div'); handles.className = 'parameter-handles'; root.append(handles);
  const reopen = {
    left: button('展开左栏', () => setCollapsed('left', false), handles),
    right: button('展开右栏', () => setCollapsed('right', false), handles),
  };
  reopen.left.className = 'parameter-open-left'; reopen.right.className = 'parameter-open-right';
  const toggle = button('收起全部', () => {
    const collapse = !(left.element.hidden && right.element.hidden);
    setCollapsed('left', collapse); setCollapsed('right', collapse);
  }, handles);
  toggle.className = 'parameter-toggle-all';
  function setCollapsed(side, collapsed) {
    if (!collapsed && window.innerWidth < 720) {
      const other = side === 'left' ? 'right' : 'left';
      const otherPanel = other === 'left' ? left : right;
      otherPanel.element.hidden = true; otherPanel.element.inert = true;
      reopen[other].hidden = false; reopen[other].setAttribute('aria-expanded', 'false');
    }
    const panel = side === 'left' ? left : right;
    panel.element.hidden = collapsed; panel.element.inert = collapsed;
    reopen[side].hidden = !collapsed;
    reopen[side].setAttribute('aria-expanded', String(!collapsed));
    reopen[side].setAttribute('aria-controls', panel.body.id);
    toggle.textContent = left.element.hidden && right.element.hidden ? '展开参数面板' : '收起全部';
    if (collapsed) reopen[side].focus();
  }
  for (const f of orderedFolders) {
    (shared.has(f) || f === common || f === output ? left.body : right.body).append(f.domElement);
  }
  left.body.prepend(selection.domElement);
  const scope = document.createElement('p'); scope.className = 'parameter-scope';
  scope.textContent = '共享背景：场景2 / 3 / 7；迎光：场景2 / 7。'; dream.$children.prepend(scope);
  const commonNote = document.createElement('p'); commonNote.className = 'parameter-scope';
  commonNote.textContent = '以下同名参数仅调整当前场景，切换场景时保留各自设置。'; common.$children.prepend(commonNote);
  const status = document.createElement('p'); status.className = 'parameter-history-status'; status.setAttribute('role', 'status'); left.element.append(status);
  let history;
  const undo = button('撤销', () => history.undo(), left.tools); undo.title = 'Ctrl+Z / ⌘Z';
  const redo = button('重做', () => history.redo(), left.tools); redo.title = 'Ctrl+Shift+Z / Ctrl+Y';
  function offered(c) {
    for (let node = c.domElement; node && node !== root; node = node.parentElement) {
      if (node.hidden || node.style.display === 'none' || node.classList.contains('parameter-unavailable')) return false;
    }
    return true;
  }
  button('恢复左栏默认', () => history.reset(all.filter(c => left.body.contains(c.domElement) && offered(c)), '恢复左栏默认'), left.tools);
  button('恢复本场景默认', () => {
    const id = switcher.activeId;
    history.reset(all.filter(c => sceneFolders.get(owners.get(c)) === id || (id === 'specimen' && !shared.has(owners.get(c)) && !sceneFolders.has(owners.get(c)) && c !== exposure)), '恢复本场景默认');
  }, right.tools);
  function hiddenAncestors(c) {
    for (let f = c.parent; f && f !== gui; f = f.parent) if (f._hidden) return true;
    return false;
  }
  function visible(c, value) { c.domElement.classList.toggle('parameter-unavailable', !value); }
  function available(c, condition, reason) {
    c.domElement.classList.toggle('parameter-inactive', !condition);
    c.domElement.title = condition ? '' : reason;
    c.domElement.dataset.inactiveReason = condition ? '' : reason;
    // Do not overwrite lil-gui's existing device/loading enable conditions.
    c.$widget.inert = !condition;
  }
  function refresh() {
    refreshAtmosphere();
    const id = switcher.activeId, p = atmosphere.parameters;
    const has = key => PANEL_CAPABILITIES[key].includes(id);
    dream.show(has('dream')); parallax.show(has('parallax')); env.show(has('environment')); output.show(has('exposure'));
    right.heading.textContent = SCENE_LABELS[id];
    right.note.textContent = {
      opening: '时长与圆形参数可重播查看；纸纹尺度实时生效。',
      paper: '使用独立天空与云光；入场时由镜头接管视角。',
      character: '阶段参数在相应动画阶段生效，可用时间预览或重播查看。',
      firework: '右栏调整花火细节；左栏同名参数随烟花模式切换。',
    }[id] ?? '只显示当前场景支持的细节。';
    left.note.textContent = '共享参数影响适用场景；同名参数按当前场景独立保存。';
    const solar = new Set(['sunIntensity', 'sunRadius', 'sunMode', 'distance', 'rays', 'halo', 'spread', 'edgeFade', 'transitionTime', 'protection', 'occlusionStrength', 'streakStrength', 'streakCount', 'streakRotation']);
    for (const c of dream.controllersRecursive()) {
      const specimenOnly = ['protection', 'occlusionStrength'].includes(c.property);
      visible(c, (!solar.has(c.property) || has('sun')) && (!specimenOnly || id === 'specimen'));
      if (solar.has(c.property)) available(c, p.enabled && (c.property !== 'distance' || p.sunMode === '有限距离'), c.property === 'distance' && p.sunMode !== '有限距离' ? '切换到有限距离后可调' : '启用梦境效果后可调');
    }
    const imageBackground = ['specimen', 'pollen', 'butterfly'].includes(id) && (!p.enabled || p.background === 'HDRI / 纯白');
    for (const c of env.controllers) {
      visible(c, !(['showBackground', 'brightness', 'blur'].includes(c.property) && !imageBackground) && !(c.property === 'intensity' && !has('lighting')));
      if (c.property === 'rotation') visible(c, has('lighting') || imageBackground);
    }
    for (const c of parallax.controllers) available(c, !(id === 'paper' && paper.ownsCamera) && (c.property === 'enabled' || c.object.enabled !== false), id === 'paper' && paper.ownsCamera ? '入场镜头结束后可调' : '启用指针视差后可调');
    // Local dependent controls keep their value while explaining why paused.
    const depend = (sceneId, keys, condition, reason) => {
      const f = folder(SCENE_LABELS[sceneId]);
      f?.controllersRecursive().filter(c => keys.includes(c.property)).forEach(c => available(c, condition(c.object), reason));
    };
    depend('paper', ['speed'], p => p.playing, '开启播放环游后生效');
    depend('paper', ['planetSpin'], p => p.playing && p.speed > 0, '播放环游且飞行速度大于0时生效');
    depend('paper', ['pathOpacity'], p => p.showPaths, '显示飞行路径后可调');
    depend('paper', ['cloudOpacity'], p => p.clouds, '显示云层后可调');
    depend('paper', ['cloudDrift'], p => p.clouds && p.playing && p.speed > 0, '显示云层且环游速度大于0时生效');
    depend('butterfly', ['speed'], p => p.playing, '播放扇翅后生效');
    depend('butterfly', ['drift'], p => p.playing && p.hovering && p.speed > 0, '开启飞行起伏且扇翅速度大于0时生效');
    depend('dappled', ['speed'], p => p.animate, '开启光影流动后生效');
    depend('dappled', ['responseTime'], p => p.followPointer, '开启指针跟随后生效');
    depend('gallery', ['speed'], p => p.animate, '开启氛围动画后生效');
    depend('gallery', ['trailWidth', 'trailOpacity', 'sparkles'], p => p.trail, '显示空间光带后可调');
    depend('firework', ['volume'], p => p.sound, '开启烟花音效后可调');
    depend('firework', ['interval'], p => p.autoLaunch, '开启自动烟花秀后生效');
    depend('firework', ['bloomStrength', 'bloomRadius', 'bloomThreshold'], p => p.bloomEnabled, '启用柔光后可调');
    depend('firework', ['speed'], p => p.enabled && p.playing, '启用并播放花火后生效');
    depend('character', ['speed'], p => p.playing, '播放动画后生效');
    depend('character', ['flowerPointerRadius', 'flowerPointerStrength', 'flowerPointerResponse', 'flowerPointerReturn', 'pointerFalloff', 'butterflyPointerRadius', 'butterflyPointerRepulsion', 'butterflyPointerReturn'], p => p.pointerInteractionEnabled, '开启指针互动后生效');
    folder('深邃效果').controllers.filter(c => ['strength', 'radius', 'threshold'].includes(c.property))
      .forEach(c => available(c, c.object.enabled, '启用局部 Bloom 光晕后可调'));
    for (const { c, wrapper } of moved) wrapper.hidden = hiddenAncestors(c);
    common.show(moved.some(({ c, wrapper }) => !wrapper.hidden && !c._hidden));
    // Keep subgroup headings only where a visible control actually remains.
    root.querySelectorAll('.viewer-panel-section').forEach(heading => {
      let node = heading.nextElementSibling, hasControl = false;
      while (node && !node.classList.contains('viewer-panel-section')) {
        if (!node.hidden && node.style.display !== 'none' && !node.classList.contains('parameter-unavailable') && (node.classList.contains('controller') || node.classList.contains('lil-gui'))) hasControl = true;
        node = node.nextElementSibling;
      }
      heading.hidden = !hasControl;
    });
    if (history) {
      undo.disabled = !history.canUndo; redo.disabled = !history.canRedo;
      status.textContent = history.canUndo ? `可撤销：${history.undoLabel} · Ctrl+Z` : 'Ctrl+Z 撤销参数 · Ctrl+Shift+Z 重做';
    }
    requestRender();
  }
  history = createParameterHistory(all, { onRefresh: refresh });
  // lil-gui binds its wheel-end handler during construction; the root finish
  // event also catches that pre-bound path without adding a polling loop.
  gui.onFinishChange(() => queueMicrotask(() => history.finish()));
  const unsubscribe = switcher.subscribe(id => { history.finish(); folder(SCENE_LABELS[id])?.open(); refresh(); });
  // Scene callbacks may change visibility asynchronously (intro completion, assets).
  const observer = new MutationObserver(() => {
    for (const { c, wrapper } of moved) wrapper.hidden = hiddenAncestors(c);
    // The paper intro owns the camera until its asynchronous transition ends.
    if (switcher.activeId === 'paper') for (const c of parallax.controllers) available(c, !paper.ownsCamera && (c.property === 'enabled' || c.object.enabled !== false), paper.ownsCamera ? '入场镜头结束后可调' : '启用指针视差后可调');
  });
  gui.foldersRecursive().forEach(f => observer.observe(f.domElement, { attributes: true, attributeFilter: ['style'] }));
  paper && folder(SCENE_LABELS.paper).controllers.filter(c => c.property === 'skip').forEach(c => observer.observe(c.domElement, { attributes: true, attributeFilter: ['style'] }));
  function keydown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (!['z', 'y'].includes(key)) return;
    // Preserve native undo in page text fields; parameter inputs use edit history.
    if (event.target.closest?.('input, textarea, [contenteditable="true"]') && !root.contains(event.target)) return;
    event.preventDefault(); event.stopPropagation();
    // lil-gui deliberately does not repaint a focused number input. Commit its
    // text first, then restore focus after replay so Ctrl+Z visibly updates it.
    const input = root.contains(document.activeElement) && document.activeElement.matches('input') ? document.activeElement : null;
    input?.blur();
    if (key === 'y' || event.shiftKey) history.redo(); else history.undo();
    input?.focus({ preventScroll: true });
  }
  window.addEventListener('keydown', keydown, true);
  root.addEventListener('change', refresh);
  setCollapsed('right', false); setCollapsed('left', false);
  folder(SCENE_LABELS[switcher.activeId])?.open();
  if (window.innerWidth < 720) setCollapsed('right', true);
  refresh();
  return { refresh, dispose() { unsubscribe(); observer.disconnect(); gui.onFinishChange(undefined); history.dispose(); window.removeEventListener('keydown', keydown, true); root.removeEventListener('change', refresh); } };
}
