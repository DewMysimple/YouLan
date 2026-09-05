import * as THREE from 'three';
import { PAINTED_VERTEX, PAINTED_FRAGMENT, SKY_VERTEX, SKY_FRAGMENT, GLITTER_VERTEX, GLITTER_FRAGMENT } from './paintedFireworkShaders.js';
import { createFireworkAudio } from './fireworkAudio.js';

export const PAINTED_LIMITS = Object.freeze({ shells: 10, branches: 64, tips: 48, segments: 44 });
export const PAINTED_DEFAULTS = Object.freeze({
  enabled: true, playing: true, autoLaunch: true, speed: 1, timeline: 2.8,
  interval: 1.25, size: 1, density: 56, curl: .32, brushWidth: 1.05,
  secondary: .65, tailRatio: .13, brilliance: 1.35, grain: .6, depthSpread: .72,
  palette: '缤纷交响', skyStyle: '蓝色纸幕', skyTop: '#07449a', skyBottom: '#087aca',
  sound: true, volume: .28,
  bloomEnabled: true, bloomStrength: .18, bloomRadius: .3, bloomThreshold: .95,
  quality: '高质量',
});
const PALETTES = {
  '缤纷交响': ['#ff388b', '#44eaff', '#ffe46c', '#bd77ff', '#42ff9a', '#ff92b7'],
  '冰川薄荷': ['#79edff', '#d0fff4', '#8ebdff', '#66e8c1', '#fffbc9'],
  '玫瑰金雨': ['#ff77b6', '#ffd68e', '#fff0c9', '#de8cff', '#ffae96'],
};
export function fireworkRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ value >>> 15, value | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function buildPaintedRibbons() {
  const { shells, branches, tips, segments } = PAINTED_LIMITS;
  const positions = [], uv = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    positions.push(0, -1, 0, 0, 1, 0); uv.push(i / segments, 0, i / segments, 1);
    if (i < segments) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const count = shells * (branches + tips + 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.instanceCount = count;
  for (const [name, width] of [['stroke', 4], ['parentStroke', 3], ['shellIndex', 1], ['ink', 3], ['tipInk', 3]]) {
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(count * width), width).setUsage(THREE.DynamicDrawUsage));
  }
  return geometry;
}

export function createPaintedFireworks(scene, renderer, requestRender, { reducedMotion = false, audioFactory = createFireworkAudio, camera, controls } = {}) {
  const p = { ...PAINTED_DEFAULTS, playing: !reducedMotion, autoLaunch: !reducedMotion };
  const audio = audioFactory();
  const shellData = Array.from({ length: PAINTED_LIMITS.shells }, () => new THREE.Vector4(.5, .6, -100, .32));
  const centers = Array.from({ length: PAINTED_LIMITS.shells }, () => new THREE.Vector3());
  const uniforms = {
    shells: { value: shellData }, centers: { value: centers },
    resolution: { value: new THREE.Vector2(renderer.domElement?.clientWidth || 1440, renderer.domElement?.clientHeight || 900) }, clockTime: { value: p.timeline },
    sizeScale: { value: p.size }, curl: { value: p.curl }, brushWidth: { value: p.brushWidth },
    secondary: { value: p.secondary }, tailRatio: { value: p.tailRatio }, brilliance: { value: p.brilliance }, grain: { value: p.grain },
    pixelRatio: { value: 1 },
    depthSpread: { value: p.depthSpread },
  };
  const geometry = buildPaintedRibbons();
  const material = new THREE.ShaderMaterial({
    name: '彩色花火·纸面笔触', uniforms, vertexShader: PAINTED_VERTEX, fragmentShader: PAINTED_FRAGMENT,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const ribbons = new THREE.Mesh(geometry, material);
  ribbons.name = '彩色花火·固定批量色带'; ribbons.frustumCulled = false; ribbons.renderOrder = 2;
  const skyUniforms = {
    skyTop: { value: new THREE.Color(p.skyTop) }, skyBottom: { value: new THREE.Color(p.skyBottom) },
    grain: uniforms.grain, skyTime: uniforms.clockTime,
  };
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    name: '蓝色纸幕', uniforms: skyUniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT,
    depthTest: false, depthWrite: false, toneMapped: false,
  }));
  sky.name = '彩色花火·独立纸幕'; sky.frustumCulled = false; sky.renderOrder = -100;
  const root = new THREE.Group(); root.name = '场景3·指尖彩色花火'; root.add(sky, ribbons); scene.add(root);
  const sparkGeometry = new THREE.BufferGeometry();
  const sparkData = [];
  const sparkRandom = fireworkRandom(2026);
  for (let i = 0; i < PAINTED_LIMITS.shells; i++) for (let j = 0; j < 32; j++) sparkData.push(i, j === 0 ? 0 : 1, sparkRandom());
  sparkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(sparkData.length), 3));
  sparkGeometry.setAttribute('spark', new THREE.Float32BufferAttribute(sparkData, 3));
  const glitter = new THREE.Points(sparkGeometry, new THREE.ShaderMaterial({
    name: '花火·短暂爆心与碎星', uniforms, vertexShader: GLITTER_VERTEX, fragmentShader: GLITTER_FRAGMENT,
    transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  glitter.name = '花火·爆心与碎星'; glitter.frustumCulled = false; glitter.renderOrder = 3; root.add(glitter);
  const shells = Array.from({ length: PAINTED_LIMITS.shells }, () => ({ born: -100, sounded: true, seed: 0 }));
  const canvas = renderer.domElement;
  let active = false, disposed = false, previous = null, nextLaunch = 0, serial = 0;
  let lastInput = -Infinity, held = null;
  let refresh = () => {};
  const color = new THREE.Color();
  const perShell = PAINTED_LIMITS.branches + PAINTED_LIMITS.tips + 1;

  function paintSlot(slot, seed) {
    const random = fireworkRandom(seed);
    const palette = PALETTES[p.palette] || PALETTES['缤纷交响'];
    // Some crowns use one related palette; others alternate vivid/pastel inks.
    const monochrome = random() < .3;
    const base = Math.floor(random() * palette.length);
    for (let i = 0; i < perShell; i++) {
      const index = slot * perShell + i;
      const tip = i >= PAINTED_LIMITS.branches;
      const rocket = i === perShell - 1;
      const angle = tip ? (i % 6) / 6 * Math.PI * 2 + slot * .27 : i / Math.max(p.density, 1) * Math.PI * 2 + (random() - .5) * .1;
      const depth = tip ? .8 : Math.sqrt(1 - Math.pow(random() * .97, 2));
      const seedValue = tip ? (i - PAINTED_LIMITS.branches) / PAINTED_LIMITS.tips : random();
      geometry.attributes.stroke.setXYZW(index, angle, i >= p.density && !tip ? 0 : depth, seedValue, rocket ? 2 : tip ? 1 : 0);
      geometry.attributes.shellIndex.setX(index, slot);
      const ink = palette[monochrome ? base : Math.floor(random() * palette.length)];
      color.set(ink); geometry.attributes.ink.setXYZ(index, color.r, color.g, color.b);
      color.lerp(new THREE.Color('#fff8e9'), monochrome ? .2 : .035);
      geometry.attributes.tipInk.setXYZ(index, color.r, color.g, color.b);
    }
    // Choose eight actual outer branches, not independent approximate endpoints.
    const parents = [];
    for (let group = 0; group < 8; group++) {
      let best = Math.floor(group * p.density / 8), bestDepth = -1;
      for (let i = best; i < Math.floor((group + 1) * p.density / 8); i++) {
        const depth = geometry.attributes.stroke.getY(slot * perShell + i);
        if (depth > bestDepth) { best = i; bestDepth = depth; }
      }
      parents.push(slot * perShell + best);
    }
    for (let i = 0; i < PAINTED_LIMITS.tips; i++) {
      const parent = parents[Math.floor(i / 6)];
      geometry.attributes.parentStroke.setXYZ(slot * perShell + PAINTED_LIMITS.branches + i,
        geometry.attributes.stroke.getX(parent), geometry.attributes.stroke.getY(parent), geometry.attributes.stroke.getZ(parent));
    }
    for (const name of ['stroke', 'parentStroke', 'shellIndex', 'ink', 'tipInk']) geometry.attributes[name].needsUpdate = true;
  }

  function launch(x, y, { born = p.timeline, seed = ++serial * 731 + 1709, silent = false, world = null } = {}) {
    if (disposed) return false;
    let slot = shells.findIndex(shell => p.timeline - shell.born > 5.5);
    // Never interrupt a visible flower when the bounded pool is full.
    if (slot < 0) return false;
    const random = fireworkRandom(seed);
    shells[slot] = { born, seed, sounded: silent || p.timeline - born >= .95 };
    shellData[slot].set(THREE.MathUtils.clamp(x, .05, .95), THREE.MathUtils.clamp(y, .16, .9), born, .28 + random() * .1);
    if (world) centers[slot].copy(world);
    else centers[slot].set((x-.5)*23.4*uniforms.resolution.value.x/uniforms.resolution.value.y, (y-.5)*23.4+.4, -8);
    paintSlot(slot, seed);
    if (!silent) audio.launch(x * 2 - 1);
    requestRender(); return true;
  }

  function scheduled(born, index, silent = false) {
    const random = fireworkRandom(index * 179 + 901);
    // Reserve the rightmost area for the existing GUI; no extra overlay UI.
    launch(.16 + random() * .56, .46 + random() * .33, { born, seed: index * 173 + 829, silent });
  }
  function rebuild(time) {
    shells.forEach((shell, i) => { shell.born = -100; shell.sounded = true; shellData[i].z = -100; });
    p.timeline = Math.max(0, Number(time) || 0); uniforms.clockTime.value = p.timeline;
    const first = Math.max(0, Math.ceil((p.timeline - 5.5) / p.interval));
    for (let i = first; i <= Math.floor(p.timeline / p.interval); i++) scheduled(i * p.interval, i, true);
    nextLaunch = (Math.floor(p.timeline / p.interval) + 1) * p.interval;
    audio.stop(); previous = null; requestRender();
  }
  function apply() {
    root.visible = active && p.enabled;
    for (const [name, key] of [['sizeScale', 'size'], ['curl', 'curl'], ['brushWidth', 'brushWidth'], ['secondary', 'secondary'], ['tailRatio', 'tailRatio'], ['brilliance', 'brilliance'], ['grain', 'grain'], ['depthSpread','depthSpread']]) uniforms[name].value = p[key];
    skyUniforms.skyTop.value.set(p.skyTop); skyUniforms.skyBottom.value.set(p.skyBottom);
    for (let slot = 0; slot < shells.length; slot++) paintSlot(slot, shells[slot].seed);
    audio.configure(p.sound, p.volume);
    if (!p.playing || !p.enabled) { audio.stop(); previous = null; held = null; }
    nextLaunch = p.timeline + p.interval;
    refresh(); requestRender();
  }
  function setSize(width, height) {
    uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));
    uniforms.pixelRatio.value = renderer.getPixelRatio?.() || 1; requestRender();
  }
  function input(event) {
    if (!active || !p.enabled || disposed || globalThis.document?.hidden || (event.button !== undefined && event.button !== 0)) return;
    const now = performance.now();
    if (now - lastInput < 120) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;
    let world = null;
    if (camera) {
      camera.updateMatrixWorld();
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(x*2-1,y*2-1),camera);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),controls?.target || new THREE.Vector3(0,.4,-8));
      world = raycaster.ray.intersectPlane(plane,new THREE.Vector3());
      if (!world) return;
    }
    lastInput = now;
    if (reducedMotion) {
      // A static crown is still useful feedback when motion is reduced.
      launch(x, y, { born: p.timeline - 2, silent: true, world });
    } else {
      p.playing = true; previous = null;
      // Unlock synchronously in the trusted gesture; no background autoplay.
      audio.unlock().then(ok => { if (ok && active && p.playing && !disposed) refresh(); });
      launch(x, y, { world });
    }
    refresh(); requestRender();
  }
  function pointerDown(event) {
    if (!active || !p.enabled) return;
    if (held || event.isPrimary === false) { if (held) held.dragged = true; return; }
    if (event.button === 0) held = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
  }
  function pointerMove(event) {
    if (held?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX-held.x,event.clientY-held.y)>6) held.dragged = true;
  }
  function pointerUp(event) { const click = held?.id === event.pointerId && !held.dragged; held = null; if (click) input(event); }
  function release() { held = null; }
  canvas?.addEventListener('pointerdown', pointerDown);
  canvas?.addEventListener('pointermove', pointerMove);
  canvas?.addEventListener('pointerleave', release);
  canvas?.addEventListener('pointercancel', release);
  globalThis.window?.addEventListener?.('pointerup', pointerUp);
  globalThis.window?.addEventListener?.('blur', release);
  function update(timestamp, visible = true) {
    if (disposed || !active) return false;
    if (!visible || !p.enabled || !p.playing || p.speed <= 0) { previous = null; audio.stop(); return false; }
    const delta = previous === null ? 0 : Math.min(.1, Math.max(0, (timestamp - previous) / 1000)) * p.speed;
    previous = timestamp; p.timeline += delta; uniforms.clockTime.value = p.timeline;
    if (p.autoLaunch && p.timeline >= nextLaunch) {
      scheduled(p.timeline, ++serial); nextLaunch = p.timeline + p.interval;
    }
    for (let i = 0; i < shells.length; i++) {
      const shell = shells[i];
      if (!shell.sounded && p.timeline - shell.born >= .95) { audio.burst(shellData[i].x * 2 - 1); shell.sounded = true; }
    }
    refresh();
    // Manual mode drains naturally, then stops requesting frames.
    return p.autoLaunch || shells.some(shell => p.timeline - shell.born < 5.5);
  }
  rebuild(p.timeline); apply();
  return {
    parameters: p, root, ribbons, sky, audio, shells, apply, update, launch, setSize,
    seek(time) { p.playing = false; rebuild(time); refresh(); },
    replay() { p.playing = !reducedMotion; rebuild(0); refresh(); },
    finale() {
      if (!active || !p.enabled) return;
      if (!reducedMotion) { p.playing = true; audio.unlock(); }
      for (let i = 0; i < 5; i++) launch(.15 + i * .135, .53 + Math.sin(i * 1.8) * .13, { born: p.timeline + (reducedMotion ? -2 : i * .14), silent: reducedMotion });
      previous = null; requestRender();
    },
    restore() { Object.assign(p, PAINTED_DEFAULTS, { playing: !reducedMotion, autoLaunch: !reducedMotion }); rebuild(p.timeline); apply(); },
    activate() { active = true; root.visible = p.enabled; previous = null; requestRender(); },
    deactivate() { active = false; root.visible = false; previous = null; release(); audio.stop(); },
    pauseClock() { previous = null; release(); audio.stop(); },
    setReducedMotion(value) { reducedMotion = value; if (value) { p.playing = false; p.autoLaunch = false; } previous = null; audio.stop(); refresh(); requestRender(); },
    onRefresh(callback) { refresh = callback; },
    get renderScale() { return p.quality === '高质量' ? 1 : p.quality === '均衡' ? .8 : .6; },
    get activeCount() { return shells.filter(shell => p.timeline - shell.born >= 0 && p.timeline - shell.born < 5.5).length; },
    dispose() {
      if (disposed) return; disposed = true;
      canvas?.removeEventListener('pointerdown', pointerDown); canvas?.removeEventListener('pointermove', pointerMove);
      canvas?.removeEventListener('pointerleave', release); canvas?.removeEventListener('pointercancel', release);
      globalThis.window?.removeEventListener?.('pointerup', pointerUp); globalThis.window?.removeEventListener?.('blur', release);
      root.removeFromParent(); geometry.dispose(); material.dispose(); sky.geometry.dispose(); sky.material.dispose(); sparkGeometry.dispose(); glitter.material.dispose(); audio.dispose(); refresh = () => {};
    },
  };
}
