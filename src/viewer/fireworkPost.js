import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export function createFireworkPost(renderer, scene, camera, parameters, getRenderScale) {
  const supported = renderer.extensions.has('EXT_color_buffer_float') ||
    renderer.extensions.has('EXT_color_buffer_half_float');
  const beauty = new THREE.WebGLRenderTarget(1, 1, {
    type: supported ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: true,
  });
  beauty.texture.name = '场景3烟花线性原画';
  const work = new THREE.WebGLRenderTarget(1, 1, {
    type: supported ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: false,
  });
  work.texture.name = '场景3烟花Bloom输入';
  const bloom = new UnrealBloomPass(new THREE.Vector2(32, 32), 1, .5, .4);
  const copy = new THREE.ShaderMaterial({
    uniforms: { inputTexture: { value: beauty.texture } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform sampler2D inputTexture; void main(){gl_FragColor=texture2D(inputTexture,vUv);}',
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const copyQuad = new FullScreenQuad(copy);
  const output = new OutputPass();
  Object.assign(output.uniforms, {
    fireworkBloomInput: { value: work.texture },
    fireworkBloomSource: { value: beauty.texture },
    fireworkBloomEnabled: { value: true },
  });
  output.material.fragmentShader = output.material.fragmentShader
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse; uniform sampler2D fireworkBloomInput; uniform sampler2D fireworkBloomSource; uniform bool fireworkBloomEnabled;')
    .replace('gl_FragColor = texture2D( tDiffuse, vUv );', `gl_FragColor = texture2D(tDiffuse, vUv);
      if (fireworkBloomEnabled) gl_FragColor.rgb += max(texture2D(fireworkBloomInput, vUv).rgb - texture2D(fireworkBloomSource, vUv).rgb, vec3(0.0));`);
  const previousColor = new THREE.Color();
  let disposed = false;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let appliedScale = -1;

  function syncSize(force = false) {
    const scale = THREE.MathUtils.clamp(getRenderScale(), .5, 1);
    if (!force && scale === appliedScale) return;
    appliedScale = scale;
    const targetWidth = Math.max(32, Math.round(width * Math.min(pixelRatio, 2) * scale));
    const targetHeight = Math.max(32, Math.round(height * Math.min(pixelRatio, 2) * scale));
    beauty.setSize(targetWidth, targetHeight);
    work.setSize(targetWidth, targetHeight);
    bloom.setSize(targetWidth, targetHeight);
  }

  return {
    supported,
    setSize(nextWidth, nextHeight, nextPixelRatio) {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      pixelRatio = Math.max(1, nextPixelRatio || 1);
      syncSize(true);
    },
    render() {
      if (disposed) return;
      syncSize();
      const previousTarget = renderer.getRenderTarget();
      const previousFace = renderer.getActiveCubeFace();
      const previousMip = renderer.getActiveMipmapLevel();
      renderer.getClearColor(previousColor);
      const previousAlpha = renderer.getClearAlpha();
      const previousAutoClear = renderer.autoClear;
      try {
        renderer.autoClear = true;
        renderer.setRenderTarget(beauty);
        renderer.render(scene, camera);
        const bloomActive = parameters.bloomEnabled && parameters.bloomStrength > 0;
        output.uniforms.fireworkBloomEnabled.value = bloomActive;
        if (bloomActive) {
          renderer.setRenderTarget(work);
          copyQuad.render(renderer);
          bloom.strength = parameters.bloomStrength;
          bloom.radius = parameters.bloomRadius;
          bloom.threshold = parameters.bloomThreshold;
          bloom.renderToScreen = false;
          bloom.render(renderer, null, work, 0, false);
        }
        output.renderToScreen = previousTarget === null;
        output.render(renderer, previousTarget, beauty);
      } finally {
        renderer.setRenderTarget(previousTarget, previousFace, previousMip);
        renderer.setClearColor(previousColor, previousAlpha);
        renderer.autoClear = previousAutoClear;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      beauty.dispose();
      work.dispose();
      copy.dispose();
      copyQuad.dispose();
      bloom.dispose();
      // r185's dispose omits this high-pass material (pinned addon version).
      bloom.materialHighPassFilter?.dispose();
      output.dispose();
    },
  };
}
