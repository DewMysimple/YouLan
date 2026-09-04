import * as THREE from 'three';

export const POLLEN_DEFAULTS = Object.freeze({
  enabled: true,
  animated: true,
  speed: 0.38,
  drift: 0.72,
  swirl: 0.58,
  size: 1,
  dustCount: 2200,
  pollenCount: 620,
  petalCount: 120,
  dustColor: '#fff2b8',
  pollenColor: '#ffb8e3',
  petalColor: '#b879ff',
  glow: 0.86,
  coreIntensity: 1.6,
  coreSize: 2.1,
});

export const POLLEN_LIMITS = Object.freeze({
  dust: 4000,
  pollen: 1200,
  petals: 300,
});

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildPollenGeometry(count, {
  seed = 1,
  width = 20,
  height = 12,
  depth = 18,
  size = [2, 5],
} = {}) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const colorMix = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const offset = index * 3;
    // A soft ellipsoid avoids the rectangular volume usually visible in
    // naive random particle fields while retaining deterministic placement.
    const radius = Math.cbrt(random());
    const azimuth = random() * Math.PI * 2;
    const vertical = random() * 2 - 1;
    const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    positions[offset] = Math.cos(azimuth) * radial * radius * width * 0.5;
    positions[offset + 1] = vertical * radius * height * 0.5;
    positions[offset + 2] = (random() * 2 - 1) * radius * depth * 0.5;
    sizes[index] = THREE.MathUtils.lerp(size[0], size[1], random() ** 1.7);
    phases[index] = random() * Math.PI * 2;
    colorMix[index] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('particleSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('particlePhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('particleColorMix', new THREE.BufferAttribute(colorMix, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const particleVertex = `
attribute float particleSize;
attribute float particlePhase;
attribute float particleColorMix;
uniform float pollenTime, pollenSpeed, pollenDrift, pollenSwirl, pollenSize, pollenPixelRatio;
varying float vColorMix, vPhase;
void main() {
  float t = pollenTime * pollenSpeed;
  vec3 p = position;
  float angle = t * .055 * pollenSwirl + sin(particlePhase + t * .13) * .055 * pollenSwirl;
  mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  p.xy = rotation * p.xy;
  p.x += sin(t * .54 + particlePhase + position.z * .17) * pollenDrift;
  p.y += cos(t * .43 + particlePhase * 1.37 + position.x * .11) * pollenDrift * .62;
  p.z += sin(t * .31 + particlePhase * .73) * pollenDrift * .45;
  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = max(1.0, particleSize * pollenSize * pollenPixelRatio * clamp(22.0 / -viewPosition.z, .48, 2.4));
  vColorMix = particleColorMix;
  vPhase = particlePhase + t * .2;
}`;

const particleFragment = `
uniform vec3 pollenColorA, pollenColorB;
uniform float pollenOpacity, pollenGlow, pollenShape;
varying float vColorMix, vPhase;
void main() {
  vec2 q = gl_PointCoord - .5;
  float alpha;
  if (pollenShape < .5) {
    float d = length(q);
    alpha = smoothstep(.5, .06, d) * .72;
  } else if (pollenShape < 1.5) {
    float d = length(q * vec2(1.15, 1.55));
    float shell = smoothstep(.5, .08, d);
    float center = exp(-d * d * 28.0);
    alpha = shell * (.62 + center * .38);
  } else {
    float c = cos(vPhase), s = sin(vPhase);
    q = mat2(c, -s, s, c) * q;
    float d = length(q * vec2(1.85, .78));
    float body = smoothstep(.5, .1, d);
    float tapered = smoothstep(.54, .02, abs(q.x) + abs(q.y) * .42);
    alpha = body * tapered;
  }
  if (alpha < .01) discard;
  vec3 color = mix(pollenColorA, pollenColorB, vColorMix);
  gl_FragColor = vec4(color * pollenGlow * alpha, alpha * pollenOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function createParticleLayer(specification, sharedUniforms) {
  const geometry = buildPollenGeometry(specification.maximum, specification.geometry);
  const material = new THREE.ShaderMaterial({
    name: specification.name,
    uniforms: {
      ...sharedUniforms,
      pollenColorA: { value: new THREE.Color(specification.colors[0]) },
      pollenColorB: { value: new THREE.Color(specification.colors[1]) },
      pollenOpacity: { value: specification.opacity },
      pollenShape: { value: specification.shape },
    },
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Normal alpha compositing preserves purple/pink identity on the already
    // bright pastel backdrop. The central core remains additive and supplies
    // the concentrated glow without bleaching every particle white.
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.name = specification.name;
  points.frustumCulled = false;
  points.renderOrder = specification.renderOrder;
  return { points, geometry, material };
}

const coreVertex = `
varying vec2 vUv;
uniform float coreSize;
void main() {
  vUv = uv;
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  center.xy += position.xy * coreSize;
  gl_Position = projectionMatrix * center;
}`;

const coreFragment = `
varying vec2 vUv;
uniform float coreTime, coreIntensity;
void main() {
  vec2 q = vUv - .5;
  float r = length(q);
  float pulse = .94 + .06 * sin(coreTime * 1.35);
  float heart = exp(-r * r * 150.0);
  float halo = exp(-r * r * 18.0) * .7;
  float ring = exp(-abs(r - .205 * pulse) * 42.0) * .18;
  float rays = pow(max(0.0, .5 + .5 * cos(atan(q.y, q.x) * 8.0)), 9.0) * exp(-r * 8.0) * .12;
  float light = heart * 1.8 + halo + ring + rays;
  vec3 color = mix(vec3(.72, .36, 1.0), vec3(1.0, .93, .66), smoothstep(.3, 0.0, r));
  gl_FragColor = vec4(color * light * coreIntensity, light);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createPollenScene(scene, renderer, requestRender, { reducedMotion = false } = {}) {
  const parameters = { ...POLLEN_DEFAULTS, animated: !reducedMotion };
  const sharedUniforms = {
    pollenTime: { value: 0 },
    pollenSpeed: { value: parameters.speed },
    pollenDrift: { value: parameters.drift },
    pollenSwirl: { value: parameters.swirl },
    pollenSize: { value: parameters.size },
    pollenPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    pollenGlow: { value: parameters.glow },
  };
  const specifications = [
    { name: '远层微尘', maximum: POLLEN_LIMITS.dust, shape: 0, opacity: .4, renderOrder: -20,
      colors: ['#fff9d8', '#d8c8ff'], geometry: { seed: 107, width: 28, height: 17, depth: 28, size: [1.2, 3.4] } },
    { name: '中层花粉', maximum: POLLEN_LIMITS.pollen, shape: 1, opacity: .58, renderOrder: -10,
      colors: ['#ffb8e3', '#fff0a8'], geometry: { seed: 211, width: 21, height: 12, depth: 20, size: [7, 18] } },
    { name: '近层幽兰花瓣', maximum: POLLEN_LIMITS.petals, shape: 2, opacity: .68, renderOrder: 0,
      colors: ['#b879ff', '#ffb9e8'], geometry: { seed: 307, width: 17, height: 10, depth: 15, size: [18, 42] } },
  ];
  const root = new THREE.Group();
  root.name = '场景2·幽兰花粉星云';
  root.position.z = -7;
  const layers = specifications.map((specification) => createParticleLayer(specification, sharedUniforms));
  layers.forEach(({ points }) => root.add(points));

  const coreMaterial = new THREE.ShaderMaterial({
    name: '中央能量核心材质',
    uniforms: {
      coreTime: sharedUniforms.pollenTime,
      coreIntensity: { value: parameters.coreIntensity },
      coreSize: { value: parameters.coreSize },
    },
    vertexShader: coreVertex,
    fragmentShader: coreFragment,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), coreMaterial);
  core.name = '中央能量核心';
  core.renderOrder = 10;
  root.add(core);
  scene.add(root);

  let disposed = false;
  let active = false;
  let previousTime = null;
  let panelRefresh = () => {};

  function apply() {
    if (disposed) return;
    root.visible = parameters.enabled;
    layers[0].geometry.setDrawRange(0, parameters.dustCount);
    layers[1].geometry.setDrawRange(0, parameters.pollenCount);
    layers[2].geometry.setDrawRange(0, parameters.petalCount);
    sharedUniforms.pollenSpeed.value = parameters.speed;
    sharedUniforms.pollenDrift.value = parameters.drift;
    sharedUniforms.pollenSwirl.value = parameters.swirl;
    sharedUniforms.pollenSize.value = parameters.size;
    sharedUniforms.pollenGlow.value = parameters.glow;
    layers[0].material.uniforms.pollenColorA.value.set(parameters.dustColor);
    layers[0].material.uniforms.pollenColorB.value.set(parameters.pollenColor);
    layers[1].material.uniforms.pollenColorA.value.set(parameters.pollenColor);
    layers[1].material.uniforms.pollenColorB.value.set(parameters.dustColor);
    layers[2].material.uniforms.pollenColorA.value.set(parameters.petalColor);
    layers[2].material.uniforms.pollenColorB.value.set(parameters.pollenColor);
    coreMaterial.uniforms.coreIntensity.value = parameters.coreIntensity;
    coreMaterial.uniforms.coreSize.value = parameters.coreSize;
    panelRefresh();
    requestRender();
  }

  function update(timestamp, visible = true) {
    if (disposed || !active) return false;
    sharedUniforms.pollenPixelRatio.value = Math.min(renderer.getPixelRatio(), 2);
    const animate = parameters.enabled && parameters.animated && parameters.speed > 0 && visible;
    if (animate && previousTime !== null) {
      sharedUniforms.pollenTime.value += Math.min(Math.max((timestamp - previousTime) / 1000, 0), .1);
    }
    previousTime = animate ? timestamp : null;
    return animate;
  }

  function setReducedMotion(value) {
    reducedMotion = value;
    if (value) parameters.animated = false;
    previousTime = null;
    panelRefresh();
  }

  function restore() {
    Object.assign(parameters, POLLEN_DEFAULTS, { animated: !reducedMotion });
    sharedUniforms.pollenTime.value = 0;
    previousTime = null;
    apply();
  }

  apply();
  return {
    parameters,
    root,
    layers,
    core,
    apply,
    update,
    restore,
    setReducedMotion,
    onPanelRefresh(callback) { panelRefresh = callback; },
    activate() { active = true; previousTime = null; requestRender(); },
    deactivate() { active = false; previousTime = null; },
    pauseClock() { previousTime = null; },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      layers.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); });
      core.geometry.dispose();
      coreMaterial.dispose();
      panelRefresh = () => {};
    },
  };
}

export function bindPollenPanel(gui, pollen, requestRender) {
  const folder = gui.addFolder('场景2·花粉星云');
  const p = pollen.parameters;
  const update = () => { pollen.apply(); requestRender(); };
  folder.add(p, 'enabled').name('启用粒子场景').onChange(update);
  folder.add(p, 'animated').name('粒子流动').onChange(update);
  folder.add(p, 'speed', 0, 2, .01).name('流动速度').onChange(update);
  folder.add(p, 'drift', 0, 2, .01).name('漂浮强度').onChange(update);
  folder.add(p, 'swirl', 0, 2, .01).name('漩涡强度').onChange(update);
  folder.add(p, 'size', .25, 2.5, .01).name('整体尺寸').onChange(update);
  folder.add(p, 'dustCount', 0, POLLEN_LIMITS.dust, 1).name('远层微尘数量').onChange(update);
  folder.add(p, 'pollenCount', 0, POLLEN_LIMITS.pollen, 1).name('中层花粉数量').onChange(update);
  folder.add(p, 'petalCount', 0, POLLEN_LIMITS.petals, 1).name('近层花瓣数量').onChange(update);
  folder.addColor(p, 'dustColor').name('微尘颜色').onChange(update);
  folder.addColor(p, 'pollenColor').name('花粉颜色').onChange(update);
  folder.addColor(p, 'petalColor').name('花瓣颜色').onChange(update);
  folder.add(p, 'glow', 0, 3, .01).name('粒子柔光').onChange(update);
  folder.add(p, 'coreIntensity', 0, 6, .01).name('能量核心强度').onChange(update);
  folder.add(p, 'coreSize', .5, 8, .01).name('能量核心大小').onChange(update);
  folder.add({ reset: () => pollen.restore() }, 'reset').name('重置粒子场景');
  const status = document.createElement('div');
  status.className = 'viewer-particle-status';
  folder.$children.appendChild(status);
  const note = document.createElement('div');
  note.className = 'viewer-effect-note';
  note.textContent = '场景2与标本几何、切片计数、透明排序和局部 Bloom 代理完全分离。三层粒子都使用批量几何和 GPU 动画，数量变化不会创建大量独立 Mesh。减少动态效果偏好开启时自动暂停。';
  folder.$children.appendChild(note);
  function refresh() {
    status.textContent = `三层粒子：${p.dustCount} 微尘 / ${p.pollenCount} 花粉 / ${p.petalCount} 花瓣`;
    folder.controllers.filter((controller) => !['启用粒子场景', '重置粒子场景'].includes(controller._name))
      .forEach((controller) => controller.enable(p.enabled));
    folder.controllers.find((controller) => controller._name === '流动速度')?.enable(p.enabled && p.animated);
  }
  pollen.onPanelRefresh(refresh);
  refresh();
  return folder;
}
