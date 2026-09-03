import * as THREE from 'three';
import { DEPTH_LIMITS } from './depthStack.js';
import { SLICE_DEFAULTS } from './sliceAccumulation.js';
import { BLOOM_DEFAULTS } from './selectiveBloom.js';
import { EDGE_DEFAULTS } from './softEdges.js';

export const DEPTH_DEFAULTS = Object.freeze({ count: 16, spacing: 1.7, fov: 45 });
export const DEPTH_ENVIRONMENT = Object.freeze({ intensity: 0.7, brightness: 2.2, blur: 0.06, rotation: 130, showBackground: true });
export const PHYSICAL_BASELINE = Object.freeze({ opacity: 1, depthWrite: true, transmission: 1, metalness: 0, roughness: 0.05, ior: 1.35, thickness: 0.2 });

// Perspective alone is not a depth effect: front framing combines FOV with
// camera distance. All ordinary material/array edits keep the user's camera.
// https://threejs.org/docs/pages/PerspectiveCamera.html
export function frameFirstSlice(camera, controls, bounds, fov) {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  camera.fov = fov;
  const tangent = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const distance = Math.max(size.y, size.x / Math.max(camera.aspect, 0.01)) / (2 * tangent) * 1.3;
  camera.up.set(0, 1, 0);
  camera.position.copy(center).add(new THREE.Vector3(0, 0, distance + size.z / 2));
  controls.target.copy(center);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(2000, distance * 100);
  camera.updateProjectionMatrix();
  controls.minDistance = distance * 0.12;
  controls.maxDistance = Math.max(1000, distance * 50);
  controls.update();
}

export function bindDepthPresentation(gui, { camera, controls, stack, fitAll, slots, slices, bloom, embeddedCore, softEdges, atmosphere, emission, environment, renderer, renderParameters, requestRender }) {
  const folder = gui.addFolder('深邃效果');
  const parameters = { ...DEPTH_DEFAULTS };
  const originalColors = slots.map(({ parameters: slot }) => slot.color);
  function refresh() { gui.controllersRecursive().forEach(controller => controller.updateDisplay()); requestRender(); }
  function physical() {
    slots.forEach(({ material, parameters: slot }) => {
      Object.assign(slot, PHYSICAL_BASELINE, { emissiveIntensity: 0 });
      Object.assign(material, PHYSICAL_BASELINE, { emissiveIntensity: 0 });
    });
    slices.parameters.clarity = 0;
    environment.apply();
  }
  function setArray() {
    const valid = stack.set(parameters.count, parameters.spacing);
    if (!valid) { parameters.count = stack.state.count; parameters.spacing = stack.state.spacing; refresh(); }
    return valid;
  }
  function frame() {
    frameFirstSlice(camera, controls, stack.baseBounds, parameters.fov);
    requestRender();
  }
  const actions = {
    restore() {
      physical();
      slots.forEach(({ material, parameters: slot }, index) => {
        slot.color = originalColors[index];
        material.color.set(slot.color);
        slot.specularIntensity = material.specularIntensity = 1;
        slot.specularColor = '#ffffff';
        material.specularColor.set(slot.specularColor);
        slot.envMapIntensity = 1;
        slot.emissive = index === 0 ? '#fff0db' : '#ffe4fa';
        slot.emissiveIntensity = index === 0 ? 0.08 : 0.14;
        slot.opacity = material.opacity = index === 0 ? 0.5 : 0.6;
        slot.depthWrite = material.depthWrite = false;
        material.emissive.set(slot.emissive);
        material.emissiveIntensity = slot.emissiveIntensity;
        emission.parameters[index].localized = true;
      });
      emission.apply();
      Object.assign(slices.parameters, SLICE_DEFAULTS);
      embeddedCore.parameters.enabled = true;
      Object.assign(softEdges.parameters, EDGE_DEFAULTS);
      Object.assign(bloom.parameters, BLOOM_DEFAULTS);
      atmosphere?.restore();
      Object.assign(parameters, DEPTH_DEFAULTS);
      Object.assign(environment.parameters, DEPTH_ENVIRONMENT);
      environment.apply();
      renderer.toneMappingExposure = renderParameters.exposure = 1;
      renderer.transmissionResolutionScale = renderParameters.transmissionResolutionScale = 1;
      setArray(); frame(); refresh();
    },
    baseline() { physical(); if (atmosphere) atmosphere.parameters.enabled = false; slices.parameters.enabled = false; embeddedCore.parameters.enabled = false; softEdges.parameters.strength = 0; bloom.parameters.enabled = false; refresh(); },
    layersOnly() { physical(); if (atmosphere) atmosphere.parameters.enabled = false; Object.assign(slices.parameters, SLICE_DEFAULTS); embeddedCore.parameters.enabled = true; bloom.parameters.enabled = false; refresh(); },
    frame, fitAll,
  };
  folder.add({ restore() { actions.restore(); void environment.loadBuiltin(); } }, 'restore').name('恢复调好的默认效果');
  folder.add(actions, 'baseline').name('纯透射对照');
  folder.add(actions, 'layersOnly').name('仅颜色层级对照');
  folder.add(parameters, 'count', 1, DEPTH_LIMITS.count, 1).name('纵深数量').onChange(setArray);
  folder.add(parameters, 'spacing', 0.01, 10, 0.01).name('纵深间距').onChange(setArray);
  folder.add(parameters, 'fov', 25, 75, 1).name('首层取景视角（°）').onChange(frame);
  folder.add(actions, 'frame').name('首层正面取景');
  folder.add(actions, 'fitAll').name('适配全部');
  const status = document.createElement('div');
  status.className = 'viewer-panel-status'; status.setAttribute('role', 'status');
  folder.$children.appendChild(status);
  stack.subscribe(state => {
    parameters.count = state.count; parameters.spacing = state.spacing;
    folder.controllers.forEach(c => c.updateDisplay());
    status.dataset.kind = state.error ? 'error' : 'ready';
    status.textContent = state.error || `${state.count} / 200 层（含首层） · 沿 Z 轴向后排列`;
  });
  folder.add(bloom.parameters, 'enabled').name('局部 Bloom 光晕').onChange(requestRender).enable(bloom.supported);
  folder.add(bloom.parameters, 'strength', 0, 2, 0.01).name('光晕强度').onChange(requestRender).enable(bloom.supported);
  folder.add(bloom.parameters, 'radius', 0, 1, 0.01).name('光晕半径').onChange(requestRender).enable(bloom.supported);
  folder.add(bloom.parameters, 'threshold', 0, 5, 0.01).name('光晕阈值').onChange(requestRender).enable(bloom.supported);
  const note = document.createElement('div');
  note.className = 'viewer-effect-note';
  note.textContent = bloom.supported
    ? '纵深数量是唯一复制入口，1 表示单件；普通数量和间距调整不移动相机。默认采用低覆盖透明混合与分组内排序，是美术近似，不是完整多介质折射。物理对照恢复不透明度 1 和深度写入。局部 Bloom 与尽头迎光分开；对照保留相机、纵深、底色与 HDRI。'
    : '当前设备不支持浮点光晕，保留透射与局部自发光。内嵌色体采用闭合投影近似，不模拟内部多次折射；可在渲染设置关闭，纯透射对照不含此修正。';
  folder.$children.appendChild(note);
  actions.restore();
  return actions;
}
