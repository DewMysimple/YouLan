import * as THREE from 'three';

export const POINTER_PARALLAX_DEFAULTS = Object.freeze({
  enabled: true,
  strength: 2.4,
  responseTime: 0.35,
});

const VERTICAL_RESPONSE = 0.68;
const SETTLE_EPSILON = 0.0005;
const RESPONSE_COMPLETION = Math.log(20); // roughly 95% at responseTime

// The reference video does not roll the rectangular slices. Its motion is
// closer to a small camera translation on the current view plane while the
// camera keeps looking at the OrbitControls target. Near and far slices then
// shift by different amounts, which is real perspective parallax rather than
// a 2D canvas translation.
export function createPointerParallax(camera, controls, domElement, requestRender, {
  reducedMotion = false,
} = {}) {
  const parameters = { ...POINTER_PARALLAX_DEFAULTS };
  const target = new THREE.Vector2();
  const current = new THREE.Vector2();
  const savedPosition = new THREE.Vector3();
  const savedQuaternion = new THREE.Quaternion();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  let suspended = false;
  let applied = false;
  let lastTimestamp = null;

  const active = () => parameters.enabled && !reducedMotion && !suspended;
  const unsettled = () => current.distanceToSquared(target) > SETTLE_EPSILON ** 2;

  function setPointer(x, y) {
    if (!active()) return;
    target.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1),
    );
    requestRender();
  }

  function resetInput({ immediate = false } = {}) {
    target.set(0, 0);
    if (immediate) current.set(0, 0);
    lastTimestamp = null;
    requestRender();
  }

  function pointerMove(event) {
    if (!event.isPrimary || event.pointerType !== 'mouse') return;
    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setPointer(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    );
  }

  function pointerLeave(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    resetInput();
  }

  function controlStart() {
    suspended = true;
    resetInput({ immediate: true });
  }

  function controlEnd() {
    suspended = false;
    resetInput({ immediate: true });
  }

  function update(timestamp) {
    if (!active()) {
      current.set(0, 0);
      lastTimestamp = null;
      return false;
    }
    if (!unsettled()) {
      current.copy(target);
      lastTimestamp = null;
      return false;
    }
    if (parameters.responseTime <= 0) {
      current.copy(target);
      lastTimestamp = null;
      return false;
    }
    if (lastTimestamp == null) {
      lastTimestamp = timestamp;
      return true;
    }
    const dt = THREE.MathUtils.clamp((timestamp - lastTimestamp) / 1000, 0, 0.1);
    lastTimestamp = timestamp;
    const lambda = RESPONSE_COMPLETION / parameters.responseTime;
    current.x = THREE.MathUtils.damp(current.x, target.x, lambda, dt);
    current.y = THREE.MathUtils.damp(current.y, target.y, lambda, dt);
    if (!unsettled()) {
      current.copy(target);
      lastTimestamp = null;
      return false;
    }
    return true;
  }

  function apply() {
    if (!active() || current.lengthSq() <= SETTLE_EPSILON ** 2 || parameters.strength <= 0) return false;
    savedPosition.copy(camera.position);
    savedQuaternion.copy(camera.quaternion);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    up.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    const focusDistance = Math.max(camera.position.distanceTo(controls.target), camera.near, 0.001);
    const maximumShift = focusDistance * Math.tan(THREE.MathUtils.degToRad(parameters.strength));
    camera.position
      .addScaledVector(right, current.x * maximumShift)
      .addScaledVector(up, current.y * maximumShift * VERTICAL_RESPONSE);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    applied = true;
    return true;
  }

  function restoreCamera() {
    if (!applied) return;
    camera.position.copy(savedPosition);
    camera.quaternion.copy(savedQuaternion);
    camera.updateMatrixWorld();
    applied = false;
  }

  function setReducedMotion(value) {
    reducedMotion = value;
    if (value) resetInput({ immediate: true });
  }

  function restoreDefaults() {
    Object.assign(parameters, POINTER_PARALLAX_DEFAULTS);
    resetInput({ immediate: true });
  }

  domElement.addEventListener('pointermove', pointerMove);
  domElement.addEventListener('pointerleave', pointerLeave);
  controls.addEventListener('start', controlStart);
  controls.addEventListener('end', controlEnd);

  return {
    parameters,
    current,
    target,
    setPointer,
    resetInput,
    update,
    apply,
    restoreCamera,
    restoreDefaults,
    setReducedMotion,
    pauseClock() { lastTimestamp = null; },
    dispose() {
      restoreCamera();
      domElement.removeEventListener('pointermove', pointerMove);
      domElement.removeEventListener('pointerleave', pointerLeave);
      controls.removeEventListener('start', controlStart);
      controls.removeEventListener('end', controlEnd);
    },
  };
}

export function bindPointerParallaxPanel(gui, parallax, requestRender) {
  const folder = gui.addFolder('指针视差');
  const p = parallax.parameters;
  folder.add(p, 'enabled').name('启用指针视差').onChange(() => {
    parallax.resetInput({ immediate: !p.enabled });
    requestRender();
  });
  folder.add(p, 'strength', 0, 6, 0.1).name('视差幅度（°）').onChange(requestRender);
  folder.add(p, 'responseTime', 0, 1.5, 0.05).name('跟随缓动（秒）').onChange(() => {
    parallax.pauseClock();
    requestRender();
  });
  const note = document.createElement('div');
  note.className = 'viewer-effect-note';
  note.textContent = '鼠标在画面内移动时，相机在当前视平面轻微横移和纵移，并继续看向轨道中心，因此近远切片产生不同位移。拖拽旋转、平移或缩放期间会暂时回正；减少动态效果偏好开启时默认停用。';
  folder.$children.appendChild(note);
  return folder;
}
