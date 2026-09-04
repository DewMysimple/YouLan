import * as THREE from 'three';

export const POINTER_PARALLAX_DEFAULTS = Object.freeze({
  enabled: true,
  strength: 2.4,
  verticalResponse: 0.68,
  responseTime: 0.35,
  recenterAfterInteraction: true,
});

const SETTLE_EPSILON = 0.0005;
const RESPONSE_COMPLETION = Math.log(20); // roughly 95% at responseTime

// Pointer parallax is a presentation layer around OrbitControls, not a second
// navigation system. While idle it temporarily offsets the render pose. When
// an OrbitControls interaction starts, the visible pose is committed as the
// new orbit pose before the offset is cleared. This makes the hand-off
// continuous for rotate, pan and wheel/pinch zoom.
export function createPointerParallax(camera, controls, domElement, requestRender, {
  reducedMotion = false,
} = {}) {
  const parameters = { ...POINTER_PARALLAX_DEFAULTS };
  const target = new THREE.Vector2();
  const current = new THREE.Vector2();
  const lastPointer = new THREE.Vector2();
  const interactionOrigin = new THREE.Vector2();
  const savedPosition = new THREE.Vector3();
  const savedQuaternion = new THREE.Quaternion();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  let hasPointer = false;
  let hasInteractionOrigin = false;
  let pendingMouseInteraction = false;
  let mouseInteraction = false;
  let suspended = false;
  let applied = false;
  let lastTimestamp = null;

  const enabled = () => parameters.enabled && !reducedMotion;
  const active = () => enabled() && !suspended;
  const unsettled = () => current.distanceToSquared(target) > SETTLE_EPSILON ** 2;

  function setPointer(x, y) {
    if (!active()) return;
    target.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1),
    );
    requestRender();
  }

  function resetInput({ immediate = false, clearOrigin = false } = {}) {
    target.set(0, 0);
    if (immediate) current.set(0, 0);
    if (clearOrigin) hasInteractionOrigin = false;
    lastTimestamp = null;
    requestRender();
  }

  function normalizedPointer(event, result = lastPointer) {
    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    result.set(
      THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
      THREE.MathUtils.clamp(1 - ((event.clientY - rect.top) / rect.height) * 2, -1, 1),
    );
    hasPointer = true;
    return true;
  }

  // OrbitControls start/end events intentionally do not expose their source
  // DOM event. Track pointer/wheel coordinates in the capture phase so the
  // hand-off origin is known before OrbitControls dispatches `start`.
  function rememberPointer(event) {
    if (event.pointerType && event.pointerType !== 'mouse') {
      pendingMouseInteraction = false;
      return;
    }
    pendingMouseInteraction = normalizedPointer(event);
  }

  function pointerMove(event) {
    if (!event.isPrimary || event.pointerType !== 'mouse') return;
    if (!normalizedPointer(event) || !active() || event.buttons !== 0) return;
    const x = hasInteractionOrigin && parameters.recenterAfterInteraction
      ? lastPointer.x - interactionOrigin.x
      : lastPointer.x;
    const y = hasInteractionOrigin && parameters.recenterAfterInteraction
      ? lastPointer.y - interactionOrigin.y
      : lastPointer.y;
    setPointer(x, y);
  }

  function pointerLeave(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    hasPointer = false;
    if (!suspended) resetInput({ clearOrigin: true });
  }

  function applyOffset() {
    if (!enabled() || current.lengthSq() <= SETTLE_EPSILON ** 2 || parameters.strength <= 0) return false;
    right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    up.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    const focusDistance = Math.max(camera.position.distanceTo(controls.target), camera.near, 0.001);
    const maximumShift = focusDistance * Math.tan(THREE.MathUtils.degToRad(parameters.strength));
    camera.position
      .addScaledVector(right, current.x * maximumShift)
      .addScaledVector(up, current.y * maximumShift * parameters.verticalResponse);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    return true;
  }

  function commitVisiblePose() {
    const orbitRadius = (applied ? savedPosition : camera.position).distanceTo(controls.target);
    if (applied) {
      // Browser events and rendering are serialized, but retaining the visible
      // pose is still the safe fallback if a caller commits during a render.
      applied = false;
    } else if (!applyOffset()) {
      resetInput({ immediate: true });
      return false;
    }

    // Keep the orbit radius stable while retaining the exact visible camera
    // position and orientation. The new target stays on the current view ray.
    camera.getWorldDirection(forward);
    controls.target.copy(camera.position).addScaledVector(forward, orbitRadius);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    controls.update?.();
    target.set(0, 0);
    current.set(0, 0);
    lastTimestamp = null;
    requestRender();
    return true;
  }

  function controlStart() {
    // Commit first, suspend second: commitVisiblePose must still be allowed to
    // evaluate the currently visible parallax pose.
    commitVisiblePose();
    suspended = true;
    hasInteractionOrigin = false;
    mouseInteraction = pendingMouseInteraction;
    pendingMouseInteraction = false;
  }

  function controlEnd() {
    suspended = false;
    target.set(0, 0);
    current.set(0, 0);
    lastTimestamp = null;
    if (enabled() && parameters.recenterAfterInteraction && mouseInteraction && hasPointer) {
      interactionOrigin.copy(lastPointer);
      hasInteractionOrigin = true;
    }
    mouseInteraction = false;
    pendingMouseInteraction = false;
    requestRender();
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
    if (!active() || applied) return false;
    savedPosition.copy(camera.position);
    savedQuaternion.copy(camera.quaternion);
    if (!applyOffset()) return false;
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
    if (value) resetInput({ immediate: true, clearOrigin: true });
  }

  function restoreDefaults() {
    Object.assign(parameters, POINTER_PARALLAX_DEFAULTS);
    resetInput({ immediate: true, clearOrigin: true });
  }

  domElement.addEventListener('pointerdown', rememberPointer, true);
  domElement.addEventListener('pointermove', pointerMove);
  domElement.addEventListener('pointerup', rememberPointer, true);
  domElement.addEventListener('pointerleave', pointerLeave);
  domElement.addEventListener('wheel', rememberPointer, { capture: true, passive: true });
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
    commitVisiblePose,
    restoreDefaults,
    setReducedMotion,
    pauseClock() { lastTimestamp = null; },
    dispose() {
      restoreCamera();
      domElement.removeEventListener('pointerdown', rememberPointer, true);
      domElement.removeEventListener('pointermove', pointerMove);
      domElement.removeEventListener('pointerup', rememberPointer, true);
      domElement.removeEventListener('pointerleave', pointerLeave);
      domElement.removeEventListener('wheel', rememberPointer, true);
      controls.removeEventListener('start', controlStart);
      controls.removeEventListener('end', controlEnd);
    },
  };
}

export function bindPointerParallaxPanel(gui, parallax, requestRender) {
  const folder = gui.addFolder('指针视差');
  const p = parallax.parameters;
  folder.add(p, 'enabled').name('启用指针视差').onChange(() => {
    parallax.resetInput({ immediate: !p.enabled, clearOrigin: true });
    requestRender();
  });
  folder.add(p, 'strength', 0, 6, 0.1).name('视差幅度（°）').onChange(requestRender);
  folder.add(p, 'verticalResponse', 0, 1, 0.01).name('垂直响应比例').onChange(requestRender);
  folder.add(p, 'responseTime', 0, 1.5, 0.05).name('跟随缓动（秒）').onChange(() => {
    parallax.pauseClock();
    requestRender();
  });
  folder.add(p, 'recenterAfterInteraction').name('操作后当前位置为中心').onChange(() => {
    parallax.resetInput({ immediate: true, clearOrigin: true });
    requestRender();
  });
  folder.add({ center() { parallax.resetInput({ clearOrigin: true }); } }, 'center').name('视差回中');
  const note = document.createElement('div');
  note.className = 'viewer-effect-note';
  note.textContent = '空闲移动鼠标时，相机在当前视平面轻微横移和纵移。开始旋转、平移或缩放时，当前可见姿态会无缝交给轨道控制，操作期间不再叠加视差；默认以松手位置为新中心，避免操作结束后被指针绝对位置拉向一角。减少动态效果偏好开启时停用。';
  folder.$children.appendChild(note);
  return folder;
}
