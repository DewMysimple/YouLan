import * as THREE from 'three';

export const SCENE_LABELS = Object.freeze({
  specimen: '场景1·标本纵深',
  pollen: '场景2·花粉星云',
  firework: '场景3·金菊闪柳烟花',
  flower: '场景4·无限花开',
  paper: '场景5·纸飞机环游',
});

function cameraState(camera, controls) {
  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: controls.target.clone(),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
  };
}

function cloneState(state) {
  return {
    ...state,
    position: state.position.clone(),
    quaternion: state.quaternion.clone(),
    target: state.target.clone(),
  };
}

function restoreCamera(camera, controls, state) {
  camera.position.copy(state.position);
  camera.quaternion.copy(state.quaternion);
  camera.fov = state.fov;
  camera.near = state.near;
  camera.far = state.far;
  camera.updateProjectionMatrix();
  controls.target.copy(state.target);
  controls.minDistance = state.minDistance;
  controls.maxDistance = state.maxDistance;
  controls.update();
}

export function createSceneSwitcher(gui, {
  camera,
  controls,
  parallax,
  requestRender,
  specimenScene,
  pollenScene,
  pollen,
  fireworkScene,
  firework,
  flowerScene,
  flower,
  paperScene,
  paper,
  specimenFolders,
  pollenFolders,
  fireworkFolders,
  flowerFolders,
  paperFolders,
}) {
  const initialSpecimen = cameraState(camera, controls);
  const initialPollen = {
    position: new THREE.Vector3(0, 0.4, 15),
    quaternion: new THREE.Quaternion(),
    target: new THREE.Vector3(0, 0, -7),
    fov: 46,
    near: 0.05,
    far: 300,
    minDistance: 4,
    maxDistance: 80,
  };
  // Derive the quaternion from the same camera API used at runtime.
  const scratch = camera.clone();
  scratch.position.copy(initialPollen.position);
  scratch.lookAt(initialPollen.target);
  initialPollen.quaternion.copy(scratch.quaternion);
  const initialFirework = {
    position: new THREE.Vector3(0, 1.1, 21),
    quaternion: new THREE.Quaternion(),
    target: new THREE.Vector3(0, 0.4, -8),
    fov: 44,
    near: 0.05,
    far: 300,
    minDistance: 8,
    maxDistance: 90,
  };
  scratch.position.copy(initialFirework.position);
  scratch.lookAt(initialFirework.target);
  initialFirework.quaternion.copy(scratch.quaternion);
  const initialFlower = {
    position: new THREE.Vector3(3.6, 2.4, 15.5),
    quaternion: new THREE.Quaternion(),
    target: new THREE.Vector3(.9, -.55, 0),
    fov: 38,
    near: .05,
    far: 220,
    minDistance: 4,
    maxDistance: 60,
  };
  scratch.position.copy(initialFlower.position);
  scratch.lookAt(initialFlower.target);
  initialFlower.quaternion.copy(scratch.quaternion);
  const initialPaper = {
    position: new THREE.Vector3(0, 2.4, 18.8),
    quaternion: new THREE.Quaternion(),
    target: new THREE.Vector3(0, 0, 0),
    fov: 43, near: .05, far: 200, minDistance: 8, maxDistance: 50,
  };
  scratch.position.copy(initialPaper.position);
  scratch.lookAt(initialPaper.target);
  initialPaper.quaternion.copy(scratch.quaternion);

  const entries = {
    paper: {
      label: SCENE_LABELS.paper, scene: paperScene,
      state: cloneState(initialPaper), initial: cloneState(initialPaper),
      folders: paperFolders,
      activate: () => paper.activate(), deactivate: () => paper.deactivate(),
    },
    specimen: {
      label: SCENE_LABELS.specimen,
      scene: specimenScene,
      state: cloneState(initialSpecimen),
      initial: cloneState(initialSpecimen),
      folders: specimenFolders,
      activate() {},
      deactivate() {},
    },
    pollen: {
      label: SCENE_LABELS.pollen,
      scene: pollenScene,
      state: cloneState(initialPollen),
      initial: cloneState(initialPollen),
      folders: pollenFolders,
      activate: () => pollen.activate(),
      deactivate: () => pollen.deactivate(),
    },
    firework: {
      label: SCENE_LABELS.firework,
      scene: fireworkScene,
      state: cloneState(initialFirework),
      initial: cloneState(initialFirework),
      folders: fireworkFolders,
      activate: () => firework.activate(),
      deactivate: () => firework.deactivate(),
    },
    flower: {
      label: SCENE_LABELS.flower,
      scene: flowerScene,
      state: cloneState(initialFlower),
      initial: cloneState(initialFlower),
      folders: flowerFolders,
      activate: () => flower.activate(),
      deactivate: () => flower.deactivate(),
    },
  };
  const byLabel = Object.fromEntries(Object.entries(entries).map(([id, entry]) => [entry.label, id]));
  const parameters = { scene: SCENE_LABELS.specimen };
  const folder = gui.addFolder('场景选择');
  let activeId = 'specimen';
  let disposed = false;
  let controller;

  const status = document.createElement('div');
  status.className = 'viewer-scene-status';

  function refreshFolders() {
    for (const [id, entry] of Object.entries(entries)) {
      entry.folders.forEach((item) => item.show(id === activeId));
    }
    status.dataset.scene = activeId;
    status.textContent = {
      specimen: '已隔离激活场景1：标本透明、纵深、太阳与 Bloom',
      pollen: '已隔离激活场景2：三层花粉粒子与中央能量核心',
      firework: '已隔离激活场景3：金菊主枝、冷绿闪烁簇与柳尾 Bloom',
      flower: '已隔离激活场景4：逐片展开、外瓣脱落与风中飘散',
      paper: '已隔离激活场景5：纸飞机沿立体航道环游低多边形星球',
    }[activeId];
  }

  function switchTo(nextId) {
    if (disposed || !entries[nextId] || nextId === activeId) return;
    parallax.resetInput({ immediate: true, clearOrigin: true });
    const current = entries[activeId];
    current.deactivate();
    current.state = cameraState(camera, controls);
    current.scene.visible = false;
    activeId = nextId;
    const next = entries[activeId];
    next.scene.visible = true;
    restoreCamera(camera, controls, next.state);
    next.activate();
    parameters.scene = next.label;
    controller?.updateDisplay();
    refreshFolders();
    requestRender();
  }

  controller = folder.add(parameters, 'scene', Object.values(SCENE_LABELS)).name('当前场景')
    .onChange((label) => switchTo(byLabel[label]));
  folder.add({ resetView() {
    if (activeId === 'paper') paper.skipIntro();
    const entry = entries[activeId];
    entry.state = cloneState(entry.initial);
    parallax.resetInput({ immediate: true, clearOrigin: true });
    restoreCamera(camera, controls, entry.state);
    requestRender();
  } }, 'resetView').name('重置当前场景视角');
  folder.$children.appendChild(status);
  const note = document.createElement('div');
  note.className = 'viewer-effect-note';
  note.textContent = '五个场景共用开发服务器、Canvas、HDRI 和指针视差，各自保留相机角度。场景1/2共用梦境背景，场景3/4/5分别使用独立夜空、花园和粉彩天空。';
  folder.$children.appendChild(note);

  specimenScene.visible = true;
  pollenScene.visible = false;
  fireworkScene.visible = false;
  flowerScene.visible = false;
  paperScene.visible = false;
  pollen.deactivate();
  firework.deactivate();
  flower.deactivate();
  paper.deactivate();
  refreshFolders();

  return {
    parameters,
    folder,
    get activeId() { return activeId; },
    get activeScene() { return entries[activeId].scene; },
    switchTo,
    pauseClock() {
      if (activeId === 'pollen') pollen.pauseClock();
      if (activeId === 'firework') firework.pauseClock();
      if (activeId === 'flower') flower.pauseClock();
      if (activeId === 'paper') paper.pauseClock();
    },
    setReducedMotion(value) {
      pollen.setReducedMotion(value);
      firework.setReducedMotion(value);
      flower.setReducedMotion(value);
      paper.setReducedMotion(value);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pollen.deactivate();
      firework.deactivate();
      flower.deactivate();
      paper.deactivate();
    },
  };
}
