import * as THREE from 'three';
import { CORE_PROJECTION_GLSL } from './embeddedCore.js';

export const EDGE_DEFAULTS = Object.freeze({ strength: 0.32, width: 1 });

// Second-smallest plane distance selects box edges, not face interiors or
// triangulation diagonals. Derivatives keep a narrow antialiased pixel width.
const declarations = `
uniform vec3 edgeOuterMin;
uniform vec3 edgeOuterMax;
uniform float edgeStrength;
uniform float edgeWidth;
uniform float edgePixelRatio;
uniform float edgeCoreTransmission;
varying vec3 vEdgeWorldPosition;
float glassBoxEdge(vec3 p, vec3 lo, vec3 hi) {
  vec3 distanceToPlane = min(abs(p - lo), abs(hi - p));
  vec3 pixels = distanceToPlane / max(fwidth(p), vec3(1e-6));
  float second = min(max(pixels.x, pixels.y),
    min(max(pixels.y, pixels.z), max(pixels.z, pixels.x)));
  float width = edgeWidth * edgePixelRatio;
  return 1.0 - smoothstep(max(0.0, width - 0.65), width + 0.65, second);
}
`;

export function patchEdgeShader(shader, uniforms, slot) {
  const marker = '#include <opaque_fragment>';
  if (!shader.fragmentShader.includes(marker) || !shader.vertexShader.includes('#include <begin_vertex>')) {
    throw new Error('轮廓着色器接口已改变。');
  }
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = 'varying vec3 vEdgeWorldPosition;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>', '#include <begin_vertex>\nvEdgeWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;');
  // Outer material already owns the shared core declaration. The inner native
  // front/back faces need the same copy-local attribute and bounds, too.
  if (slot === 1) {
    shader.vertexShader = 'attribute vec3 corePosition; varying vec3 vCorePosition;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCorePosition = corePosition;');
    shader.fragmentShader = CORE_PROJECTION_GLSL + shader.fragmentShader;
  }
  const coverage = slot === 0 ? `
    float rim = glassBoxEdge(vCorePosition, edgeOuterMin, edgeOuterMax);
    vec3 localRay = normalize((coreWorldInverse * vec4(vEdgeWorldPosition - cameraPosition, 0.0)).xyz);
    vec2 interval = coreInterval(vCorePosition, localRay);
    vec3 entry = vCorePosition + localRay * interval.x;
    // Derivatives are unconditional, including outside the projected insert.
    float insertRim = glassBoxEdge(entry, coreMin, coreMax);
    float hit = step(1e-7, interval.y - interval.x);
    rim = max(rim, insertRim * hit * coreWeight * edgeCoreTransmission);
  ` : 'float rim = glassBoxEdge(vCorePosition, coreMin, coreMax);';
  shader.fragmentShader = declarations + shader.fragmentShader.replace(marker, `
  #ifndef FLIP_SIDED
    ${coverage}
    // Neutral surface attenuation only: not emission or a Bloom source, and
    // never accumulated inside the native backface transmission prepass.
    outgoingLight *= 1.0 - edgeStrength * rim;
  #endif
  ${marker}`);
}

export function createSoftEdges(mesh, core, renderer) {
  mesh.geometry.computeBoundingBox();
  const outer = mesh.geometry.boundingBox.clone();
  const parameters = { ...EDGE_DEFAULTS };
  const uniforms = { ...core.uniforms,
    edgeOuterMin: { value: outer.min }, edgeOuterMax: { value: outer.max },
    edgeStrength: { value: parameters.strength }, edgeWidth: { value: parameters.width },
    edgePixelRatio: { value: 1 },
    edgeCoreTransmission: { value: 1 },
  };
  const restore = mesh.material.map((material, slot) => {
    const compile = material.onBeforeCompile, cache = material.customProgramCacheKey;
    const key = cache.call(material);
    material.onBeforeCompile = function(shader, context) {
      compile.call(this, shader, context);
      patchEdgeShader(shader, uniforms, slot);
    };
    material.customProgramCacheKey = () => `${key}:soft-box-edges-v1:${slot}`;
    material.needsUpdate = true;
    return () => {
      material.onBeforeCompile = compile; material.customProgramCacheKey = cache;
      material.needsUpdate = true;
    };
  });
  let disposed = false;
  return { parameters,
    update() {
      if (disposed) return;
      uniforms.edgeStrength.value = Number.isFinite(parameters.strength) ? THREE.MathUtils.clamp(parameters.strength, 0, 1) : EDGE_DEFAULTS.strength;
      uniforms.edgeWidth.value = Number.isFinite(parameters.width) ? THREE.MathUtils.clamp(parameters.width, 0.5, 2) : EDGE_DEFAULTS.width;
      uniforms.edgePixelRatio.value = renderer.getPixelRatio();
      // An opaque outer shell cannot show the projected internal boundary.
      uniforms.edgeCoreTransmission.value = THREE.MathUtils.clamp(mesh.material[0].transmission, 0, 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true; uniforms.edgeStrength.value = 0; restore.forEach(fn => fn());
    },
  };
}
