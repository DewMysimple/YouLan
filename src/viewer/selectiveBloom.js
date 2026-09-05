import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const BLOOM_DEFAULTS = Object.freeze({ enabled: true, strength: 0.25, radius: 0.45, threshold: 1 });

// Official selective-bloom pattern: isolated emission -> UnrealBloomPass ->
// linear combination -> OutputPass. Subtract the unblurred emission so the
// native emissive contribution already in the beauty image is not added twice.
// https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html
export function createSelectiveBloom(renderer, renderBeauty) {
  const parameters = { ...BLOOM_DEFAULTS };
  const supported = renderer.extensions.has('EXT_color_buffer_float') ||
    renderer.extensions.has('EXT_color_buffer_half_float');
  let source, resources, disposed = false;
  let atmosphere = null;
  const size = new THREE.Vector2();
  function allocate() {
    const target = (depthBuffer, samples = 0) => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer, samples,
    });
    const beauty = target(true, Math.min(4, renderer.capabilities.maxSamples));
    const emission = target(true, Math.min(4, renderer.capabilities.maxSamples));
    const work = target(false);
    beauty.texture.name = '深邃效果 线性原画';
    emission.texture.name = '深邃效果 局部发光与覆盖';
    work.texture.name = '深邃效果 光晕输入';
    const scene = new THREE.Scene();
    scene.name = '局部发光代理（不显示）';
    const materials = [0, 1].map(() => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
    const proxy = source ? new THREE.Mesh(source.geometry, materials) : null;
    if (proxy) { proxy.matrixAutoUpdate = false; scene.add(proxy); }
    const bloom = new UnrealBloomPass(new THREE.Vector2(32, 32), 1, 0.45, 1);
    const copy = new THREE.ShaderMaterial({
      uniforms: { inputTexture: { value: emission.texture } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; uniform sampler2D inputTexture; void main(){gl_FragColor=texture2D(inputTexture,vUv);}',
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const quad = new FullScreenQuad(copy);
    const output = new OutputPass();
    Object.assign(output.uniforms, {
      emissionInput: { value: emission.texture }, bloomInput: { value: work.texture },
      pureWhite: { value: false },
    });
    output.material.fragmentShader = output.material.fragmentShader
      .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse; uniform sampler2D emissionInput; uniform sampler2D bloomInput; uniform bool pureWhite;')
      .replace('gl_FragColor = texture2D( tDiffuse, vUv );', `gl_FragColor = texture2D(tDiffuse, vUv);
        gl_FragColor.rgb += max(texture2D(bloomInput,vUv).rgb - texture2D(emissionInput,vUv).rgb, vec3(0.0));`)
      .replace(/}\s*$/, `if (pureWhite) gl_FragColor.rgb = mix(vec3(1.0), gl_FragColor.rgb, texture2D(emissionInput,vUv).a);
        gl_FragColor.a = 1.0; }`);
    atmosphere?.patchOutput(output);
    resources = { beauty, emission, work, scene, materials, proxy, bloom, copy, quad, output };
  }
  function release() {
    if (!resources) return;
    const r = resources;
    [r.beauty, r.emission, r.work].forEach(target => target.dispose());
    r.materials.forEach(material => material.dispose());
    r.bloom.dispose();
    // r185's dispose omits this high-pass material (pinned addon version).
    r.bloom.materialHighPassFilter.dispose();
    r.copy.dispose(); r.quad.dispose(); r.output.dispose(); r.scene.clear();
    resources = null;
  }
  function render(scene, camera) {
    if (disposed) return;
    const localActive = parameters.enabled && parameters.strength > 0 && source &&
      source.material.some(material => material.visible && material.emissiveMap && material.emissiveIntensity > 0);
    const active = supported && (localActive || atmosphere?.effectActive);
    if (!active) { release(); renderBeauty(scene, camera); return; }
    if (!resources) allocate();
    const r = resources;
    renderer.getDrawingBufferSize(size);
    const width = Math.max(32, size.x), height = Math.max(32, size.y);
    if (r.beauty.width !== width || r.beauty.height !== height) {
      [r.beauty, r.emission, r.work].forEach(target => target.setSize(width, height));
      r.bloom.setSize(width, height);
    }
    if (source) {
      source.updateWorldMatrix(true, false);
      r.proxy.geometry = source.geometry;
      r.proxy.matrix.copy(source.matrixWorld);
      r.proxy.layers.mask = source.layers.mask;
      r.proxy.visible = source.visible;
      for (let parent = source.parent; parent; parent = parent.parent) r.proxy.visible &&= parent.visible;
      source.material.forEach((material, slot) => {
        const proxyMaterial = r.materials[slot];
        proxyMaterial.visible = material.visible && material.opacity > 0;
        if (proxyMaterial.map !== material.emissiveMap) {
          proxyMaterial.map = material.emissiveMap;
          proxyMaterial.needsUpdate = true;
        }
        proxyMaterial.color.copy(material.emissive).multiplyScalar(material.emissiveMap ? material.emissiveIntensity * material.opacity : 0);
      });
    }
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace(), previousMip = renderer.getActiveMipmapLevel();
    const previousColor = renderer.getClearColor(new THREE.Color()), previousAlpha = renderer.getClearAlpha();
    const previousAuto = renderer.autoClear;
    try {
      renderer.autoClear = true;
      renderer.setRenderTarget(r.beauty);
      renderBeauty(scene, camera);
      atmosphere?.syncCounts();
      renderer.setRenderTarget(r.emission);
      renderer.setClearColor(0x000000, 0);
      renderer.render(r.scene, camera);
      const autoClearEmission = renderer.autoClear;
      renderer.autoClear = false;
      try { atmosphere?.renderEmission(renderer); } finally { renderer.autoClear = autoClearEmission; }
      renderer.setRenderTarget(r.work);
      r.quad.render(renderer);
      const solarActive = atmosphere?.sunBloomActive;
      Object.assign(r.bloom, { strength: localActive ? parameters.strength : solarActive ? BLOOM_DEFAULTS.strength : 0, radius: parameters.radius, threshold: parameters.threshold });
      if (localActive || solarActive) r.bloom.render(renderer, null, r.work, 0, false);
      r.output.uniforms.pureWhite.value = !!source && scene.background?.isColor && scene.background.getHex() === 0xffffff;
      r.output.render(renderer, previousTarget, r.beauty);
    } finally {
      renderer.setRenderTarget(previousTarget, previousFace, previousMip);
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.autoClear = previousAuto;
    }
  }
  return { parameters, supported, attach(mesh) { release(); source = mesh; }, render,
    setAtmosphere(value) { atmosphere = value; release(); },
    dispose() { if (disposed) return; disposed = true; release(); source = null; } };
}
