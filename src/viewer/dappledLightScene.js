import * as THREE from 'three';
import { SCREEN_VERTEX, DAPPLED_FIELD_FRAGMENT, DAPPLED_BLUR_FRAGMENT, DAPPLED_OUTPUT_FRAGMENT } from './dappledLightShaders.js';

export const DAPPLED_DEFAULTS = Object.freeze({
  animate: true,
  speed: 1,
  followPointer: true,
  responseTime: 0.16,
  radius: 0.354,
  density: 26.7,
  angle: 44,
  stretch: 0.84,
  scatter: 1,
  wave: 0.118,
  softness: 1,
  contrast: 0.26,
  grain: 0.65,
  background: '#ffaaa5',
  shadow: '#4a0035',
  light: '#ffd198',
});

const EPSILON = 0.0001;

// This controller has no camera dependency: input and animation are in UV space.
export function createDappledMotion({ reducedMotion = false } = {}) {
  const parameters = { ...DAPPLED_DEFAULTS };
  const pointer = new THREE.Vector2(0.5, 0.5);
  const target = pointer.clone();
  let active = false;
  let lastTimestamp = null;
  let time = 3;

  function center({ immediate = false } = {}) {
    target.set(0.5, 0.5);
    if (immediate) pointer.copy(target);
  }

  function update(timestamp, visible = true) {
    if (!active || !visible) { lastTimestamp = null; return false; }
    const dt = lastTimestamp === null ? 1 / 60 : THREE.MathUtils.clamp((timestamp - lastTimestamp) / 1000, 0, 0.1);
    lastTimestamp = timestamp;
    if (!parameters.followPointer || reducedMotion) center({ immediate: reducedMotion });
    const follow = parameters.responseTime <= 0 ? 1 : -Math.expm1(-dt / parameters.responseTime);
    pointer.lerp(target, follow);
    const moving = pointer.distanceToSquared(target) > EPSILON ** 2;
    if (!moving) pointer.copy(target);
    const flowing = parameters.animate && parameters.speed > 0 && !reducedMotion;
    if (flowing) time += dt * 2 * parameters.speed;
    if (!moving && !flowing) lastTimestamp = null;
    return moving || flowing;
  }

  return {
    parameters, pointer, target, update, center,
    get time() { return time; },
    get active() { return active; },
    setPointer(x, y) {
      if (!active || reducedMotion || !parameters.followPointer) return false;
      target.set(THREE.MathUtils.clamp(x, 0, 1), THREE.MathUtils.clamp(y, 0, 1));
      return true;
    },
    activate() { active = true; lastTimestamp = null; },
    deactivate() { active = false; lastTimestamp = null; center({ immediate: true }); },
    pauseClock() { lastTimestamp = null; },
    setReducedMotion(value) {
      reducedMotion = value;
      lastTimestamp = null;
      if (value) center({ immediate: true });
    },
    reset() { Object.assign(parameters, DAPPLED_DEFAULTS); time = 3; lastTimestamp = null; center({ immediate: true }); },
  };
}

function displayColor(hex) {
  // Raw display values, not Three's automatic sRGB-to-linear conversion.
  const value = Number.parseInt(hex.slice(1), 16);
  return new THREE.Vector3((value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255);
}

export function createDappledLightScene(scene, renderer, requestRender, options = {}) {
  const motion = createDappledMotion(options);
  const p = motion.parameters;
  const canvas = renderer.domElement;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  target.texture.name = '场景7·二维光影场';
  const blurTarget = target.clone();
  blurTarget.texture.name = '场景7·散焦光影';
  const uniforms = {
    uField: { value: target.texture }, uBlurred: { value: blurTarget.texture },
    uBlurTexel: { value: new THREE.Vector2(1, 1) }, uAspect: { value: 1 },
    uTime: { value: 3 }, uPointer: { value: motion.pointer },
    uRadius: { value: p.radius }, uDensity: { value: p.density },
    uAngle: { value: THREE.MathUtils.degToRad(p.angle) }, uStretch: { value: p.stretch },
    uScatter: { value: p.scatter }, uWave: { value: p.wave },
    uSoftness: { value: p.softness }, uContrast: { value: p.contrast }, uGrain: { value: p.grain },
    uBackground: { value: displayColor(p.background) },
    uShadow: { value: displayColor(p.shadow) }, uLight: { value: displayColor(p.light) },
  };
  const material = (fragmentShader) => new THREE.ShaderMaterial({
    vertexShader: SCREEN_VERTEX, fragmentShader, uniforms,
    depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
  });
  const fieldMaterial = material(DAPPLED_FIELD_FRAGMENT);
  const blurMaterial = material(DAPPLED_BLUR_FRAGMENT);
  const outputMaterial = material(DAPPLED_OUTPUT_FRAGMENT);
  const fieldScene = new THREE.Scene();
  fieldScene.name = '场景7·光影离屏计算';
  const fieldPlane = new THREE.Mesh(geometry, fieldMaterial);
  const outputPlane = new THREE.Mesh(geometry, outputMaterial);
  fieldPlane.frustumCulled = outputPlane.frustumCulled = false;
  outputPlane.name = '场景7·二维斑驳光影';
  fieldScene.add(fieldPlane);
  scene.add(outputPlane);
  scene.background = null;
  let disposed = false;
  let width = 1, height = 1;
  const oldClearColor = new THREE.Color();
  const oldViewport = new THREE.Vector4();
  const oldScissor = new THREE.Vector4();
  const outputSize = new THREE.Vector2();

  function syncUniforms() {
    uniforms.uTime.value = motion.time;
    uniforms.uRadius.value = p.radius;
    uniforms.uDensity.value = p.density;
    uniforms.uAngle.value = THREE.MathUtils.degToRad(p.angle);
    uniforms.uStretch.value = p.stretch;
    uniforms.uScatter.value = p.scatter;
    uniforms.uWave.value = p.wave;
    uniforms.uSoftness.value = p.softness;
    uniforms.uContrast.value = p.contrast;
    uniforms.uGrain.value = p.grain;
    uniforms.uBackground.value.copy(displayColor(p.background));
    uniforms.uShadow.value.copy(displayColor(p.shadow));
    uniforms.uLight.value.copy(displayColor(p.light));
  }

  function pointerMove(event) {
    if (!motion.active || disposed || document.hidden || event.isPrimary === false) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (motion.setPointer((event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height)) requestRender();
  }
  function pointerLeave() {
    if (!motion.active || disposed) return;
    motion.center();
    requestRender();
  }
  canvas.addEventListener('pointermove', pointerMove, { passive: true });
  canvas.addEventListener('pointerdown', pointerMove, { passive: true });
  canvas.addEventListener('pointerleave', pointerLeave);
  canvas.addEventListener('pointercancel', pointerLeave);
  window.addEventListener('blur', pointerLeave);

  return {
    parameters: p,
    activate() { motion.activate(); requestRender(); },
    deactivate() { motion.deactivate(); },
    pauseClock() { motion.pauseClock(); },
    setReducedMotion(value) { motion.setReducedMotion(value); },
    center() { motion.center(); requestRender(); },
    reset() { motion.reset(); requestRender(); },
    update(timestamp, visible = true) {
      if (disposed) return false;
      const animated = motion.update(timestamp, visible);
      syncUniforms();
      return animated;
    },
    setSize(w, h) { width = Math.max(w, 1); height = Math.max(h, 1); uniforms.uAspect.value = width / height; },
    render() {
      if (disposed || !motion.active) return;
      // Allocate only when this scene is drawn. Keep both expensive passes at
      // half CSS resolution, as in the reference, independent of device DPR.
      const scale = Math.min(0.5, 1280 / width, 720 / height);
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (target.width !== w || target.height !== h) {
        target.setSize(w, h); blurTarget.setSize(w, h);
        uniforms.uBlurTexel.value.set(1 / w, 1 / h);
      }
      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      const previousAlpha = renderer.getClearAlpha();
      const previousScissorTest = renderer.getScissorTest();
      renderer.getClearColor(oldClearColor);
      renderer.getViewport(oldViewport);
      renderer.getScissor(oldScissor);
      try {
        renderer.autoClear = true;
        renderer.setScissorTest(false);
        fieldPlane.material = fieldMaterial;
        renderer.setRenderTarget(target);
        renderer.render(fieldScene, camera);
        fieldPlane.material = blurMaterial;
        renderer.setRenderTarget(blurTarget);
        renderer.render(fieldScene, camera);
        renderer.setRenderTarget(null);
        renderer.getSize(outputSize);
        renderer.setViewport(0, 0, outputSize.x, outputSize.y);
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.setViewport(oldViewport);
        renderer.setScissor(oldScissor);
        renderer.setScissorTest(previousScissorTest);
        renderer.setClearColor(oldClearColor, previousAlpha);
        renderer.autoClear = previousAutoClear;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      motion.deactivate();
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerdown', pointerMove);
      canvas.removeEventListener('pointerleave', pointerLeave);
      canvas.removeEventListener('pointercancel', pointerLeave);
      window.removeEventListener('blur', pointerLeave);
      scene.remove(outputPlane);
      fieldScene.remove(fieldPlane);
      geometry.dispose(); fieldMaterial.dispose(); blurMaterial.dispose(); outputMaterial.dispose();
      target.dispose(); blurTarget.dispose();
    },
  };
}

export function bindDappledLightPanel(gui, dappled, requestRender) {
  const folder = gui.addFolder('场景7·斑驳光影');
  const p = dappled.parameters;
  const change = () => { dappled.pauseClock(); requestRender(); };
  folder.add(p, 'followPointer').name('指针跟随').onChange(change);
  folder.add(p, 'responseTime', 0, 0.6, 0.01).name('跟随缓动（秒）').onChange(change);
  folder.add(p, 'animate').name('光影流动').onChange(change);
  folder.add(p, 'speed', 0, 2, 0.01).name('流动速度').onChange(change);
  folder.add(p, 'radius', 0.15, 0.7, 0.001).name('光照范围').onChange(change);
  folder.add(p, 'density', 10, 45, 0.1).name('光斑密度').onChange(change);
  folder.add(p, 'angle', 0, 180, 1).name('光斑倾角（°）').onChange(change);
  folder.add(p, 'stretch', 0.3, 0.93, 0.01).name('光斑拉伸').onChange(change);
  folder.add(p, 'scatter', 0, 2, 0.01).name('斑驳散布').onChange(change);
  folder.add(p, 'wave', 0, 0.25, 0.001).name('波纹扭曲').onChange(change);
  folder.add(p, 'softness', 0, 2, 0.01).name('散焦柔化').onChange(change);
  folder.add(p, 'contrast', 0.1, 0.5, 0.01).name('光影对比').onChange(change);
  folder.add(p, 'grain', 0, 2, 0.05).name('细微颗粒').onChange(change);
  folder.addColor(p, 'background').name('珊瑚底色').onChange(change);
  folder.addColor(p, 'light').name('暖光颜色').onChange(change);
  folder.addColor(p, 'shadow').name('阴影颜色').onChange(change);
  folder.add(dappled, 'center').name('光照回中');
  folder.add({ reset() { dappled.reset(); folder.controllersRecursive().forEach(c => c.updateDisplay()); } }, 'reset').name('恢复参考效果');
  const note = document.createElement('div');
  note.className = 'viewer-effect-note';
  note.textContent = '移动指针让暖光在珊瑚色背景上聚散。离开画面后柔和回中；关闭光影流动可单独体验指针跟随。减少动态效果开启时保持静态。';
  folder.$children.appendChild(note);
  return folder;
}
