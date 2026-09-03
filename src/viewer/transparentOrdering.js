import { Matrix4 } from 'three';

// Three.js sorts objects, not triangles within a merged mesh. Keep two groups
// and sort triangles WITHIN each group for the artistic alpha preset. Exact
// cross-material/intersecting transparency is not claimed.
// https://threejs.org/manual/en/transparency.html
export function createTransparentOrdering(mesh) {
  let geometry, original, entries, previousMatrix = null;
  const modelView = new Matrix4();
  function restore() {
    if (geometry && original) { geometry.index.array.set(original); geometry.index.needsUpdate = true; }
    previousMatrix = null;
  }
  function update(camera) {
    if (geometry !== mesh.geometry) {
      geometry = mesh.geometry;
      original = geometry.index.array.slice();
      const p = geometry.attributes.position;
      entries = geometry.groups.map(group => ({ start: group.start, triangles: Array.from({ length: group.count / 3 }, (_, i) => {
        const start = group.start + i * 3, indices = Array.from(original.slice(start, start + 3));
        const x = indices.reduce((sum, id) => sum + p.getX(id), 0) / 3;
        const y = indices.reduce((sum, id) => sum + p.getY(id), 0) / 3;
        const z = indices.reduce((sum, id) => sum + p.getZ(id), 0) / 3;
        return { indices, x, y, z, start, depth: 0 };
      }) }));
      previousMatrix = null;
    }
    if (!mesh.material.some(m => !m.depthWrite && m.opacity < 1)) { if (previousMatrix) restore(); return; }
    camera.updateMatrixWorld(); mesh.updateWorldMatrix(true, false);
    modelView.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    const e = modelView.elements;
    if (previousMatrix?.every((v, i) => v === e[i])) return;
    previousMatrix = e.slice();
    for (const group of entries) {
      group.triangles.forEach(t => { t.depth = e[2] * t.x + e[6] * t.y + e[10] * t.z + e[14]; });
      group.triangles.sort((a, b) => a.depth - b.depth || a.start - b.start);
      group.triangles.forEach((t, i) => geometry.index.array.set(t.indices, group.start + i * 3));
    }
    geometry.index.needsUpdate = true;
  }
  return { update, dispose() { restore(); geometry = original = entries = null; } };
}
