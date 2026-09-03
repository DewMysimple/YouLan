import * as THREE from 'three';

// The exported shell is closed, but its colored front/back faces do not make
// an internal medium in WebGLRenderer. Derive the rectangular insert's volume
// from those faces; do not introduce intersecting walls or extra display meshes.
export function coreBounds(geometry) {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const group of geometry.groups.filter(group => group.materialIndex === 1)) {
    for (let i = group.start; i < group.start + group.count; i++) {
      bounds.expandByPoint(point.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(i)));
    }
  }
  const size = bounds.getSize(point);
  if (bounds.isEmpty() || Math.min(size.x, size.y, size.z) <= 0) {
    throw new Error('内嵌色体需要具有厚度的内框区域。');
  }
  return bounds;
}

// Slab intersection, also used in tests for the axis-parallel edge-on case.
export function coreRayLength(origin, direction, bounds) {
  let near = 0, far = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(direction[axis]) < 1e-7) {
      if (origin[axis] < bounds.min[axis] || origin[axis] > bounds.max[axis]) return 0;
      continue;
    }
    const a = (bounds.min[axis] - origin[axis]) / direction[axis];
    const b = (bounds.max[axis] - origin[axis]) / direction[axis];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  return Math.max(0, far - near);
}

const fragment = `
uniform vec3 coreMin;
uniform vec3 coreMax;
uniform vec3 coreColor;
uniform float coreWeight;
uniform float coreTransmission;
uniform mat4 coreWorldInverse;
varying vec3 vCorePosition;
varying float vCoreSide;
float coreInterval(vec3 origin, vec3 direction) {
  float nearT = 0.0;
  float farT = 1e20;
  for (int axis = 0; axis < 3; axis++) {
    if (abs(direction[axis]) < 1e-7) {
      if (origin[axis] < coreMin[axis] || origin[axis] > coreMax[axis]) return 0.0;
    } else {
      float a = (coreMin[axis] - origin[axis]) / direction[axis];
      float b = (coreMax[axis] - origin[axis]) / direction[axis];
      nearT = max(nearT, min(a, b));
      farT = min(farT, max(a, b));
    }
  }
  return max(0.0, farT - nearT);
}
`;
const absorption = `
#ifndef FLIP_SIDED
  if (coreWeight > 0.0 && vCoreSide > 0.5) {
    // Same first-interface refraction direction as native volume transmission.
    vec3 coreRay = refract(-v, normalize(n), 1.0 / material.ior);
    vec3 coreLocalRay = normalize((coreWorldInverse * vec4(coreRay, 0.0)).xyz);
    float coreDistance = coreInterval(vCorePosition, coreLocalRay);
    // Bounded optical length preserves a readable violet insert edge. This is
    // an explicit absorption approximation, not recursive nested refraction.
    float coreDepth = 1.5 * coreDistance / (coreDistance + coreMax.x - coreMin.x);
    vec3 coreThrough = transmitted.rgb * pow(max(coreColor, vec3(0.001)), vec3(2.0 * coreDepth));
    // Keep an opaque insert colored too. Reuse local diffuse irradiance for
    // that endpoint; this does not simulate lighting transport inside glass.
    vec3 coreSolid = totalDiffuse * coreColor / max(material.diffuseContribution, vec3(0.001));
    float coreCoverage = smoothstep(0.0, 0.01 * (coreMax.x - coreMin.x), coreDistance);
    transmitted.rgb = mix(transmitted.rgb, mix(coreSolid, coreThrough, coreTransmission), coreWeight * coreCoverage);
  }
#endif
`;

export function patchCoreShader(shader, uniforms) {
  const marker = 'totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );';
  const include = '#include <transmission_fragment>';
  if (shader.fragmentShader.includes(include)) {
    shader.fragmentShader = shader.fragmentShader.replace(include, THREE.ShaderChunk.transmission_fragment);
  }
  if (!shader.fragmentShader.includes(marker) || !shader.vertexShader.includes('#include <begin_vertex>')) {
    throw new Error('本地 Transmission 着色器接口已改变，请检查内嵌色体扩展。');
  }
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = 'attribute vec3 corePosition; varying vec3 vCorePosition; varying float vCoreSide;\n' +
    shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvCorePosition = corePosition; vCoreSide = 1.0 - step(0.5, abs(normal.x));');
  shader.fragmentShader = fragment + shader.fragmentShader.replace(marker, absorption + marker);
}

export function createEmbeddedCore(mesh) {
  const bounds = coreBounds(mesh.geometry);
  // Copy-relative coordinates survive the translation-only array builder.
  // Actual position continues to determine camera direction and world placement.
  mesh.geometry.setAttribute('corePosition', mesh.geometry.attributes.position.clone());
  const parameters = { enabled: true };
  const [outer, inner] = mesh.material;
  const uniforms = {
    coreMin: { value: bounds.min }, coreMax: { value: bounds.max },
    coreColor: { value: new THREE.Color() }, coreWeight: { value: 0 },
    coreTransmission: { value: 1 },
    coreWorldInverse: { value: new THREE.Matrix4() },
  };
  const compile = outer.onBeforeCompile, cache = outer.customProgramCacheKey;
  const key = cache.call(outer);
  outer.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    patchCoreShader(shader, uniforms);
  };
  outer.customProgramCacheKey = () => `${key}:embedded-core-v1`;
  outer.needsUpdate = true;
  let disposed = false;
  return {
    parameters,
    update() {
      if (disposed) return;
      mesh.updateWorldMatrix(true, false);
      uniforms.coreWorldInverse.value.copy(mesh.matrixWorld).invert();
      uniforms.coreColor.value.copy(inner.color);
      uniforms.coreTransmission.value = THREE.MathUtils.clamp(inner.transmission, 0, 1);
      uniforms.coreWeight.value = parameters.enabled && inner.visible
        ? THREE.MathUtils.clamp(inner.opacity, 0, 1) : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      uniforms.coreWeight.value = 0;
      outer.onBeforeCompile = compile;
      outer.customProgramCacheKey = cache;
      outer.needsUpdate = true;
      // Mesh/array lifecycle owns the vertex buffers. No render targets or
      // duplicate geometry/material resources are allocated by this module.
    },
  };
}
