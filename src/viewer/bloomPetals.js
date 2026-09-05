import * as THREE from 'three';

const TAU = Math.PI * 2;
export const MAX_BLOOM_LAYERS = 12;
export const PETAL_POOL_SIZE = 64;
export const PETAL_LENGTH = 2.5;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const random = seed => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// The reference Flower.update() moves age continuously from inner to outer layers.
// Its triggerLayerFall()/updateFalling() preserve the release pose, then add wind,
// gravity and flutter. Here the same lifecycle is analytic: seeking, pausing and
// recycling do not depend on which frames happened to be rendered.
export function petalLife(age, id, parameters) {
  const duration = parameters.cycleDuration;
  const matureAge = duration * (1 - parameters.holdDuration);
  const opening = Math.min(duration * parameters.openDuration, matureAge);
  const releaseAge = duration;
  const growth = clamp(age / duration);
  const open = smooth(age / opening);
  const outward = smooth(age / matureAge);
  const fallTime = Math.max(0, age - releaseAge);
  const phase = random(id + 7) * TAU;
  const angle = Math.floor(id / 5) * parameters.goldenAngle * Math.PI / 180 + (id % 5) * TAU / 5;
  const radius = .025 + outward * .22;
  const scale = (.58 + .42 * smooth(age / matureAge))
    * smooth(age / (duration * .06)) * parameters.flowerScale;
  const tilt = .42 * (1 - outward) + .18 * outward;
  const bend = 1.4 * (1 - open) + .10;
  const z = .30 - outward * parameters.depthSpacing * 3;
  const falling = age >= releaseAge;
  const fade = 1 - smooth((fallTime / parameters.fallDuration - .88) / .12);
  return {
    id, age, growth, open, falling, fallTime,
    visible: age >= 0 && fallTime < parameters.fallDuration,
    angle, radius, scale, tilt, bend, z,
    // Zero displacement and zero flutter at release; momentum grows smoothly.
    driftX: parameters.wind * ((.52 + random(id + 13) * .38) * fallTime
      + .13 * fallTime * fallTime) + parameters.breeze * .45
      * (Math.sin(fallTime * 2.6 + phase) - Math.sin(phase)),
    driftY: -parameters.gravity * (.16 * fallTime + .17 * fallTime * fallTime),
    driftZ: Math.sin(phase) * .15 * fallTime,
    tumbleX: fallTime * (.24 + random(id + 29) * .35),
    tumbleY: fallTime * (random(id + 41) - .5) * .8,
    tumbleZ: fallTime * (random(id + 57) - .5) * .65,
    fade,
  };
}

export function samplePetals(time, parameters) {
  const count = Math.max(1, Math.min(MAX_BLOOM_LAYERS, Math.round(parameters.generations))) * 5;
  const interval = parameters.cycleDuration / count;
  // Prewarm one growing flower and a short trail, so startup already conveys
  // continual renewal. Absolute birth ids never reset at the UI timeline wrap.
  const now = time + parameters.cycleDuration + parameters.fallDuration * .45;
  const latest = Math.floor(now / interval);
  const earliest = Math.ceil((now - parameters.cycleDuration - parameters.fallDuration) / interval);
  const petals = [];
  for (let id = earliest; id <= latest; id++) petals.push(petalLife(now - id * interval, id, parameters));
  return petals;
}

// Split the actual five disconnected Blender petals once, preserving UV seams.
// Each petal gets its own root and radial frame; whole offset corollas are no
// longer stacked around the camera-facing origin.
export function splitPetalGeometry(source) {
  const position = source.attributes.position;
  const parent = Array.from({ length: position.count }, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const welded = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
    if (welded.has(key)) union(i, welded.get(key)); else welded.set(key, i);
  }
  const indices = source.index.array;
  for (let i = 0; i < indices.length; i += 3) { union(indices[i], indices[i + 1]); union(indices[i], indices[i + 2]); }
  const components = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = find(i);
    if (!components.has(key)) components.set(key, []);
    components.get(key).push(i);
  }
  const groups = [...components.values()].sort((a, b) => b.length - a.length);
  if (groups.length !== 5) throw new Error(`Expected five independent azalea petals, found ${groups.length}`);
  return groups.map((vertices, component) => {
    const points = vertices.map(i => new THREE.Vector3().fromBufferAttribute(position, i));
    const nearRoot = [...points].sort((a, b) => a.lengthSq() - b.lengthSq()).slice(0, 24);
    const root = nearRoot.reduce((v, p) => v.add(p), new THREE.Vector3()).divideScalar(nearRoot.length);
    const center = points.reduce((v, p) => v.add(p), new THREE.Vector3()).divideScalar(points.length);
    const radial = center.clone().sub(root).normalize();
    const tangent = new THREE.Vector3().crossVectors(radial, new THREE.Vector3(0, 0, 1)).normalize();
    const front = new THREE.Vector3().crossVectors(tangent, radial).normalize();
    const length = Math.max(...points.map(p => p.clone().sub(root).dot(radial)));
    const scale = PETAL_LENGTH / length;
    const geometry = new THREE.BufferGeometry();
    const remap = new Map(vertices.map((v, i) => [v, i]));
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const array = new Float32Array(vertices.length * attribute.itemSize);
      vertices.forEach((old, i) => {
        if (name === 'position' || name === 'normal') {
          const vector = new THREE.Vector3().fromBufferAttribute(attribute, old);
          if (name === 'position') vector.sub(root).multiplyScalar(scale);
          array.set(name === 'position'
            ? [vector.dot(tangent) * 2.0, vector.dot(radial), vector.dot(front) * .32]
            : [vector.dot(tangent) / 2.0, vector.dot(radial), vector.dot(front) / .32], i * 3);
        } else for (let c = 0; c < attribute.itemSize; c++) array[i * attribute.itemSize + c] = attribute.array[old * attribute.itemSize + c];
      });
      geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize));
    }
    const triangles = [];
    for (let i = 0; i < indices.length; i += 3) if (remap.has(indices[i])) triangles.push(remap.get(indices[i]), remap.get(indices[i + 1]), remap.get(indices[i + 2]));
    geometry.setIndex(triangles);
    geometry.normalizeNormals();
    geometry.computeBoundingSphere();
    geometry.name = `杜鹃花·独立花瓣${component + 1}`;
    geometry.setAttribute('petalBend', new THREE.InstancedBufferAttribute(new Float32Array(PETAL_POOL_SIZE), 1));
    geometry.setAttribute('petalFade', new THREE.InstancedBufferAttribute(new Float32Array(PETAL_POOL_SIZE), 1));
    return geometry;
  });
}

export function installPetalDeformation(shader) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
    attribute float petalBend;
    attribute float petalFade;
    varying float vPetalFade;
    vec3 bendPetal(vec3 p) {
      float k = petalBend / ${PETAL_LENGTH.toFixed(1)};
      float a = p.y * k;
      return vec3(p.x, sin(a) / k - p.z * sin(a), (1.0 - cos(a)) / k + p.z * cos(a));
    }
  `).replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
    float a = position.y * petalBend / ${PETAL_LENGTH.toFixed(1)};
    float stretch = max(.15, 1.0 - position.z * petalBend / ${PETAL_LENGTH.toFixed(1)});
    objectNormal = normalize(vec3(normal.x, normal.y / stretch * cos(a) - normal.z * sin(a), normal.y / stretch * sin(a) + normal.z * cos(a)));
  `).replace('#include <begin_vertex>', `vec3 transformed = bendPetal(position); vPetalFade = petalFade;`);
  // Screen-door retirement avoids transparent instance ordering artifacts.
  // It only starts late in flight; the falling petal never shrinks or closes.
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vPetalFade;`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = max(roughness * .72, roughnessFactor);`)
    .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      if (vPetalFade < 1.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) > vPetalFade) discard;
    `);
}
