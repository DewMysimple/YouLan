import { SCENE_LABELS } from './sceneCatalog.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAX_BLOOM_LAYERS, PETAL_POOL_SIZE, samplePetals, splitPetalGeometry, installPetalDeformation } from './bloomPetals.js';


const ASSET_URL = '/models/azalea-bloom.glb';
const SUBSURFACE_URL = '/models/azalea-subsurface.png';
const MAX_GENERATIONS = MAX_BLOOM_LAYERS;

export const INFINITE_BLOOM_DEFAULTS = Object.freeze({
  enabled: true,
  playing: true,
  loop: true,
  speed: 1,
  timeline: 0,
  cycleDuration: 10,
  generations: 7,
  openDuration: 0.86,
  holdDuration: 0.18,
  fallDuration: 4.8,
  wind: 1.2,
  gravity: 1.05,
  goldenAngle: 32,
  flowerScale: 1,
  depthSpacing: 0.22,
  breeze: 0.22,
  showBranch: false,
  petalTint: '#fff7f4',
  roughness: 0.9,
  normalStrength: .55,
  subsurfaceStrength: 0.72,
  subsurfaceColor: '#ff7f72',
  environmentIntensity: 1.3,
  keyLight: 3.4,
  rimLight: 1.65,
  backgroundFlow: true,
  backgroundSpeed: 0.12,
  backgroundStrength: 0.66,
  backgroundTop: '#101426',
  backgroundBottom: '#263b50',
  backgroundAccent: '#622642',
});

export const INFINITE_BLOOM_LIMITS = Object.freeze({
  generations: MAX_GENERATIONS,
});

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

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

function createBackdrop() {
  const uniforms = {
    bloomBackgroundTime: { value: 0 },
    bloomBackgroundFlow: { value: 1 },
    bloomBackgroundStrength: { value: INFINITE_BLOOM_DEFAULTS.backgroundStrength },
    bloomBackgroundTop: { value: new THREE.Color(INFINITE_BLOOM_DEFAULTS.backgroundTop) },
    bloomBackgroundBottom: { value: new THREE.Color(INFINITE_BLOOM_DEFAULTS.backgroundBottom) },
    bloomBackgroundAccent: { value: new THREE.Color(INFINITE_BLOOM_DEFAULTS.backgroundAccent) },
  };
  const material = new THREE.ShaderMaterial({
    name: '场景5·深夜花园背景',
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vBloomDirection;
      void main() {
        vBloomDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vBloomDirection;
      uniform float bloomBackgroundTime, bloomBackgroundFlow, bloomBackgroundStrength;
      uniform vec3 bloomBackgroundTop, bloomBackgroundBottom, bloomBackgroundAccent;
      void main() {
        vec3 direction = normalize(vBloomDirection);
        float vertical = smoothstep(-.78, .82, direction.y);
        float time = bloomBackgroundTime * bloomBackgroundFlow;
        float ribbonA = sin(direction.x * 5.2 + direction.y * 3.1 + time * .37);
        float ribbonB = cos(direction.z * 4.4 - direction.y * 5.8 - time * .23);
        float ribbons = smoothstep(.32, .95, ribbonA * .55 + ribbonB * .45);
        float horizon = exp(-pow(direction.y + .18, 2.0) * 7.5);
        vec3 color = mix(bloomBackgroundBottom, bloomBackgroundTop, vertical);
        color = mix(color, bloomBackgroundAccent, (ribbons * .32 + horizon * .18) * bloomBackgroundStrength);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(72, 40, 24), material);
  mesh.name = '场景5·独立深夜花园';
  mesh.renderOrder = -1000;
  return { mesh, material, uniforms };
}

function createDust() {
  const count = 520;
  const random = seededRandom(2026090417);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const radius = THREE.MathUtils.lerp(8, 32, random() ** .62);
    const angle = random() * Math.PI * 2;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = THREE.MathUtils.lerp(-9, 12, random());
    positions[index * 3 + 2] = -Math.sin(angle) * radius;
    sizes[index] = THREE.MathUtils.lerp(1.2, 4.4, random() ** 2.2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('bloomDustSize', new THREE.BufferAttribute(sizes, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 46);
  const material = new THREE.ShaderMaterial({
    name: '场景5·浮尘材质',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { pixelRatio: { value: 1 }, dustTime: { value: 0 } },
    vertexShader: `
      attribute float bloomDustSize;
      uniform float pixelRatio, dustTime;
      varying float vTwinkle;
      void main() {
        vec3 p = position;
        p.y += sin(dustTime * .18 + position.x * .21 + position.z * .13) * .22;
        vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = bloomDustSize * pixelRatio * clamp(18.0 / -viewPosition.z, .42, 1.8);
        vTwinkle = .55 + .45 * sin(dustTime * .46 + position.x * 2.7);
      }
    `,
    fragmentShader: `
      varying float vTwinkle;
      void main() {
        float distanceToCenter = length(gl_PointCoord - .5);
        float alpha = smoothstep(.5, .06, distanceToCenter) * .34 * vTwinkle;
        if (alpha < .01) discard;
        gl_FragColor = vec4(vec3(1.0, .73, .58) * alpha, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.name = '场景5·缓慢浮尘';
  points.renderOrder = -100;
  return { points, geometry, material };
}

function installSubsurface(material, uniforms, deform = false) {
  material.onBeforeCompile = (shader) => {
    if (deform) installPetalDeformation(shader);
    shader.uniforms.azaleaSubsurfaceMap = uniforms.map;
    shader.uniforms.azaleaSubsurfaceStrength = uniforms.strength;
    shader.uniforms.azaleaSubsurfaceColor = uniforms.color;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform sampler2D azaleaSubsurfaceMap;
       uniform float azaleaSubsurfaceStrength;
       uniform vec3 azaleaSubsurfaceColor;`,
    ).replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
       float azaleaMask = texture2D(azaleaSubsurfaceMap, vMapUv).r;
       vec3 azaleaBase = texture2D(map, vMapUv).rgb;
       float azaleaRim = pow(1.0 - clamp(abs(dot(normal, geometryViewDir)), 0.0, 1.0), 2.4);
       reflectedLight.indirectDiffuse += azaleaBase * azaleaSubsurfaceColor * azaleaMask
         * azaleaSubsurfaceStrength * (0.42 + azaleaRim * 1.08);`,
    );
  };
  material.customProgramCacheKey = () => deform ? 'azalea-petal-curl-v2' : 'azalea-subsurface-v1';
}

function findMesh(root, name) {
  const object = root.getObjectByName(name);
  if (!object?.isMesh) throw new Error(`杜鹃花运行时资产缺少网格：${name}`);
  return object;
}

function disposeMaterialTextures(materials) {
  const textures = new Set();
  new Set(materials).forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value?.isTexture) textures.add(value);
    });
    material.dispose();
  });
  textures.forEach((texture) => texture.dispose());
}

export function createInfiniteBloomScene(scene, renderer, requestRender, {
  reducedMotion = false,
} = {}) {
  const parameters = { ...INFINITE_BLOOM_DEFAULTS, playing: !reducedMotion, backgroundFlow: !reducedMotion };
  const root = new THREE.Group();
  root.name = '场景5·无限花开根节点';
  root.position.set(0, .25, 0);
  scene.add(root);

  const backdrop = createBackdrop();
  const dust = createDust();
  scene.add(backdrop.mesh, dust.points);

  const ambient = new THREE.HemisphereLight('#fff0e8', '#4b1c27', 2.05);
  const key = new THREE.DirectionalLight('#ffd0b8', parameters.keyLight);
  key.position.set(-4.5, 5.5, 8);
  const rim = new THREE.DirectionalLight('#8ca8ff', parameters.rimLight);
  rim.position.set(5, 2, -7);
  scene.add(ambient, key, rim);

  let disposed = false;
  let active = false;
  let previousTimestamp = null;
  let elapsed = 0;
  let previousPanelTick = -1;
  let branch = null;
  const petalBatches = [];
  let sourceGeometry = null;
  let petalMaterial = null;
  let branchMaterial = null;
  let subsurfaceTexture = null;
  let loadError = null;
  let panelRefresh = () => {};
  let modelResources = [];

  const subsurfaceUniforms = {
    map: { value: null },
    strength: { value: parameters.subsurfaceStrength },
    color: { value: new THREE.Color(parameters.subsurfaceColor) },
  };
  const matrixObject = new THREE.Object3D();
  const color = new THREE.Color();
  const turn = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const tumble = new THREE.Quaternion();
  const axisZ = new THREE.Vector3(0, 0, 1);
  const axisX = new THREE.Vector3(1, 0, 0);
  const flightEuler = new THREE.Euler();
  const center = new THREE.Vector3();
  const pivot = new THREE.Vector3();

  function applyMaterialParameters() {
    if (!petalMaterial || !branchMaterial) return;
    petalMaterial.color.set(parameters.petalTint);
    petalMaterial.roughness = parameters.roughness;
    petalMaterial.normalScale.setScalar(parameters.normalStrength);
    petalMaterial.envMapIntensity = parameters.environmentIntensity;
    petalMaterial.specularIntensity = .22;
    petalMaterial.clearcoat = 0;
    branchMaterial.roughness = Math.min(parameters.roughness + .08, 1);
    branchMaterial.normalScale.setScalar(parameters.normalStrength);
    branchMaterial.envMapIntensity = parameters.environmentIntensity;
    subsurfaceUniforms.strength.value = parameters.subsurfaceStrength;
    subsurfaceUniforms.color.value.set(parameters.subsurfaceColor);
    petalMaterial.needsUpdate = true;
    branchMaterial.needsUpdate = true;
  }

  function updateInstances() {
    if (!petalBatches.length) return;
    const samples = samplePetals(elapsed, parameters);
    const counts = [0, 0, 0, 0, 0];
    for (const petal of samples) {
      if (!petal.visible) continue;
      const type = ((petal.id % 5) + 5) % 5;
      const batch = petalBatches[type];
      const slot = counts[type]++;
      if (slot >= PETAL_POOL_SIZE) throw new Error('Petal pool capacity exceeded');
      turn.setFromAxisAngle(axisZ, petal.angle);
      tilt.setFromAxisAngle(axisX, petal.tilt);
      matrixObject.quaternion.copy(turn).multiply(tilt);
      matrixObject.position.set(-Math.sin(petal.angle) * petal.radius, Math.cos(petal.angle) * petal.radius, petal.z);
      matrixObject.scale.setScalar(petal.scale);
      if (petal.falling) {
        // Rotate about the petal's center, not the flower attachment point.
        pivot.set(0, 1.2, .1).multiplyScalar(petal.scale);
        center.copy(pivot).applyQuaternion(matrixObject.quaternion).add(matrixObject.position);
        flightEuler.set(petal.tumbleX, petal.tumbleY, petal.tumbleZ);
        tumble.setFromEuler(flightEuler);
        matrixObject.quaternion.premultiply(tumble);
        matrixObject.position.copy(center).sub(pivot.applyQuaternion(matrixObject.quaternion));
        matrixObject.position.x += petal.driftX;
        matrixObject.position.y += petal.driftY;
        matrixObject.position.z += petal.driftZ;
      }
      matrixObject.updateMatrix();
      batch.setMatrixAt(slot, matrixObject.matrix);
      batch.geometry.attributes.petalBend.setX(slot, petal.bend);
      batch.geometry.attributes.petalFade.setX(slot, petal.fade);
      color.setHSL(.99, .07, .89 + petal.open * .09);
      batch.setColorAt(slot, color);
    }
    petalBatches.forEach((batch, i) => {
      batch.count = counts[i];
      batch.instanceMatrix.needsUpdate = true;
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      batch.geometry.attributes.petalBend.needsUpdate = true;
      batch.geometry.attributes.petalFade.needsUpdate = true;
    });
    if (scene.userData.infiniteBloom?.ready) {
      scene.userData.infiniteBloom.petals = samples;
      scene.userData.infiniteBloom.elapsed = elapsed;
    }
  }

  function apply() {
    if (disposed) return;
    root.visible = parameters.enabled;
    if (branch) branch.visible = parameters.showBranch;
    key.intensity = parameters.keyLight;
    rim.intensity = parameters.rimLight;
    backdrop.uniforms.bloomBackgroundFlow.value = parameters.backgroundFlow
      ? parameters.backgroundSpeed : 0;
    backdrop.uniforms.bloomBackgroundStrength.value = parameters.backgroundStrength;
    backdrop.uniforms.bloomBackgroundTop.value.set(parameters.backgroundTop);
    backdrop.uniforms.bloomBackgroundBottom.value.set(parameters.backgroundBottom);
    backdrop.uniforms.bloomBackgroundAccent.value.set(parameters.backgroundAccent);
    applyMaterialParameters();
    updateInstances();
    panelRefresh();
    requestRender();
  }

  function restore() {
    Object.assign(parameters, INFINITE_BLOOM_DEFAULTS, { playing: !reducedMotion, backgroundFlow: !reducedMotion });
    elapsed = 0;
    previousTimestamp = null;
    apply();
  }

  const ready = Promise.all([
    new GLTFLoader().loadAsync(ASSET_URL),
    new THREE.TextureLoader().loadAsync(SUBSURFACE_URL),
  ]).then(([gltf, loadedSubsurface]) => {
    if (disposed) {
      gltf.scene.traverse((object) => {
        object.geometry?.dispose();
        if (object.material) disposeMaterialTextures([object.material]);
      });
      loadedSubsurface.dispose();
      return;
    }
    const bloomSource = findMesh(gltf.scene, 'AZALEA_BLOOM');
    const branchSource = findMesh(gltf.scene, 'AZALEA_BRANCH');

    subsurfaceTexture = loadedSubsurface;
    subsurfaceTexture.name = '杜鹃花次表面遮罩';
    subsurfaceTexture.colorSpace = THREE.NoColorSpace;
    subsurfaceTexture.flipY = false;
    subsurfaceTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    subsurfaceUniforms.map.value = subsurfaceTexture;

    petalMaterial = bloomSource.material.clone();
    petalMaterial.name = '场景5·杜鹃花瓣真实材质';
    petalMaterial.side = THREE.DoubleSide;
    petalMaterial.vertexColors = true;
    petalMaterial.emissive.set('#210807');
    petalMaterial.emissiveIntensity = .08;
    petalMaterial.sheen = .16;
    petalMaterial.sheenColor.set('#ff8e82');
    petalMaterial.sheenRoughness = .82;
    branchMaterial = branchSource.material.clone();
    branchMaterial.name = '场景5·杜鹃枝叶真实材质';
    branchMaterial.side = THREE.DoubleSide;
    installSubsurface(petalMaterial, subsurfaceUniforms, true);
    installSubsurface(branchMaterial, subsurfaceUniforms);

    sourceGeometry = bloomSource.geometry;
    splitPetalGeometry(sourceGeometry).forEach((geometry, index) => {
      const batch = new THREE.InstancedMesh(geometry, petalMaterial, PETAL_POOL_SIZE);
      batch.name = `场景5·独立花瓣批次${index + 1}`;
      batch.frustumCulled = false;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      petalBatches.push(batch);
      root.add(batch);
    });

    branch = new THREE.Mesh(branchSource.geometry, branchMaterial);
    branch.name = '场景5·真实枝叶与花蕊';
    branch.frustumCulled = false;
    root.add(branch);
    modelResources = [bloomSource.material, branchSource.material];

    scene.userData.infiniteBloom = {
      ready: true,
      petalComponents: 5,
      sourceComponents: 32,
      maximumGenerations: MAX_GENERATIONS,
      sourceVertices: bloomSource.geometry.attributes.position.count,
      branchVertices: branchSource.geometry.attributes.position.count,
      deformation: 'per-petal-arc-bend',
      petalBatches,
    };
    apply();
  }).catch((error) => {
    loadError = error instanceof Error ? error : new Error(String(error));
    scene.userData.infiniteBloom = { ready: false, error: loadError.message };
    console.error('场景5杜鹃花资产加载失败：', loadError);
    panelRefresh();
    requestRender();
  });

  function update(timestamp, visible = true) {
    if (disposed || !active) return false;
    const animated = parameters.enabled && parameters.playing && parameters.speed > 0 && visible;
    const backgroundAnimated = parameters.enabled && parameters.backgroundFlow
      && parameters.backgroundSpeed > 0 && visible;
    if ((animated || backgroundAnimated) && previousTimestamp !== null) {
      const delta = Math.min(Math.max((timestamp - previousTimestamp) / 1000, 0), .1);
      if (animated) {
        elapsed += delta * parameters.speed;
        // Absolute time preserves birth identities and flights across cycles.
        if (!parameters.loop) {
          elapsed = Math.min(elapsed, parameters.cycleDuration);
          if (elapsed >= parameters.cycleDuration) parameters.playing = false;
        }
        parameters.timeline = parameters.loop ? (elapsed / parameters.cycleDuration) % 1 : elapsed / parameters.cycleDuration;
        updateInstances();
        const panelTick = Math.floor(elapsed * 10);
        if (panelTick !== previousPanelTick) {
          previousPanelTick = panelTick;
          panelRefresh();
        }
      }
      if (backgroundAnimated) backdrop.uniforms.bloomBackgroundTime.value += delta;
      dust.material.uniforms.dustTime.value += delta;
    }
    dust.material.uniforms.pixelRatio.value = Math.min(renderer.getPixelRatio(), 2);
    previousTimestamp = animated || backgroundAnimated ? timestamp : null;
    return animated || backgroundAnimated;
  }

  function setReducedMotion(value) {
    reducedMotion = value;
    if (value) {
      parameters.playing = false;
      parameters.backgroundFlow = false;
    }
    previousTimestamp = null;
    panelRefresh();
  }

  apply();
  return {
    parameters,
    root,
    ready,
    get loadError() { return loadError; },
    get petalBatches() { return petalBatches; },
    get branch() { return branch; },
    apply,
    restore,
    update,
    setReducedMotion,
    onPanelRefresh(callback) { panelRefresh = callback; },
    activate() { active = true; previousTimestamp = null; requestRender(); },
    deactivate() { active = false; previousTimestamp = null; },
    pauseClock() { previousTimestamp = null; },
    seek(value) {
      parameters.timeline = clamp01(value);
      elapsed = parameters.timeline * parameters.cycleDuration;
      previousPanelTick = -1;
      updateInstances();
      panelRefresh();
      requestRender();
    },
    restart() {
      elapsed = 0;
      previousPanelTick = -1;
      parameters.timeline = 0;
      parameters.playing = !reducedMotion;
      previousTimestamp = null;
      updateInstances();
      panelRefresh();
      requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      backdrop.mesh.removeFromParent();
      dust.points.removeFromParent();
      ambient.removeFromParent(); key.removeFromParent(); rim.removeFromParent();
      backdrop.mesh.geometry.dispose(); backdrop.material.dispose();
      dust.geometry.dispose(); dust.material.dispose();
      petalBatches.forEach(batch => { batch.dispose(); batch.geometry.dispose(); });
      sourceGeometry?.dispose();
      branch?.geometry.dispose();
      disposeMaterialTextures([
        ...modelResources,
        petalMaterial,
        branchMaterial,
      ].filter(Boolean));
      subsurfaceTexture?.dispose();
      scene.userData.infiniteBloom = null;
      panelRefresh = () => {};
    },
  };
}

export function bindInfiniteBloomPanel(gui, flower, requestRender) {
  const folder = gui.addFolder(SCENE_LABELS.flower);
  const parameters = flower.parameters;
  const update = () => { flower.apply(); requestRender(); };

  folder.add(parameters, 'enabled').name('启用无限花开').onChange(update);
  folder.add(parameters, 'playing').name('播放绽放').onChange(update);
  folder.add(parameters, 'loop').name('无限循环').onChange(update);
  folder.add(parameters, 'speed', 0, 2, .01).name('绽放速度').onChange(update);
  const timelineController = folder.add(parameters, 'timeline', 0, 1, .001)
    .name('周期预览').onChange(value => flower.seek(value));
  folder.add({ restart: () => flower.restart() }, 'restart').name('重新播放花开');
  folder.add(parameters, 'cycleDuration', 3, 18, .1).name('花瓣在枝时长（秒）')
    .onChange(() => flower.seek(parameters.timeline));
  folder.add(parameters, 'generations', 1, MAX_GENERATIONS, 1).name('生长花瓣层数').onChange(update);
  folder.add(parameters, 'openDuration', .25, .95, .01).name('展开时长比例').onChange(update);
  folder.add(parameters, 'holdDuration', .05, .45, .01).name('盛放停留比例').onChange(update);
  folder.add(parameters, 'goldenAngle', 0, 180, .1).name('代际旋转角（°）').onChange(update);
  folder.add(parameters, 'flowerScale', .35, 2, .01).name('花冠整体尺寸').onChange(update);
  folder.add(parameters, 'depthSpacing', 0, .6, .01).name('代际纵深间距').onChange(update);
  folder.add(parameters, 'fallDuration', 2, 8, .1).name('飘落持续（秒）').onChange(update);
  folder.add(parameters, 'wind', 0, 2.5, .01).name('向右风力').onChange(update);
  folder.add(parameters, 'gravity', .1, 2, .01).name('下落重力').onChange(update);
  folder.add(parameters, 'breeze', 0, .5, .01).name('花瓣微风').onChange(update);
  folder.add(parameters, 'showBranch').name('显示原始枝叶').onChange(update);
  folder.addColor(parameters, 'petalTint').name('花瓣整体染色').onChange(update);
  folder.add(parameters, 'roughness', .2, 1, .01).name('花瓣粗糙度').onChange(update);
  folder.add(parameters, 'normalStrength', 0, 2, .01).name('2K 法线纹理强度').onChange(update);
  folder.add(parameters, 'subsurfaceStrength', 0, 1.5, .01).name('次表面透光强度').onChange(update);
  folder.addColor(parameters, 'subsurfaceColor').name('次表面透光颜色').onChange(update);
  folder.add(parameters, 'environmentIntensity', 0, 3, .01).name('HDRI 质感强度').onChange(update);
  folder.add(parameters, 'keyLight', 0, 6, .01).name('暖色主光').onChange(update);
  folder.add(parameters, 'rimLight', 0, 6, .01).name('冷色轮廓光').onChange(update);
  folder.add(parameters, 'backgroundFlow').name('背景缓慢流动').onChange(update);
  folder.add(parameters, 'backgroundSpeed', 0, 1, .01).name('背景流动速度').onChange(update);
  folder.add(parameters, 'backgroundStrength', 0, 1.5, .01).name('背景混色强度').onChange(update);
  folder.addColor(parameters, 'backgroundTop').name('背景顶部颜色').onChange(update);
  folder.addColor(parameters, 'backgroundBottom').name('背景底部颜色').onChange(update);
  folder.addColor(parameters, 'backgroundAccent').name('背景花影颜色').onChange(update);
  folder.add({ reset: () => flower.restore() }, 'reset').name('重置无限花开');

  const status = document.createElement('div');
  status.className = 'viewer-flower-status';
  folder.$children.appendChild(status);
  const note = document.createElement('div');
  note.className = 'viewer-effect-note';
  note.textContent = '新花瓣从花心卷曲长出，持续向外舒展；最老的外层花瓣逐片脱离，保持展开形态，随风向右下方翻转飘落。调整风力、重力和飘落时长可改变轨迹。';
  folder.$children.appendChild(note);

  function refresh() {
    timelineController.updateDisplay();
    if (flower.loadError) {
      status.dataset.kind = 'error';
      status.textContent = `杜鹃花资产加载失败：${flower.loadError.message}`;
    } else if (!flower.petalBatches.length) {
      status.dataset.kind = 'loading';
      status.textContent = '正在加载杜鹃花高模与四通道纹理…';
    } else {
      status.dataset.kind = 'ready';
      status.textContent = `${parameters.generations * 5} 片生长花瓣 · 外层逐片脱落\n花瓣年龄周期 ${(parameters.timeline * parameters.cycleDuration).toFixed(2)} / ${parameters.cycleDuration.toFixed(1)} 秒`;
    }
    folder.controllers.filter(controller => !['启用无限花开', '重置无限花开'].includes(controller._name))
      .forEach(controller => controller.enable(parameters.enabled));
    folder.controllers.find(controller => controller._name === '绽放速度')
      ?.enable(parameters.enabled && parameters.playing);
    folder.controllers.find(controller => controller._name === '背景流动速度')
      ?.enable(parameters.enabled && parameters.backgroundFlow);
  }
  flower.onPanelRefresh(refresh);
  refresh();
  return folder;
}
