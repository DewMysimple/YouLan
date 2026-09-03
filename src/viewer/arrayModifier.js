import * as THREE from 'three';

export const ARRAY_LIMITS = Object.freeze({ layers: 8, count: 100, total: 256 });

export function createArrayLayer() {
  return {
    enabled: true, count: 2,
    relative: true, relativeX: 1, relativeY: 0, relativeZ: 0,
    constant: false, constantX: 0, constantY: 0, constantZ: 0,
  };
}

// Behavior reference: Blender MOD_array.cc, arrayModifier_doArray (local revision
// 3b82744fbfc). Independently implemented translation-only array evaluation.
// Each modifier uses its INPUT bounds, not the original single specimen bounds.
export function evaluateArray(layers, baseBounds) {
  if (layers.length > ARRAY_LIMITS.layers) throw new Error('最多添加 8 层阵列。');
  let offsets = [new THREE.Vector3()];
  const bounds = baseBounds.clone();
  let overlapping = false;
  for (const layer of layers) {
    if (!Number.isInteger(layer.count) || layer.count < 1 || layer.count > ARRAY_LIMITS.count) {
      throw new Error('每层数量必须是 1–100 的整数（包含原件）。');
    }
    const relative = new THREE.Vector3(layer.relativeX, layer.relativeY, layer.relativeZ);
    const constant = new THREE.Vector3(layer.constantX, layer.constantY, layer.constantZ);
    if (![...relative, ...constant].every(Number.isFinite)) {
      throw new Error('偏移必须是有限数值。');
    }
    if (!layer.enabled) continue;
    if (offsets.length * layer.count > ARRAY_LIMITS.total) {
      throw new Error('启用层合计最多 256 份；已保留上一有效设置。');
    }
    const step = bounds.getSize(new THREE.Vector3());
    step.multiply(layer.relative ? relative : new THREE.Vector3());
    if (layer.constant) step.add(constant);
    if (layer.count > 1 && step.lengthSq() === 0) overlapping = true;
    const next = [];
    for (let copy = 0; copy < layer.count; copy++) {
      for (const offset of offsets) next.push(offset.clone().addScaledVector(step, copy));
    }
    offsets = next;
    const end = step.clone().multiplyScalar(layer.count - 1);
    bounds.min.add(new THREE.Vector3().min(end));
    bounds.max.add(new THREE.Vector3().max(end));
    // Float32 geometry cannot represent unbounded JS numeric input.
    if (![...bounds.min, ...bounds.max].every((v) => Number.isFinite(Math.fround(v)))) {
      throw new Error('偏移超出模型可表示的范围；请减小数值。');
    }
  }
  return { offsets, bounds, count: offsets.length, overlapping };
}

export function arrayBaseBounds(geometry, matrixWorld) {
  const displayGeometry = geometry.clone().applyMatrix4(matrixWorld);
  displayGeometry.computeBoundingBox();
  const bounds = displayGeometry.boundingBox.clone();
  displayGeometry.dispose();
  return bounds;
}

export function buildArrayGeometry(base, matrixWorld, offsets) {
  if (offsets.length === 1) return base.clone();
  const inverseLinear = new THREE.Matrix3().setFromMatrix4(matrixWorld.clone().invert());
  const localOffsets = offsets.map((offset) => offset.clone().applyMatrix3(inverseLinear));
  const geometry = new THREE.BufferGeometry();
  const vertexCount = base.attributes.position.count;
  for (const [name, attribute] of Object.entries(base.attributes)) {
    const array = new attribute.array.constructor(attribute.array.length * offsets.length);
    for (let copy = 0; copy < offsets.length; copy++) {
      array.set(attribute.array, copy * attribute.array.length);
    }
    const result = new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
    result.name = attribute.name;
    result.gpuType = attribute.gpuType;
    if (name === 'position') {
      for (let copy = 0; copy < offsets.length; copy++) {
        const offset = localOffsets[copy];
        for (let v = 0; v < vertexCount; v++) {
          const index = copy * vertexCount + v;
          result.setXYZ(index, result.getX(index) + offset.x,
            result.getY(index) + offset.y, result.getZ(index) + offset.z);
        }
      }
    }
    geometry.setAttribute(name, result);
  }
  // Regroup indices by slot, rather than creating two draw groups per copy.
  const indices = [];
  for (const slot of [0, 1]) {
    const start = indices.length;
    for (let copy = 0; copy < offsets.length; copy++) {
      for (const group of base.groups.filter((item) => item.materialIndex === slot)) {
        for (let i = group.start; i < group.start + group.count; i++) {
          indices.push((base.index ? base.index.getX(i) : i) + copy * vertexCount);
        }
      }
    }
    geometry.addGroup(start, indices.length - start, slot);
  }
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function fitArray(camera, controls, model) {
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  const vertical = THREE.MathUtils.degToRad(camera.fov) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const distance = Math.max(radius / Math.sin(Math.min(vertical, horizontal)) * 1.12, 1);
  const direction = camera.position.clone().sub(controls.target).normalize();
  if (!direction.lengthSq()) direction.set(0, 0, 1);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = Math.max(radius * 0.02, 0.01);
  controls.maxDistance = distance * 8;
  controls.update();
}
