// Stable IDs are independent of display order and numeric preview URLs.
export const SCENE_TITLES = Object.freeze({
  opening: '纸纹序章', specimen: '标本纵深', pollen: '花粉星云', firework: '指尖花火',
  flower: '无限花开', paper: '纸飞机环游', butterfly: '蝶翼', dappled: '斑驳光影',
  gallery: '纵深花廊', sketchbook: '狮城手记', feather: '纸间来信', character: '字符物理实验',
});
export const SCENE_IDS = Object.freeze(Object.keys(SCENE_TITLES));
export const SCENE_LABELS = Object.freeze(Object.fromEntries(SCENE_IDS.map((id, i) => [id, `场景${i + 1}·${SCENE_TITLES[id]}`])));
export function resolveScene(value) {
  if (Object.hasOwn(SCENE_TITLES, value)) return value;
  if (/^[1-9]\d*$/.test(value)) return SCENE_IDS[Number(value) - 1] ?? null;
  return null;
}
