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

// Both the beauty and coverage passes use this exact closed-box intersection.
// In particular, project through the front border too: restricting it to outer
// side faces leaves a gap between the apparent top and the colored front face.
const projection = `
uniform vec3 coreMin;
uniform vec3 coreMax;
uniform float coreWeight;
uniform mat4 coreWorldInverse;
varying vec3 vCorePosition;
vec2 coreInterval(vec3 origin, vec3 direction) {
  float nearT = 0.0;
  float farT = 1e20;
  for (int axis = 0; axis < 3; axis++) {
    if (abs(direction[axis]) < 1e-7) {
      if (origin[axis] < coreMin[axis] || origin[axis] > coreMax[axis]) return vec2(0.0);
    } else {
      float a = (coreMin[axis] - origin[axis]) / direction[axis];
      float b = (coreMax[axis] - origin[axis]) / direction[axis];
      nearT = max(nearT, min(a, b));
      farT = min(farT, max(a, b));
    }
  }
  return farT > nearT ? vec2(nearT, farT) : vec2(0.0);
}
`;
const fragment = projection + `
uniform vec3 coreColor;
uniform float coreTransmission;
`;
const absorption = `
#ifndef FLIP_SIDED
  if (coreWeight > 0.0) {
    // A straight visibility ray keeps one closed insert silhouette. Refracting
    // only the side ray (not the front) projected a second purple band onto the
    // outer top. This is a screen-space insert approximation, not nested glass.
    vec3 coreRay = -v;
    vec3 coreLocalRay = normalize((coreWorldInverse * vec4(coreRay, 0.0)).xyz);
    vec2 coreSegment = coreInterval(vCorePosition, coreLocalRay);
    float coreDistance = coreSegment.y - coreSegment.x;
    if (coreDistance > 0.0) {
      vec3 coreExit = vCorePosition + coreLocalRay * coreSegment.y;
      // Native DoubleSide transmission already colors an X-face exit in its
      // BackSide prepass. Add only the missing boundary tint, not that tint a
      // second time. A side exit has no native colored face: both are missing.
      float backIsInner = 1.0 - step(0.0001,
        min(abs(coreExit.x - coreMin.x), abs(coreExit.x - coreMax.x)));
      vec4 straightTransmission = getIBLVolumeRefraction(
        n, v, material.roughness, material.diffuseContribution,
        material.specularColorBlended, material.specularF90, pos,
        modelMatrix, viewMatrix, projectionMatrix, material.dispersion,
        material.ior, 0.0, material.attenuationColor, material.attenuationDistance);
      // Same two boundary-color factors as the front, never color^longSideLength.
      vec3 boundaryTint = max(coreColor, vec3(0.001)) /
        max(material.diffuseContribution, vec3(0.001));
      vec3 coreThrough = straightTransmission.rgb * pow(boundaryTint, vec3(2.0 - backIsInner));
      vec3 coreSolid = totalDiffuse * boundaryTint;
      float coreCoverage = smoothstep(0.0, 0.01 * (coreMax.x - coreMin.x), coreDistance);
      transmitted.rgb = mix(transmitted.rgb, mix(coreSolid, coreThrough, coreTransmission), coreWeight * coreCoverage);
    }
  }
#endif
`;

export function patchCoreShader(shader, uniforms) {
  // Before slice absorption, so it still applies exactly once to this result.
  const marker = 'material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );';
  const include = '#include <transmission_fragment>';
  if (shader.fragmentShader.includes(include)) {
    shader.fragmentShader = shader.fragmentShader.replace(include, THREE.ShaderChunk.transmission_fragment);
  }
  if (!shader.fragmentShader.includes(marker) || !shader.vertexShader.includes('#include <begin_vertex>')) {
    throw new Error('本地 Transmission 着色器接口已改变，请检查内嵌色体扩展。');
  }
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = 'attribute vec3 corePosition; varying vec3 vCorePosition;\n' +
    shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvCorePosition = corePosition;');
  shader.fragmentShader = fragment + shader.fragmentShader.replace(marker, absorption + marker);
}

export function patchCoreCountShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = `
    attribute vec3 corePosition;
    varying vec3 vCorePosition;
    varying vec3 vCoreWorldPosition;
    void main() {
      vCorePosition = corePosition;
      vCoreWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  shader.fragmentShader = projection + `
    varying vec3 vCoreWorldPosition;
    void main() {
      vec3 ray = normalize((coreWorldInverse * vec4(vCoreWorldPosition - cameraPosition, 0.0)).xyz);
      vec2 segment = coreInterval(vCorePosition, ray);
      // One entry surface per closed shell pixel. Reclassify R as G, do not
      // add an extra count on top of it; adjacent inner faces already count G.
      bool inner = coreWeight > 0.0 && segment.y > segment.x;
      gl_FragColor = inner ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 0.0, 1.0);
    }`;
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
  outer.customProgramCacheKey = () => `${key}:embedded-core-v2-closed-projection`;
  outer.needsUpdate = true;
  let disposed = false;
  return {
    parameters,
    patchCountMaterial(material) {
      patchCoreCountShader(material, uniforms);
      material.needsUpdate = true;
    },
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
