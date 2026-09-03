import * as THREE from 'three';
import { arrayBaseBounds, buildArrayGeometry } from './arrayModifier.js';

export const DEPTH_LIMITS = Object.freeze({ count: 200, minSpacing: 0.01, maxSpacing: 10 });

export function depthOffsets(count, spacing) {
  if (!Number.isInteger(count) || count < 1 || count > DEPTH_LIMITS.count) {
    throw new Error('纵深数量必须是 1–200 的整数（含首层）。');
  }
  if (!Number.isFinite(spacing) || spacing < DEPTH_LIMITS.minSpacing || spacing > DEPTH_LIMITS.maxSpacing) {
    throw new Error('纵深间距必须是 0.01–10 的有限数值。');
  }
  return Array.from({ length: count }, (_, i) => new THREE.Vector3(0, 0, -i * spacing));
}

// One source of truth for depth. No modifier UI or hidden modifier stack.
// Geometry work is consumed by the viewer's existing render frame.
export function createDepthStack(mesh, requestRender) {
  const base = mesh.geometry.clone();
  mesh.updateWorldMatrix(true, false);
  const matrix = mesh.matrixWorld.clone();
  const baseBounds = arrayBaseBounds(base, matrix);
  let pending = null, disposed = false;
  const state = { count: 1, spacing: 1.7, error: '' };
  let applied = { count: 1, spacing: 1.7 }, onChange = () => {};
  return {
    state, baseBounds,
    updateCameraClip(camera) {
      const bounds = baseBounds.clone();
      bounds.min.z -= (applied.count - 1) * applied.spacing;
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const required = camera.position.distanceTo(sphere.center) + sphere.radius + 1;
      if (camera.far < required) { camera.far = required * 1.1; camera.updateProjectionMatrix(); }
    },
    subscribe(callback) { onChange = callback; callback(state); },
    set(count, spacing) {
      if (disposed) return false;
      try {
        const offsets = depthOffsets(count, spacing);
        Object.assign(state, { count, spacing, error: '' });
        pending = offsets;
        onChange(state); requestRender(); return true;
      } catch (error) {
        state.error = error.message; onChange(state); return false;
      }
    },
    flush() {
      if (disposed || !pending) return;
      try {
        const geometry = buildArrayGeometry(base, matrix, pending);
        const previous = mesh.geometry;
        mesh.geometry = geometry;
        previous.dispose();
        applied = { count: state.count, spacing: state.spacing };
      } catch (error) {
        Object.assign(state, applied, { error: `纵深更新失败：${error.message}` });
        onChange(state);
      } finally { pending = null; }
    },
    dispose() { if (disposed) return; disposed = true; pending = null; onChange = () => {}; base.dispose(); },
  };
}
