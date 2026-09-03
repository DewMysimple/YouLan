import * as THREE from 'three';

export const SLICE_DEFAULTS = Object.freeze({ enabled: true, strength: 0.18, limit: 3, clarity: 0.75 });

// Beer-style absorption in linear RGB, with an artistic soft ceiling. It depends
// on local overlap, never the array's total count or the copy's index/distance.
export function sliceExponent(count, strength, limit) {
  return limit * -Math.expm1(-Math.max(count - 1, 0) * strength / limit);
}

export function absorptionCoefficients(material, target = new THREE.Vector3()) {
  const weight = material.visible ? material.opacity * material.transmission : 0;
  return target.set(...material.color.toArray().map((value) =>
    -Math.log(THREE.MathUtils.clamp(value, 0.001, 1)) * weight));
}

const declarations = `
uniform sampler2D sliceCounts;
uniform vec3 sliceSettings;
uniform vec3 sliceOuterAbsorption;
uniform vec3 sliceInnerAbsorption;
uniform float sliceClarity;
`;

// Only the visible front-surface pass receives the extra absorption. In this
// pinned WebGL renderer the transmission prepass draws BackSide (FLIP_SIDED).
// Applying there as well would tint the shared transmission buffer twice.
const absorption = `
#ifndef FLIP_SIDED
  if (sliceSettings.x > 0.5) {
    vec4 sliceClip = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
    vec2 sliceUv = sliceClip.xy / sliceClip.w * 0.5 + 0.5;
    vec2 extra = max(texture2D(sliceCounts, sliceUv).rg - vec2(1.0), vec2(0.0));
    vec2 depth = sliceSettings.z * (vec2(1.0) - exp(-extra * sliceSettings.y / sliceSettings.z));
    vec3 opticalDepth = sliceOuterAbsorption * depth.x + sliceInnerAbsorption * depth.y;
    // Optional artistic readability, not additional physical scattering. Only
    // with an image background, blend toward this same material under neutral
    // white transmission. The two factors match the pinned double-sided path.
    // No absorption -> no clarity, so single/non-overlapping/invisible layers
    // remain untouched, and specular reflection still uses the original HDRI.
    float clarityMix = sliceClarity * (1.0 - exp(-max(max(opticalDepth.r, opticalDepth.g), opticalDepth.b)));
    vec3 whiteTransmission = material.diffuseContribution *
      (vec3(1.0) - EnvironmentBRDF(n, v, material.specularColorBlended, material.specularF90, material.roughness));
    transmitted.rgb = mix(transmitted.rgb, whiteTransmission * whiteTransmission, clarityMix);
    transmitted.rgb *= exp(-opticalDepth);
  }
#endif
`;

export function patchSliceShader(shader, uniforms) {
  const include = '#include <transmission_fragment>';
  const marker = 'totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );';
  const chunk = THREE.ShaderChunk.transmission_fragment;
  if (!shader.fragmentShader.includes(include) || !chunk.includes(marker)) {
    throw new Error('本地 Transmission 着色器接口已改变，请检查切片累积扩展。');
  }
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = declarations + shader.fragmentShader.replace(include,
    chunk.replace(marker, absorption + marker));
}

function countMaterial(slot) {
  return new THREE.ShaderMaterial({
    name: `切片覆盖计数 ${slot}`,
    uniforms: { channel: { value: new THREE.Vector2(slot === 0 ? 1 : 0, slot === 1 ? 1 : 0) } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec2 channel; void main() { gl_FragColor = vec4(channel, 0.0, 1.0); }',
    side: THREE.FrontSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
}

export function createSliceAccumulation(renderer) {
  const parameters = { ...SLICE_DEFAULTS };
  const supported = renderer.extensions.has('EXT_color_buffer_float') ||
    renderer.extensions.has('EXT_color_buffer_half_float');
  const state = { supported, message: supported ? '' : '设备不支持浮点累积，已保留原有玻璃渲染。' };
  const uniforms = {
    sliceCounts: { value: null },
    sliceSettings: { value: new THREE.Vector3(0, parameters.strength, parameters.limit) },
    sliceOuterAbsorption: { value: new THREE.Vector3() },
    sliceInnerAbsorption: { value: new THREE.Vector3() },
    sliceClarity: { value: 0 },
  };
  let source = null;
  let proxy = null;
  let baseIndexCount = 0;
  let disposed = false;
  let target = null;
  let countScene = null;
  let countMaterials = [];
  const restoreHooks = [];
  const size = new THREE.Vector2();
  const clearColor = new THREE.Color();

  function attach(mesh) {
    if (source) throw new Error('切片累积已绑定模型。');
    source = mesh;
    baseIndexCount = mesh.geometry.index.count;
    if (!supported) return;
    countScene = new THREE.Scene();
    countScene.name = '切片计数（不显示）';
    countMaterials = [countMaterial(0), countMaterial(1)];
    // A render-only proxy shares the very same geometry; no duplicate vertex
    // buffers, no extra display mesh, and no extra source material instances.
    proxy = new THREE.Mesh(mesh.geometry, countMaterials);
    proxy.name = '切片计数代理';
    proxy.matrixAutoUpdate = false;
    countScene.add(proxy);
    for (const material of source.material) {
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey;
      const key = previousKey.call(material);
      material.onBeforeCompile = function (shader, context) {
        previousCompile.call(this, shader, context);
        patchSliceShader(shader, uniforms);
      };
      material.customProgramCacheKey = () => `${key}:slice-absorption-v1`;
      material.needsUpdate = true;
      restoreHooks.push(() => {
        material.onBeforeCompile = previousCompile;
        material.customProgramCacheKey = previousKey;
        material.needsUpdate = true;
      });
    }
  }

  function releaseTarget() {
    target?.dispose();
    target = null;
    uniforms.sliceCounts.value = null;
  }

  function render(scene, camera) {
    if (disposed) return;
    if (proxy) proxy.geometry = source.geometry;
    const active = supported && source && parameters.enabled && parameters.strength > 0 &&
      source.geometry.index.count > baseIndexCount;
    uniforms.sliceSettings.value.set(active ? 1 : 0, parameters.strength, parameters.limit);
    uniforms.sliceClarity.value = scene.background?.isTexture ? parameters.clarity : 0;
    if (!active) {
      releaseTarget();
      renderer.render(scene, camera);
      return;
    }
    if (!target) {
      target = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: false, stencilBuffer: false,
        samples: Math.min(4, renderer.capabilities.maxSamples),
      });
      target.texture.name = '外框R/内框G 切片覆盖数';
      uniforms.sliceCounts.value = target.texture;
    }
    const previousTarget = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace();
    const mipLevel = renderer.getActiveMipmapLevel();
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    renderer.getDrawingBufferSize(size);
    target.setSize(previousTarget?.width ?? size.x, previousTarget?.height ?? size.y);
    source.updateWorldMatrix(true, false);
    proxy.matrix.copy(source.matrixWorld);
    proxy.layers.mask = source.layers.mask;
    proxy.visible = source.visible;
    for (let parent = source.parent; parent; parent = parent.parent) proxy.visible &&= parent.visible;
    source.material.forEach((material, slot) => {
      countMaterials[slot].visible = material.visible;
      absorptionCoefficients(material, slot === 0 ? uniforms.sliceOuterAbsorption.value : uniforms.sliceInnerAbsorption.value);
    });
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(countScene, camera);
    } finally {
      renderer.setRenderTarget(previousTarget, cubeFace, mipLevel);
      renderer.setClearColor(clearColor, previousAlpha);
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    uniforms.sliceSettings.value.x = 0;
    restoreHooks.forEach((restore) => restore());
    restoreHooks.length = 0;
    releaseTarget();
    countMaterials.forEach((material) => material.dispose());
    countMaterials = [];
    countScene?.clear();
    // source owns the shared geometry and its two physical materials.
    source = null;
    proxy = null;
    countScene = null;
  }
  return { parameters, state, attach, render, dispose };
}
