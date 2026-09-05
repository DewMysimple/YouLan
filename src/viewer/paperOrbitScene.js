import { SCENE_LABELS } from './sceneCatalog.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAX_PLANES, TAU, createLanes, seededRandom, sampleOrbit, installOrbitShader } from './paperOrbitMotion.js';
import { createPaperOrbitIntro } from './paperOrbitIntro.js';
import { createPaperOrbitSky, PAPER_SKY_DEFAULTS } from './paperOrbitSky.js';

export const PAPER_ORBIT_DEFAULTS = Object.freeze({
  ...PAPER_SKY_DEFAULTS,
  playing: true, count: 2400, speed: 1, size: .22, radius: 4.3, flutter: .28,
  planetSpin: .055, showPaths: false, pathOpacity: .13,
  paperColor: '#fff9ed', oceanColor: '#738fc5', landColor: '#88cfc5',
  backgroundTop: '#718fb9', backgroundBottom: '#c8afcf', backgroundAccent: '#b8d4dd',
  atmosphere: .16, environmentIntensity: .3,
});

function disposeTree(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.isInstancedMesh) object.dispose();
    for (const material of [].concat(object.material || [])) materials.add(material);
  });
  materials.forEach(material => {
    Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
    material.dispose();
  });
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => { texture.source?.data?.close?.(); texture.dispose(); });
}

export function createPaperOrbitScene(scene, requestRender, { reducedMotion = false, camera, controls, resetParallax = () => {} } = {}) {
  const parameters = { ...PAPER_ORBIT_DEFAULTS, playing: !reducedMotion };
  const root = new THREE.Group();
  root.name = '场景6·纸飞机环游星球';
  scene.add(root);
  const sky = createPaperOrbitSky(root, camera, parameters);
  const planet = new THREE.Group();
  planet.name = '旋转低多边形地球';
  planet.rotation.set(.13, -.7, -.16);
  root.add(planet);
  const ambient = new THREE.HemisphereLight('#f4f5ff', '#7e759d', 1.3);
  const key = new THREE.DirectionalLight('#fff4dd', 1.7);
  key.position.set(-5, 7, 8);
  const rim = new THREE.DirectionalLight('#91eaff', 1);
  rim.position.set(5, 1, -4);
  root.add(ambient, key, rim);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(3.09, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false,
    uniforms: { strength: { value: parameters.atmosphere } },
    vertexShader: `varying vec3 vNormal, vEye;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);vEye=-p.xyz;
        vNormal=normalMatrix*normal;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec3 vNormal,vEye;uniform float strength;
      void main(){float f=pow(1.-abs(dot(normalize(vNormal),normalize(vEye))),3.);
        gl_FragColor=vec4(.65,.91,1.,f*strength);
        #include <colorspace_fragment>
      }`,
  }));
  halo.name = '薄层大气';
  root.add(halo);

  const lanes = createLanes();
  const paths = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
    color: '#fffaf1', transparent: true, opacity: parameters.pathOpacity, depthWrite: false,
  }));
  paths.name = '环绕航道预览';
  root.add(paths);
  const uniforms = {
    orbitTime: { value: 0 }, orbitRadius: { value: parameters.radius },
    orbitSize: { value: parameters.size }, orbitFlutter: { value: parameters.flutter },
  };
  let planes = null, active = false, disposed = false, previousTimestamp = null;
  let loading = null, loadError = null, panelRefresh = () => {};
  let routeSignature = '';
  scene.userData.paperOrbit = { ready: false, count: parameters.count, time: 0 };
  let hero = null, leadScale = 1, firstVisit = true;
  const intro = createPaperOrbitIntro({ camera, controls, resetParallax, requestRender,
    onChange(value) {
      const oldState = scene.userData.paperOrbit.intro?.state;
      scene.userData.paperOrbit.intro = value;
      syncIntroVisibility();
      if (value.state !== oldState) panelRefresh();
    },
  });

  function syncIntroVisibility() {
    const state = scene.userData.paperOrbit.intro?.state;
    const waiting = state === 'waiting', flying = state === 'flying';
    // At t=0 the camera faces away from the world; the reveal comes from its
    // physical turn, with no planet scaling, opacity trick or scene cut.
    planet.visible = halo.visible = !waiting;
    paths.visible = parameters.showPaths && !waiting && !flying;
    if (hero) hero.visible = flying;
    if (planes) {
      planes.visible = !waiting;
      const data = planes.geometry.attributes.orbitData;
      const size = waiting || flying ? 0 : leadScale;
      if (data.getW(0) !== size) { data.setW(0, size); data.needsUpdate = true; }
    }
  }

  function sampleLead() {
    const data = planes.geometry.attributes.orbitData, offsets = planes.geometry.attributes.orbitOffset;
    const angle = data.getZ(0) + uniforms.orbitTime.value * data.getY(0);
    const lead = sampleOrbit(lanes[0], angle, parameters.radius + data.getX(0), parameters.flutter, offsets.getX(0));
    const right = new THREE.Vector3().crossVectors(lead.position.clone().normalize(), lead.direction).normalize();
    const up = new THREE.Vector3().crossVectors(lead.direction, right);
    const bank = offsets.getY(0) + .2 * Math.sin(2 * angle);
    lead.quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      right.clone().multiplyScalar(Math.cos(bank)).addScaledVector(up, Math.sin(bank)),
      up.multiplyScalar(Math.cos(bank)).addScaledVector(right, -Math.sin(bank)), lead.direction));
    lead.size = parameters.size * leadScale;
    return lead;
  }

  function beginIntro() {
    if (planes) {
      const data = planes.geometry.attributes.orbitData;
      data.setZ(0, Math.PI / 2 - uniforms.orbitTime.value * data.getY(0));
      data.needsUpdate = true;
    }
    previousTimestamp = null;
    intro.start();
  }

  function rebuildPaths() {
    const signature = `${parameters.radius}/${parameters.flutter}`;
    if (signature === routeSignature) return;
    routeSignature = signature;
    const positions = [];
    lanes.forEach(lane => {
      for (let i = 0; i < 192; i++) {
        for (const t of [i, i + 1]) {
          positions.push(...sampleOrbit(lane, t / 192 * TAU,
            parameters.radius + lane.radiusOffset, parameters.flutter).position.toArray());
        }
      }
    });
    paths.geometry.dispose();
    paths.geometry = new THREE.BufferGeometry();
    paths.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  }

  function apply() {
    if (disposed) return;
    parameters.count = Math.round(THREE.MathUtils.clamp(parameters.count, 0, MAX_PLANES));
    parameters.radius = THREE.MathUtils.clamp(parameters.radius, 4.2, 8);
    uniforms.orbitRadius.value = parameters.radius;
    uniforms.orbitSize.value = parameters.size;
    uniforms.orbitFlutter.value = parameters.flutter;
    if (planes) { planes.count = parameters.count; planes.material.color.set(parameters.paperColor); }
    if (hero) {
      const tint = new THREE.Color(); planes.getColorAt(0, tint);
      hero.material.color.set(parameters.paperColor).multiply(tint);
    }
    planet.traverse(object => {
      if (!object.isMesh) return;
      object.material.color.set(object.name === 'EarthOcean' ? parameters.oceanColor : parameters.landColor);
      object.material.envMapIntensity = parameters.environmentIntensity;
    });
    halo.material.uniforms.strength.value = parameters.atmosphere;
    sky.apply();
    paths.visible = parameters.showPaths;
    syncIntroVisibility();
    paths.material.opacity = parameters.pathOpacity;
    rebuildPaths();
    previousTimestamp = null;
    Object.assign(scene.userData.paperOrbit, { count: parameters.count, playing: parameters.playing });
    panelRefresh();
    requestRender();
  }

  async function loadAssets() {
    // allSettled ensures a successfully decoded sibling is disposed on failure.
    const results = await Promise.allSettled(['/models/paper-plane.glb', '/models/paper-orbit-earth.glb']
      .map(url => new GLTFLoader().loadAsync(url)));
    if (disposed || results.some(result => result.status === 'rejected')) {
      results.forEach(result => { if (result.status === 'fulfilled') disposeTree(result.value.scene); });
      if (disposed) return;
      throw results.find(result => result.status === 'rejected').reason;
    }
    const [aircraft, globe] = results.map(result => result.value.scene);
    const source = aircraft.getObjectByName('PaperPlane');
    if (!source?.isMesh || !globe.getObjectByName('EarthOcean') || !globe.getObjectByName('EarthLand')) {
      disposeTree(aircraft); disposeTree(globe);
      throw new Error('模型缺少 PaperPlane / EarthOcean / EarthLand 网格');
    }
    aircraft.updateMatrixWorld(true);
    const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
    const random = seededRandom();
    const u = [], v = [], data = [], offsets = [];
    const paperMaterial = new THREE.MeshStandardMaterial({
      color: parameters.paperColor, roughness: .9, metalness: 0,
      side: THREE.DoubleSide, envMapIntensity: .18,
    });
    hero = new THREE.Mesh(geometry, paperMaterial.clone());
    hero.name = '入场领航纸飞机';
    hero.visible = false;
    root.add(hero);
    installOrbitShader(paperMaterial, uniforms);
    planes = new THREE.InstancedMesh(geometry, paperMaterial, MAX_PLANES);
    planes.name = '万架纸飞机·GPU航道';
    // Positions are shader-driven; CPU bounds do not describe these instances.
    planes.frustumCulled = false;
    const color = new THREE.Color();
    for (let i = 0; i < MAX_PLANES; i++) {
      const lane = lanes[i % lanes.length];
      u.push(...lane.u.toArray()); v.push(...lane.v.toArray());
      const packet = Math.floor(i / lanes.length) % 5;
      const phase = random() < .2 ? random() * TAU : packet * TAU / 5 + random() ** .65 * .72;
      data.push(lane.radiusOffset + (random() - .5) * .38, lane.rate * (.97 + random() * .06), phase, .48 + random() ** 2 * .95);
      offsets.push((random() - .5) * .42, (random() - .5) * .5);
      color.setHSL(.10 + random() * .06, .05 + random() * .14, .8 + random() * .2);
      planes.setColorAt(i, color);
    }
    for (const [name, values, size] of [['orbitU', u, 3], ['orbitV', v, 3], ['orbitData', data, 4], ['orbitOffset', offsets, 2]]) {
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(values), size));
    }
    leadScale = geometry.attributes.orbitData.getW(0);
    // Reserve one identifiable aircraft for the intro-to-flock handoff.
    geometry.attributes.orbitData.setZ(0, Math.PI / 2);
    root.add(planes);
    disposeTree(aircraft);
    globe.traverse(object => { if (object.isMesh) {
      object.material.flatShading = true; object.material.roughness = .88;
    } });
    planet.add(globe);
    scene.userData.paperOrbit.ready = true;
    delete scene.userData.paperOrbit.error;
    apply();
  }

  function ensureLoaded() {
    if (disposed || loading) return loading;
    loadError = null;
    loading = loadAssets().catch(error => {
      if (disposed) return;
      loadError = error instanceof Error ? error : new Error(String(error));
      scene.userData.paperOrbit.error = loadError.message;
      loading = null;
      panelRefresh(); requestRender();
    });
    return loading;
  }

  apply();
  return {
    parameters, root, uniforms, apply,
    get ownsCamera() { return intro.ownsCamera; },
    get planes() { return planes; },
    get loadError() { return loadError; },
    onPanelRefresh(callback) { panelRefresh = callback; },
    activate() {
      active = true; previousTimestamp = null;
      if (firstVisit && !reducedMotion) beginIntro();
      firstVisit = false;
      void ensureLoaded(); requestRender();
    },
    deactivate() { intro.finish(); active = false; previousTimestamp = null; },
    pauseClock() { previousTimestamp = null; intro.pauseClock(); },
    replayIntro() { if (active && !reducedMotion) beginIntro(); },
    skipIntro() { intro.finish(); },
    retry() { void ensureLoaded(); },
    setReducedMotion(value) { reducedMotion = value; if (value) { parameters.playing = false; intro.finish(); } apply(); },
    restore() { Object.assign(parameters, PAPER_ORBIT_DEFAULTS, { playing: !reducedMotion }); apply(); },
    update(timestamp, visible = true) {
      if (disposed || !active) return false;
      const animated = !!planes && visible && parameters.playing && parameters.speed > 0
        && (parameters.count > 0 || parameters.planetSpin > 0 || (parameters.clouds && parameters.cloudDrift > 0));
      let delta = 0;
      if (animated && previousTimestamp !== null) {
        delta = Math.min(.1, Math.max(0, (timestamp - previousTimestamp) / 1000)) * parameters.speed;
        uniforms.orbitTime.value += delta;
        planet.rotation.y += delta * parameters.planetSpin;
      }
      previousTimestamp = animated ? timestamp : null;
      scene.userData.paperOrbit.time = uniforms.orbitTime.value;
      const introAnimated = intro.update(timestamp, visible, planes && intro.ownsCamera ? sampleLead() : null, hero);
      sky.update(delta);
      return animated || introAnimated;
    },
    dispose() {
      if (disposed) return;
      intro.finish(); disposed = true; root.removeFromParent(); disposeTree(root);
      scene.userData.paperOrbit = null; panelRefresh = () => {};
    },
  };
}

export function bindPaperOrbitPanel(gui, paper) {
  const folder = gui.addFolder(SCENE_LABELS.paper);
  const p = paper.parameters, update = () => paper.apply();
  folder.add({ replay: () => paper.replayIntro() }, 'replay').name('重播入场');
  const skip = folder.add({ skip: () => paper.skipIntro() }, 'skip').name('跳过入场');
  folder.add(p, 'playing').name('播放环游').onChange(update);
  folder.add(p, 'count', 0, MAX_PLANES, 100).name('纸飞机数量').onChange(update);
  folder.add(p, 'speed', 0, 2, .01).name('飞行速度').onChange(update);
  folder.add(p, 'size', .08, .6, .01).name('纸飞机大小').onChange(update);
  folder.add(p, 'radius', 4.2, 8, .01).name('环绕半径').onChange(update);
  folder.add(p, 'flutter', 0, .7, .01).name('航道起伏').onChange(update);
  folder.add(p, 'planetSpin', 0, .2, .001).name('星球自转').onChange(update);
  folder.add(p, 'showPaths').name('显示飞行路径').onChange(update);
  folder.add(p, 'pathOpacity', .02, .4, .01).name('路径透明度').onChange(update);
  folder.addColor(p, 'paperColor').name('纸张颜色').onChange(update);
  folder.addColor(p, 'oceanColor').name('海洋颜色').onChange(update);
  folder.addColor(p, 'landColor').name('陆地颜色').onChange(update);
  folder.add(p, 'atmosphere', 0, .8, .01).name('大气柔边').onChange(update);
  folder.add(p, 'environmentIntensity', 0, 2, .01).name('HDRI 质感强度').onChange(update);
  folder.add(p, 'clouds').name('显示云层').onChange(update);
  folder.add(p, 'cloudOpacity', 0, 1, .01).name('云层浓度').onChange(update);
  folder.add(p, 'cloudDrift', 0, 2, .01).name('云层流动').onChange(update);
  folder.add(p, 'sunStrength', 0, 2, .01).name('太阳柔光').onChange(update);
  folder.addColor(p, 'backgroundTop').name('天空顶部').onChange(update);
  folder.addColor(p, 'backgroundBottom').name('天空底部').onChange(update);
  folder.addColor(p, 'backgroundAccent').name('天空柔光').onChange(update);
  folder.add({ reset: () => paper.restore() }, 'reset').name('重置纸飞机环游');
  const status = document.createElement('div');
  status.className = 'viewer-paper-status';
  folder.$children.appendChild(status);
  const retry = folder.add({ retry: () => paper.retry() }, 'retry').name('重试模型加载');
  const refresh = () => {
    status.dataset.kind = paper.loadError ? 'error' : paper.planes ? 'ready' : 'loading';
    status.textContent = paper.loadError ? `模型加载失败：${paper.loadError.message}`
      : paper.planes ? `${p.count.toLocaleString()} 架纸飞机 · 9 条立体航道`
        : '首次进入时加载纸飞机与低多边形地球…';
    retry.show(!!paper.loadError);
    skip.show(paper.ownsCamera);
    folder.controllers.forEach(controller => controller.updateDisplay());
  };
  paper.onPanelRefresh(refresh); refresh();
  return folder;
}
