import * as THREE from 'three';

export const MAX_PLANES = 10000;
export const LANE_COUNT = 9;
export const TAU = Math.PI * 2;

export function seededRandom(seed = 20260905) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function createLanes() {
  return Array.from({ length: LANE_COUNT }, (_, i) => {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      [.28, .38, .48, -.55, -.65, -.75, 1.12, 1.24, 1.34][i],
      i * .43, -.32 + Math.floor(i / 3) * .62,
    ));
    return {
      u: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
      v: new THREE.Vector3(0, 0, 1).applyQuaternion(rotation),
      radiusOffset: (i % 3) * .62 + Math.floor(i / 3) * .28,
      rate: .13 + (i % 3) * .014,
    };
  });
}

// Closed, analytic spherical routes, with a small radial and vertical harmonic.
// Each plane follows its own offset within a lane. The derivative gives its nose
// direction, including climbs, so the model never slides sideways along a ring.
export function sampleOrbit(lane, angle, radius, flutter, offset = 0) {
  const n = new THREE.Vector3().crossVectors(lane.u, lane.v);
  const radial = lane.u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(lane.v, Math.sin(angle));
  const tangent = lane.u.clone().multiplyScalar(-Math.sin(angle)).addScaledVector(lane.v, Math.cos(angle));
  const r = radius + .16 * Math.sin(3 * angle);
  const position = radial.clone().multiplyScalar(r).addScaledVector(n, offset + flutter * Math.sin(2 * angle));
  const direction = tangent.multiplyScalar(r).addScaledVector(radial, .48 * Math.cos(3 * angle))
    .addScaledVector(n, 2 * flutter * Math.cos(2 * angle)).normalize();
  return { position, direction };
}

export const ORBIT_GLSL = `
uniform float orbitTime, orbitRadius, orbitSize, orbitFlutter;
attribute vec3 orbitU, orbitV;
attribute vec4 orbitData;
attribute vec2 orbitOffset;
void paperFlight(out vec3 center, out mat3 frame) {
  float a = orbitData.z + orbitTime * orbitData.y;
  vec3 n = cross(orbitU, orbitV);
  vec3 radial = orbitU * cos(a) + orbitV * sin(a);
  vec3 tangent = -orbitU * sin(a) + orbitV * cos(a);
  float r = orbitRadius + orbitData.x + .16 * sin(3. * a);
  center = radial * r + n * (orbitOffset.x + orbitFlutter * sin(2. * a));
  vec3 forward = normalize(tangent * r + radial * (.48 * cos(3. * a))
    + n * (2. * orbitFlutter * cos(2. * a)));
  vec3 right = normalize(cross(normalize(center), forward));
  vec3 up = cross(forward, right);
  float bank = orbitOffset.y + .2 * sin(2. * a);
  frame = mat3(right * cos(bank) + up * sin(bank), up * cos(bank) - right * sin(bank), forward);
}
`;

export function installOrbitShader(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${ORBIT_GLSL}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 flightCenter; mat3 flightFrame;
        paperFlight(flightCenter, flightFrame);
        objectNormal = flightFrame * objectNormal;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = flightCenter + flightFrame * position * (orbitSize * orbitData.w);');
  };
  material.customProgramCacheKey = () => 'paper-orbit-v1';
}
