import { SCENE_LABELS } from './sceneCatalog.js';
import * as THREE from 'three';
import { SceneEngine, STAGE_LABELS } from './character/scene.ts';
import { DEFAULT_PHYSICS, DESIGN_WIDTH, DESIGN_HEIGHT, SCENE_DURATION } from './character/types.ts';
import controlSections from './character/controls.json';

// Keep Character's deterministic Canvas engine and present it through the
// viewer's existing WebGL canvas. No second DOM canvas or animation scheduler.
export function createCharacterScene(scene, renderer, requestRender, { reducedMotion = false } = {}) {
  const parameters = { ...DEFAULT_PHYSICS, playing: !reducedMotion, time: 0 };
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('场景12需要 Canvas 2D 支持');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const uniforms = {
    artwork: { value: texture }, viewportRatio: { value: new THREE.Vector2(1, 1) },
    paperTop: { value: new THREE.Color('#f4f0e7') }, paperBottom: { value: new THREE.Color('#ebe7dc') },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform sampler2D artwork;uniform vec2 viewportRatio;
      uniform vec3 paperTop,paperBottom;
      void main(){vec2 p=(vUv-.5)*viewportRatio+.5;
        vec3 color=mix(paperBottom,paperTop,clamp(p.y,0.,1.));
        if(all(greaterThanEqual(p,vec2(0.)))&&all(lessThanEqual(p,vec2(1.))))color=texture2D(artwork,p).rgb;
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  plane.name = '场景12·字符花园画布'; plane.frustumCulled = false; scene.add(plane);
  const camera = new THREE.Camera();
  let engine = null, active = false, disposed = false, previousTime = null, dirty = true;
  let width = 1, height = 1, scale = 1, refresh = () => {}, lastPublish = -Infinity;
  const state = scene.userData.character = { ready: false, frames: 0, snapshot: null };

  function ensureEngine() {
    if (!engine) { engine = new SceneEngine(parameters); state.ready = true; resizeCanvas(); }
    return engine;
  }
  function publish() {
    if (engine) { state.snapshot = engine.getSnapshot(); parameters.time = Number(state.snapshot.time.toFixed(2)); }
    refresh();
  }
  function resizeCanvas() {
    scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    uniforms.viewportRatio.value.set(width / (DESIGN_WIDTH * scale), height / (DESIGN_HEIGHT * scale));
    if (!engine) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(DESIGN_WIDTH * scale * dpr));
    const h = Math.max(1, Math.round(DESIGN_HEIGHT * scale * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      // WebGL textures cannot change dimensions after allocation.
      texture.dispose();
    }
    engine.setRenderScale(w / DESIGN_WIDTH);
    dirty = true;
  }
  function apply() {
    if (disposed) return;
    engine?.setConfig(parameters); previousTime = null; dirty = true; publish(); requestRender();
  }
  function replay() {
    if (disposed) return;
    ensureEngine().reset(); parameters.playing = !reducedMotion;
    previousTime = null; dirty = true; publish(); requestRender();
  }
  function clearPointer() { engine?.setPointer(null); }
  const input = renderer.domElement;
  function pointerMove(event) {
    if (!active || !engine || disposed) return;
    const bounds = input.getBoundingClientRect();
    const fit = Math.min(bounds.width / DESIGN_WIDTH, bounds.height / DESIGN_HEIGHT);
    const x = (event.clientX - bounds.left - (bounds.width - DESIGN_WIDTH * fit) / 2) / fit;
    const y = (event.clientY - bounds.top - (bounds.height - DESIGN_HEIGHT * fit) / 2) / fit;
    engine.setPointer(x >= 0 && x <= DESIGN_WIDTH && y >= 0 && y <= DESIGN_HEIGHT ? { x, y } : null);
    if (parameters.playing) requestRender();
  }
  function keydown(event) {
    if (!active || disposed || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input,textarea,select,button,[contenteditable="true"]')) return;
    if (event.code === 'Space') { event.preventDefault(); parameters.playing = !parameters.playing; apply(); }
    if (event.key.toLowerCase() === 'r') replay();
  }
  input.addEventListener('pointermove', pointerMove);
  input.addEventListener('pointerdown', pointerMove);
  input.addEventListener('pointerleave', clearPointer);
  input.addEventListener('pointercancel', clearPointer);
  window.addEventListener('blur', clearPointer);
  window.addEventListener('keydown', keydown);
  return {
    parameters, apply, replay,
    get snapshot() { return state.snapshot; },
    onPanelRefresh(callback) { refresh = callback; publish(); },
    activate() { if (disposed) return; active = true; ensureEngine(); previousTime = null; dirty = true; publish(); requestRender(); },
    deactivate() { active = false; previousTime = null; clearPointer(); },
    pauseClock() { previousTime = null; clearPointer(); },
    setReducedMotion(value) { reducedMotion = value; if (value) parameters.playing = false; apply(); },
    setSize(w, h) { width = Math.max(1, w); height = Math.max(1, h); resizeCanvas(); },
    seek(time) { if (disposed) return; ensureEngine().seek(time); parameters.playing = false; previousTime = null; dirty = true; publish(); requestRender(); },
    restore() { Object.assign(parameters, DEFAULT_PHYSICS); apply(); },
    update(timestamp, visible = true) {
      if (disposed || !active || !visible) { previousTime = null; return false; }
      const animated = parameters.playing && parameters.speed > 0;
      if (animated && previousTime !== null) {
        engine.advance(Math.min(.05, Math.max(0, (timestamp - previousTime) / 1000))); dirty = true;
      }
      previousTime = animated ? timestamp : null;
      if (dirty) {
        context.setTransform(canvas.width / DESIGN_WIDTH, 0, 0, canvas.height / DESIGN_HEIGHT, 0, 0);
        engine.render(context); texture.needsUpdate = true; dirty = false; state.frames++;
      }
      if (timestamp - lastPublish >= 100 || !animated) { lastPublish = timestamp; publish(); }
      return animated;
    },
    render() { if (!disposed && active) renderer.render(scene, camera); },
    dispose() {
      if (disposed) return;
      disposed = true; active = false; clearPointer();
      input.removeEventListener('pointermove', pointerMove); input.removeEventListener('pointerdown', pointerMove);
      input.removeEventListener('pointerleave', clearPointer); input.removeEventListener('pointercancel', clearPointer);
      window.removeEventListener('blur', clearPointer); window.removeEventListener('keydown', keydown);
      plane.removeFromParent(); plane.geometry.dispose(); material.dispose(); texture.dispose();
      canvas.width = canvas.height = 1; engine = null; refresh = () => {}; delete scene.userData.character;
    },
  };
}

export function bindCharacterPanel(gui, character) {
  const folder = gui.addFolder(SCENE_LABELS.character), p = character.parameters;
  folder.add(p, 'playing').name('播放动画').onChange(character.apply);
  folder.add(p, 'time', 0, SCENE_DURATION, .01).name('时间预览（秒）').onChange(character.seek);
  folder.add(character, 'replay').name('重播字符花园');
  folder.add(character, 'restore').name('恢复字符参数');
  const status = document.createElement('div'); status.className = 'viewer-character-status';
  folder.$children.appendChild(status);
  for (const [title, entries] of controlSections) {
    const section = folder.addFolder(title);
    if (title === '文字坍塌') section.add(p, 'collapseMode', {
      '局部扩散': 'local-collapse', '同列坍方（整列缺口）': 'column-collapse',
      '中心聚拢': 'center-collapse', '波纹塌落': 'wave-collapse',
    }).name('文字变化形式').onChange(character.apply);
    if (title === '指针扰动') section.add(p, 'pointerInteractionEnabled').name('指针互动').onChange(character.apply);
    entries.forEach(([key, label, min, max, step]) => section.add(p, key, min, max, step).name(label).onChange(character.apply));
    section.close();
  }
  const note = document.createElement('div'); note.className = 'viewer-effect-note';
  note.textContent = 'Character 字符物理实验：代码坍塌、薄片翻滚、化蝶与花园生长。8秒后蝴蝶继续访花；移动指针可扰动花朵与蝴蝶。空格播放/暂停，R重播。时间预览会暂停；恢复参数保留当前进度。二维画面按原始比例适配窗口。';
  folder.$children.appendChild(note);
  character.onPanelRefresh(() => {
    // Updating the focused timeline would fight a user's text entry.
    folder.controllersRecursive().forEach(c => { if (!c.domElement.contains(document.activeElement)) c.updateDisplay(); });
    const time = Math.min(SCENE_DURATION, p.time);
    const snapshot = character.snapshot;
    status.textContent = snapshot ? `${STAGE_LABELS[snapshot.stage]} · ${time.toFixed(2)} / 8.00 秒 · 蝴蝶 ${snapshot.butterflies} · 花朵 ${snapshot.flowers}` : '首次进入场景12时开始字符花园';
    status.dataset.time = String(time);
  });
  return folder;
}
