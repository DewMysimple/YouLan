import * as THREE from 'three';
import backgroundFragment from './depthGallery/background.glsl?raw';
import { GALLERY_SLIDES, GALLERY_DEFAULTS, galleryBlend, dampGallery, normalizeGalleryWheel } from './depthGallery/data.js';
import { createGalleryTrail } from './depthGallery/trail.js';

export function createDepthGalleryScene(scene, renderer, requestRender, { reducedMotion = false } = {}) {
  const parameters = { ...GALLERY_DEFAULTS };
  // A dedicated camera preserves scroll framing without mutating the shared OrbitControls camera.
  const camera = new THREE.PerspectiveCamera(45, 1, .05, 100);
  camera.position.z = 5;
  const canvas = renderer.domElement;
  const pointer = new THREE.Vector2(), targetPointer = new THREE.Vector2();
  const geometry = new THREE.PlaneGeometry(3, 3);
  const planes = GALLERY_SLIDES.map((slide, i) => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: i ? 0 : 1,
      depthWrite: false, toneMapped: false, color: slide.accent });
    const plane = new THREE.Mesh(geometry, material);
    plane.name = `纵深花廊·${slide.name}`;
    plane.userData.aspect = .75;
    plane.visible = false;
    scene.add(plane);
    return plane;
  });
  const uniforms = {
    uBackgroundColor: { value: new THREE.Color() }, uBlob1Color: { value: new THREE.Color() },
    uBlob2Color: { value: new THREE.Color() }, uNoiseStrength: { value: parameters.grain },
    uBlobRadius: { value: .65 }, uBlobRadiusSecondary: { value: .507 },
    uBlobStrength: { value: .9 }, uTime: { value: 0 }, uVelocityIntensity: { value: 0 },
  };
  const backgroundGeometry = new THREE.PlaneGeometry(2, 2);
  const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,1.,1.); }',
    fragmentShader: backgroundFragment, depthWrite: false, depthTest: false, toneMapped: false,
  });
  const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
  background.name = '纵深花廊·氛围背景'; background.frustumCulled = false; background.renderOrder = -100;
  scene.add(background);
  const trail = createGalleryTrail(scene);
  let active = false, disposed = false, reduced = reducedMotion, loading = null;
  let width = 1, height = 1, current = 0, velocity = 0, lastTime = null, time = 0;
  let dragId = null, dragY = 0, statusElement = null;
  let loaded = 0, failed = 0;
  const mixColor = new THREE.Color();
  function refreshStatus() {
    if (!statusElement) return;
    const index = Math.round(current * (planes.length - 1));
    const message = failed ? `有 ${failed} 张图片加载失败，可点击“重试图片加载”` : loaded < planes.length
      ? `正在载入花卉图片 ${loaded} / ${planes.length}` : `${index + 1} / ${planes.length} · ${GALLERY_SLIDES[index].name} · 滚轮或上下拖动穿行`;
    if (statusElement.textContent !== message) statusElement.textContent = message;
  }
  async function load() {
    if (loading || disposed) return loading;
    failed = 0;
    loading = Promise.all(planes.map(async (plane, i) => {
      if (plane.material.map) return;
      try {
        const texture = await new THREE.TextureLoader().loadAsync(GALLERY_SLIDES[i].url);
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        plane.material.map = texture; plane.material.color.set('#ffffff'); plane.material.needsUpdate = true;
        plane.userData.aspect = texture.image.width / texture.image.height;
        loaded++;
      } catch { if (!disposed) failed++; }
      if (!disposed) { refreshStatus(); if (active) requestRender(); }
    })).finally(() => { loading = null; });
    return loading;
  }
  function addInput(pixels) {
    parameters.progress = THREE.MathUtils.clamp(parameters.progress + pixels * .01 * parameters.wheelSpeed / (parameters.gap * (planes.length - 1)), 0, 1);
    requestRender();
  }
  const wheel = event => {
    if (!active || event.ctrlKey) return;
    event.preventDefault();
    addInput(normalizeGalleryWheel(event.deltaY, event.deltaMode, height));
  };
  const down = event => {
    if (!active || !event.isPrimary || event.button !== 0) return;
    dragId = event.pointerId; dragY = event.clientY;
    canvas.setPointerCapture?.(dragId);
  };
  const move = event => {
    if (!active || !event.isPrimary) return;
    const rect = canvas.getBoundingClientRect();
    if (!reduced) targetPointer.set((event.clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1,
      1 - (event.clientY - rect.top) / Math.max(rect.height, 1) * 2);
    if (dragId === event.pointerId) { addInput((dragY - event.clientY) * 1.5); dragY = event.clientY; }
    requestRender();
  };
  const endDrag = () => {
    const id = dragId; dragId = null;
    if (id !== null && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  };
  const leave = () => { targetPointer.set(0, 0); if (active) requestRender(); };
  const blur = () => { endDrag(); leave(); lastTime = null; };
  const events = [['wheel', wheel, { passive: false }], ['pointerdown', down], ['pointermove', move],
    ['pointerup', endDrag], ['pointercancel', blur], ['lostpointercapture', endDrag], ['pointerleave', leave]];
  function bind(enabled) {
    for (const [name, handler, options] of events) canvas[enabled ? 'addEventListener' : 'removeEventListener'](name, handler, options);
    window[enabled ? 'addEventListener' : 'removeEventListener']('blur', blur);
  }
  function update(timestamp, visible = true) {
    if (!active || disposed || !visible) { lastTime = null; return false; }
    const delta = lastTime === null ? 1 / 60 : Math.min(.05, Math.max(0, (timestamp - lastTime) / 1000));
    lastTime = timestamp;
    const old = current;
    current = reduced ? parameters.progress : dampGallery(current, parameters.progress, delta, parameters.smoothing);
    velocity = reduced ? 0 : dampGallery(velocity, (current - old) / Math.max(delta, .001), delta, .12);
    pointer.x = reduced ? 0 : dampGallery(pointer.x, targetPointer.x, delta, .18);
    pointer.y = reduced ? 0 : dampGallery(pointer.y, targetPointer.y, delta, .18);
    const animated = parameters.animate && parameters.speed > 0 && !reduced;
    if (animated) time += delta * parameters.speed;
    const blend = galleryBlend(current);
    const narrow = width < 768;
    camera.position.z = parameters.gap * (1 - current * (planes.length - 1));
    // Keep the whole portrait inside a narrow viewport; desktop preserves the staggered layout.
    const viewWidth = 2 * 5 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const responsiveScale = narrow ? Math.min(.82, viewWidth / 3.8) : 1;
    planes.forEach((plane, i) => {
      const opacity = i === blend.index ? 1 - blend.mix : i === blend.next ? blend.mix : 0;
      plane.material.opacity = opacity;
      plane.visible = !!plane.material.map && opacity > .0001;
      const pulse = 1 + Math.min(1, Math.abs(velocity) * 3) * parameters.breath;
      const scale = parameters.scale * responsiveScale * pulse * parameters.gap / 5;
      plane.scale.set(scale * plane.userData.aspect, scale, 1);
      plane.position.set(GALLERY_SLIDES[i].x * parameters.spread * (narrow ? .18 : 1) + pointer.x * parameters.parallax * opacity,
        pointer.y * parameters.parallax * .5 * opacity + velocity * .035,
        -i * parameters.gap);
      plane.rotation.set(-pointer.y * Math.abs(velocity) * parameters.breath, pointer.x * Math.abs(velocity) * parameters.breath, 0);
    });
    const a = GALLERY_SLIDES[blend.index], b = GALLERY_SLIDES[blend.next];
    for (const [uniform, key] of [['uBackgroundColor', 'background'], ['uBlob1Color', 'blob1'], ['uBlob2Color', 'blob2']]) {
      uniforms[uniform].value.set(a[key]).lerp(mixColor.set(b[key]), blend.mix);
    }
    uniforms.uNoiseStrength.value = parameters.grain;
    uniforms.uBlobStrength.value = parameters.moodStrength;
    uniforms.uBlobRadius.value = .65 + current * .08;
    uniforms.uBlobRadiusSecondary.value = uniforms.uBlobRadius.value * .78;
    uniforms.uVelocityIntensity.value = Math.min(1, Math.abs(velocity));
    uniforms.uTime.value = time * 1000;
    trail.update(current, time, parameters, narrow, reduced, renderer.getPixelRatio());
    refreshStatus();
    return animated || current !== parameters.progress || pointer.distanceToSquared(targetPointer) > 1e-10 && !reduced || Math.abs(velocity) > .00001;
  }
  const api = {
    parameters, camera, planes,
    activate() { if (disposed || active) return; active = true; lastTime = null; bind(true); void load(); requestRender(); },
    deactivate() { if (!active) return; active = false; bind(false); endDrag(); pointer.set(0, 0); targetPointer.set(0, 0); velocity = 0; lastTime = null; },
    update,
    render() { renderer.render(scene, camera); },
    setSize(w, h) { width = Math.max(w, 1); height = Math.max(h, 1); camera.aspect = width / height; camera.updateProjectionMatrix(); },
    pauseClock() { lastTime = null; endDrag(); },
    setReducedMotion(value) { reduced = value; pointer.set(0, 0); targetPointer.set(0, 0); velocity = 0; lastTime = null; requestRender(); },
    center() { parameters.progress = 0; current = 0; velocity = 0; pointer.set(0, 0); targetPointer.set(0, 0); trail.reset(); requestRender(); },
    reset() { Object.assign(parameters, GALLERY_DEFAULTS); api.center(); },
    retry: load,
    setStatusElement(element) { statusElement = element; refreshStatus(); },
    dispose() {
      if (disposed) return;
      api.deactivate(); disposed = true; statusElement = null;
      for (const plane of planes) { scene.remove(plane); plane.material.map?.dispose(); plane.material.dispose(); }
      geometry.dispose(); scene.remove(background); backgroundGeometry.dispose(); backgroundMaterial.dispose(); trail.dispose();
    },
  };
  return api;
}

export function bindDepthGalleryPanel(gui, gallery, requestRender) {
  const folder = gui.addFolder('场景8·纵深花廊'), p = gallery.parameters;
  folder.add(p, 'progress', 0, 1, .001).name('穿行进度').listen().onChange(requestRender);
  folder.add(p, 'wheelSpeed', .2, 2, .05).name('滚动灵敏度').onChange(requestRender);
  folder.add(p, 'smoothing', .05, .8, .01).name('滚动缓动（秒）').onChange(requestRender);
  folder.add(p, 'gap', 3.5, 7, .1).name('画面纵深间距').onChange(requestRender);
  folder.add(p, 'scale', .6, 1.3, .01).name('花卉画面大小').onChange(requestRender);
  folder.add(p, 'spread', 0, 1.2, .01).name('左右错落幅度').onChange(requestRender);
  folder.add(p, 'parallax', 0, .3, .01).name('指针视差幅度').onChange(requestRender);
  folder.add(p, 'breath', 0, .08, .001).name('滚动呼吸幅度').onChange(requestRender);
  folder.add(p, 'animate').name('氛围动画').onChange(requestRender);
  folder.add(p, 'speed', 0, 2, .05).name('氛围流动速度').onChange(requestRender);
  folder.add(p, 'moodStrength', 0, 1, .01).name('背景混色浓度').onChange(requestRender);
  folder.add(p, 'grain', 0, .1, .001).name('胶片颗粒').onChange(requestRender);
  folder.add(p, 'trail').name('显示空间光带').onChange(requestRender);
  folder.add(p, 'trailWidth', .004, .035, .001).name('光带粗细').onChange(requestRender);
  folder.add(p, 'trailOpacity', 0, 1, .01).name('光带亮度').onChange(requestRender);
  folder.add(p, 'sparkles').name('光带微粒').onChange(requestRender);
  folder.add(gallery, 'center').name('回到第一幅');
  folder.add({ reset() { gallery.reset(); folder.controllersRecursive().forEach(c => c.updateDisplay()); } }, 'reset').name('恢复画廊默认');
  folder.add(gallery, 'retry').name('重试图片加载');
  const status = document.createElement('div'); status.className = 'viewer-gallery-status';
  status.setAttribute('role', 'status'); folder.$children.appendChild(status); gallery.setStatusElement(status);
  const note = document.createElement('div'); note.className = 'viewer-effect-note';
  note.textContent = '滚轮或上下拖动画面，穿行五幅花卉；移动指针产生轻微视差。光带跟随穿行进度。关闭氛围动画后静止时不连续绘制，减少动态偏好下关闭呼吸与微粒。';
  folder.$children.appendChild(note);
  return folder;
}
