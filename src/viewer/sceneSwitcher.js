import * as THREE from 'three';

export const SCENE_LABELS = Object.freeze({
  specimen: '场景1·标本纵深',
  pollen: '场景2·花粉星云',
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
  specimenFolders,
  pollenFolders,
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

  const entries = {
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
    status.textContent = activeId === 'specimen'
      ? '已隔离激活场景1：标本透明、纵深、太阳与 Bloom'
      : '已隔离激活场景2：三层花粉粒子与中央能量核心';
  }

  function switchTo(nextId) {
    if (disposed || !entries[nextId] || nextId === activeId) return;
    parallax.resetInput({ immediate: true, clearOrigin: true });
    const current = entries[activeId];
    current.state = cameraState(camera, controls);
    current.deactivate();
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
    const entry = entries[activeId];
    entry.state = cloneState(entry.initial);
    parallax.resetInput({ immediate: true, clearOrigin: true });
    restoreCamera(camera, controls, entry.state);
    requestRender();
  } }, 'resetView').name('重置当前场景视角');
  folder.$children.appendChild(status);
  const note = document.createElement('div');
  note.className = 'viewer-effect-note';
  note.textContent = '两个场景共用开发服务器、Canvas、HDRI、程序混色背景与指针视差；几何、动画、透明排序和场景参数互不进入对方管线。切换时分别保留两个场景的相机角度。';
  folder.$children.appendChild(note);

  specimenScene.visible = true;
  pollenScene.visible = false;
  pollen.deactivate();
  refreshFolders();

  return {
    parameters,
    folder,
    get activeId() { return activeId; },
    get activeScene() { return entries[activeId].scene; },
    switchTo,
    pauseClock() { if (activeId === 'pollen') pollen.pauseClock(); },
    setReducedMotion(value) { pollen.setReducedMotion(value); },
    dispose() {
      if (disposed) return;
      disposed = true;
      pollen.deactivate();
    },
  };
}
