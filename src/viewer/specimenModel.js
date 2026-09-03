import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MODEL_NAME = 'SPECIMEN_FRAME_MATERIAL_SLOTS';
const SLOT_NAMES = [
  'MAT_OuterFrame_TranslucentWhite',
  'MAT_InnerPanel_TransparentLavender',
];

// glTF 用两个 primitive 表示材质槽；GLTFLoader 将它们加载为 Group + Mesh。
// 仅在加载阶段合并回一个 Mesh，保留法线、顶点属性和两个独立材质分组。
export function prepareSpecimenMesh(root) {
  const source = root.getObjectByName(MODEL_NAME);
  if (!source?.isGroup || source.children.length !== 2) {
    throw new Error(`模型必须包含双材质区域：${MODEL_NAME}`);
  }

  const regions = SLOT_NAMES.map((name) => source.children.find(
    (child) => child.isMesh && !child.isSkinnedMesh && child.material?.name === name,
  ));
  if (regions.some((region) => !region)) {
    throw new Error(`模型缺少外框或内框材质槽：${SLOT_NAMES.join('、')}`);
  }

  // 转换到同一局部坐标后再合并，不重算法线或焊接边界顶点。
  const geometries = regions.map((region) => {
    region.updateMatrix();
    return region.geometry.clone().applyMatrix4(region.matrix);
  });
  let geometry;
  try {
    geometry = mergeGeometries(geometries, true);
  } finally {
    geometries.forEach((item) => item.dispose());
  }
  if (!geometry) throw new Error('外框与内框材质区域无法合并。');

  const mesh = new THREE.Mesh(geometry, regions.map((region) => region.material));
  mesh.name = MODEL_NAME;
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  mesh.userData = { ...source.userData };
  source.parent.add(mesh);
  source.removeFromParent();
  new Set(regions.map((region) => region.geometry)).forEach((item) => item.dispose());
  return mesh;
}
