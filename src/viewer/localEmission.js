import * as THREE from 'three';

// A dedicated UV set leaves the model's original UVs untouched. The GLB is
// Y-up, with thin local X and its face in the YZ plane. Arrays copy uv1 verbatim.
export function addEmissionUV(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new THREE.Float32BufferAttribute(position.count * 2, 2);
  for (const group of geometry.groups) {
    const vertices = new Set();
    const bounds = new THREE.Box3();
    for (let i = group.start; i < group.start + group.count; i++) {
      const index = geometry.index.getX(i);
      vertices.add(index);
      bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, index));
    }
    const size = bounds.getSize(new THREE.Vector3());
    for (const index of vertices) {
      if (Math.abs(normal.getX(index)) < 0.5) uv.setXY(index, 0, 0);
      else uv.setXY(index, (position.getZ(index) - bounds.min.z) / size.z,
        (position.getY(index) - bounds.min.y) / size.y);
    }
  }
  geometry.setAttribute('uv1', uv);
}

function lightTrace(slot) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, 512, 512);
  context.strokeStyle = '#ffffff';
  context.lineWidth = slot === 0 ? 2 : 3;
  // Four short corner marks: localized highlights, not a luminous pane.
  const inset = slot === 0 ? 15 : 28;
  const length = slot === 0 ? 70 : 96;
  for (const x of [inset, 512 - inset]) for (const y of [inset, 512 - inset]) {
    const dx = x < 256 ? 1 : -1, dy = y < 256 ? 1 : -1;
    context.beginPath();
    context.moveTo(x + dx * length, y);
    context.lineTo(x, y);
    context.lineTo(x, y + dy * length);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = slot === 0 ? '外框局部光纹' : '内框局部光纹';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.channel = 1;
  return texture;
}

export function createLocalEmission(mesh) {
  addEmissionUV(mesh.geometry);
  const textures = [lightTrace(0), lightTrace(1)];
  const parameters = [{ localized: true }, { localized: true }];
  function apply() {
    mesh.material.forEach((material, slot) => {
      const map = parameters[slot].localized ? textures[slot] : null;
      if (material.emissiveMap !== map) {
        material.emissiveMap = map;
        material.needsUpdate = true;
      }
    });
  }
  apply();
  return { parameters, apply, dispose() {
    mesh.material.forEach(material => { material.emissiveMap = null; });
    textures.forEach(texture => texture.dispose());
  } };
}
