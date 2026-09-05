import * as THREE from 'three';

export const PAPER_INTRO_DURATION = 11;
const ease = (x, a, b) => THREE.MathUtils.smootherstep(x, a, b);
const up = new THREE.Vector3(0, 1, 0);
const finalPosition = new THREE.Vector3(0, 2.4, 18.8);
const origin = new THREE.Vector3();
const approach = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 2, 40), new THREE.Vector3(3, 2.8, 44),
  new THREE.Vector3(11, 4, 39), new THREE.Vector3(15, 4.5, 28),
  new THREE.Vector3(12, 3, 18), new THREE.Vector3(7, 2, 12),
]);

// The last segment approaches the live lead aircraft radially, remaining outside
// the planet. A quintic blend reaches its exact position, tangent and bank.
export function samplePaperIntro(progress, lead) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const join = ease(t, .58, .93);
  const pathPosition = approach.getPointAt(Math.min(t / .78, 1));
  const radius = THREE.MathUtils.lerp(pathPosition.length(), lead.position.length(), join);
  const position = pathPosition.normalize().lerp(lead.position.clone().normalize(), join)
    .normalize().multiplyScalar(radius);
  const direction = approach.getTangentAt(Math.min(t / .78, 1)).lerp(lead.direction, join).normalize();
  const right = new THREE.Vector3().crossVectors(up, direction).normalize();
  const normal = new THREE.Vector3().crossVectors(direction, right);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, normal, direction));
  quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -.2 * Math.sin(t * Math.PI * 2)));
  quaternion.slerp(lead.quaternion, join);
  const pullback = ease(t, .35, 1);
  const cameraPosition = position.clone().addScaledVector(direction, -3.4).addScaledVector(up, 1.15)
    .lerp(finalPosition, pullback);
  const target = position.clone().addScaledVector(direction, .6).lerp(origin, pullback);
  return { position, quaternion, cameraPosition, target, scaleBlend: join };
}

export function createPaperOrbitIntro({ camera, controls, resetParallax, requestRender, onChange }) {
  let state = 'idle', elapsed = 0, lastTimestamp = null, savedControls = null;
  function publish() { onChange({ state, elapsed, duration: PAPER_INTRO_DURATION }); }
  function pose(position, target) {
    camera.position.copy(position);
    controls.target.copy(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  function finish() {
    if (!savedControls) return;
    pose(finalPosition, origin);
    camera.fov = 43;
    camera.updateProjectionMatrix();
    Object.assign(controls, savedControls);
    savedControls = null;
    controls.update();
    resetParallax();
    state = 'complete'; lastTimestamp = null;
    publish(); requestRender();
  }
  return {
    get ownsCamera() { return state === 'waiting' || state === 'flying'; },
    get state() { return state; },
    start() {
      if (!savedControls) savedControls = { enabled: controls.enabled, minDistance: controls.minDistance, maxDistance: controls.maxDistance };
      resetParallax();
      controls.enabled = false;
      controls.minDistance = .01;
      controls.maxDistance = 200;
      state = 'waiting'; elapsed = 0; lastTimestamp = null;
      camera.fov = 43; camera.updateProjectionMatrix();
      publish(); requestRender();
    },
    finish,
    pauseClock() { lastTimestamp = null; },
    update(timestamp, visible, lead, hero) {
      if (!this.ownsCamera || !lead || !visible) { lastTimestamp = null; return false; }
      if (state === 'waiting') { state = 'flying'; publish(); }
      if (lastTimestamp !== null) elapsed += Math.min(.1, Math.max(0, (timestamp - lastTimestamp) / 1000));
      lastTimestamp = timestamp;
      const p = samplePaperIntro(elapsed / PAPER_INTRO_DURATION, lead);
      hero.position.copy(p.position); hero.quaternion.copy(p.quaternion);
      hero.scale.setScalar(THREE.MathUtils.lerp(.85, lead.size, p.scaleBlend));
      pose(p.cameraPosition, p.target);
      publish();
      if (elapsed >= PAPER_INTRO_DURATION) finish();
      return this.ownsCamera;
    },
  };
}
