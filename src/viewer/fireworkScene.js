import * as THREE from 'three';

export const FIREWORK_LIMITS = Object.freeze({
  branches: 72,
  trailSamples: 80,
  sparks: 10000,
  rocketSamples: 192,
});

export const FIREWORK_DEFAULTS = Object.freeze({
  enabled: true,
  playing: true,
  loop: true,
  speed: 1,
  timeline: 0,
  launchDuration: 3.8,
  burstLife: 6.4,
  branchCount: 42,
  trailDensity: 80,
  burstSpeed: 6.7,
  spread: 0.96,
  depthSpread: 0.28,
  gravity: 0.24,
  drag: 0.58,
  wind: 0.08,
  trailLength: 4.4,
  trailWidth: 1.28,
  sparkCount: 9200,
  sparkSize: 1.1,
  sparkIntensity: 1.82,
  sparkPersistence: 1.2,
  goldColor: '#ff9d42',
  emberColor: '#ffcf68',
  sparkleColor: '#76ff8a',
  flashColor: '#fff4cf',
  flashIntensity: 2.8,
  flashSize: 5.2,
  backgroundStyle: '视频黑夜',
  backgroundFlow: true,
  backgroundSpeed: 0.12,
  backgroundStrength: 0.18,
  backgroundColor: '#000003',
  hazeColor: '#07211f',
  accentColor: '#17102d',
  bloomEnabled: true,
  bloomStrength: 1.28,
  bloomRadius: 0.48,
  bloomThreshold: 0.5,
  quality: '高质量',
});

export const FIREWORK_QUALITY = Object.freeze({
  '高质量': { particleScale: 1, renderScale: 1 },
  '均衡（推荐）': { particleScale: 0.74, renderScale: 0.82 },
  '省电': { particleScale: 0.46, renderScale: 0.64 },
});

const BACKGROUND_PRESETS = Object.freeze({
  '视频黑夜': {
    backgroundColor: '#000003', hazeColor: '#07211f', accentColor: '#17102d',
    backgroundStrength: 0.18, backgroundSpeed: 0.12,
  },
  '梦境夜色': {
    backgroundColor: '#090016', hazeColor: '#342052', accentColor: '#153e52',
    backgroundStrength: 0.68, backgroundSpeed: 0.22,
  },
  '纯黑': {
    backgroundColor: '#000000', hazeColor: '#000000', accentColor: '#000000',
    backgroundStrength: 0, backgroundSpeed: 0,
  },
});

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDirection(random) {
  const z = random() * 2 - 1;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  const angle = random() * Math.PI * 2;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius, z];
}

export function buildFireworkTrailGeometry({
  branches = FIREWORK_LIMITS.branches,
  samples = FIREWORK_LIMITS.trailSamples,
  seed = 8108,
} = {}) {
  const count = branches * samples;
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const branch = new Float32Array(count);
  const sample = new Float32Array(count);
  const speed = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let branchIndex = 0; branchIndex < branches; branchIndex++) {
    const branchSpeed = THREE.MathUtils.lerp(0.86, 1.12, random());
    const branchPhase = random() * Math.PI * 2;
    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
      const index = branchIndex * samples + sampleIndex;
      branch[index] = branchIndex;
      sample[index] = sampleIndex;
      speed[index] = branchSpeed;
      phase[index] = branchPhase;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('fireworkBranch', new THREE.BufferAttribute(branch, 1));
  geometry.setAttribute('fireworkSample', new THREE.BufferAttribute(sample, 1));
  geometry.setAttribute('fireworkSpeedScale', new THREE.BufferAttribute(speed, 1));
  geometry.setAttribute('fireworkPhase', new THREE.BufferAttribute(phase, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -2, 0), 28);
  return geometry;
}

export function buildFireworkTrailLineGeometry({
  branches = FIREWORK_LIMITS.branches,
  samples = FIREWORK_LIMITS.trailSamples,
  seed = 8108,
} = {}) {
  const segments = Math.max(samples - 1, 0);
  const count = branches * segments * 2;
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const branch = new Float32Array(count);
  const sample = new Float32Array(count);
  const segment = new Float32Array(count);
  const speed = new Float32Array(count);
  const phase = new Float32Array(count);
  let cursor = 0;
  for (let branchIndex = 0; branchIndex < branches; branchIndex++) {
    const branchSpeed = THREE.MathUtils.lerp(0.86, 1.12, random());
    const branchPhase = random() * Math.PI * 2;
    for (let segmentIndex = 0; segmentIndex < segments; segmentIndex++) {
      for (let endpoint = 0; endpoint < 2; endpoint++, cursor++) {
        branch[cursor] = branchIndex;
        sample[cursor] = segmentIndex + endpoint;
        segment[cursor] = segmentIndex;
        speed[cursor] = branchSpeed;
        phase[cursor] = branchPhase;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('fireworkBranch', new THREE.BufferAttribute(branch, 1));
  geometry.setAttribute('fireworkSample', new THREE.BufferAttribute(sample, 1));
  geometry.setAttribute('fireworkSegment', new THREE.BufferAttribute(segment, 1));
  geometry.setAttribute('fireworkSpeedScale', new THREE.BufferAttribute(speed, 1));
  geometry.setAttribute('fireworkPhase', new THREE.BufferAttribute(phase, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -2, 0), 28);
  return geometry;
}

export function buildFireworkSparkGeometry(count = FIREWORK_LIMITS.sparks, { seed = 20260904 } = {}) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const branch = new Float32Array(count);
  const delay = new Float32Array(count);
  const life = new Float32Array(count);
  const velocity = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const sparkSeed = new Float32Array(count);
  const kind = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    branch[index] = Math.floor(random() * FIREWORK_LIMITS.branches);
    const terminal = random() < 0.84;
    const node = terminal ? 2 + Math.floor((random() ** 0.55) * 6) : random() * 4;
    delay[index] = 0.2 + node * 0.48 + random() * 0.18;
    kind[index] = random() < 0.14 ? 1 : 0;
    life[index] = THREE.MathUtils.lerp(kind[index] ? 1.1 : 0.8, kind[index] ? 2.0 : 1.55, random());
    const direction = randomDirection(random);
    const scatterSpeed = THREE.MathUtils.lerp(0.1, kind[index] ? 0.58 : 0.82, random() ** 1.7);
    velocity[index * 3] = direction[0] * scatterSpeed;
    velocity[index * 3 + 1] = direction[1] * scatterSpeed;
    velocity[index * 3 + 2] = direction[2] * scatterSpeed;
    size[index] = THREE.MathUtils.lerp(kind[index] ? 1.1 : 0.74, kind[index] ? 2.65 : 2.15, random() ** 1.8);
    sparkSeed[index] = random() * 1000;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('sparkBranch', new THREE.BufferAttribute(branch, 1));
  geometry.setAttribute('sparkDelay', new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute('sparkLife', new THREE.BufferAttribute(life, 1));
  geometry.setAttribute('sparkVelocity', new THREE.BufferAttribute(velocity, 3));
  geometry.setAttribute('sparkSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('sparkSeed', new THREE.BufferAttribute(sparkSeed, 1));
  geometry.setAttribute('sparkKind', new THREE.BufferAttribute(kind, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -2, 0), 30);
  return geometry;
}

export function buildRocketGeometry(count = FIREWORK_LIMITS.rocketSamples, { seed = 311 } = {}) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const sample = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    sample[index] = index / Math.max(count - 1, 1);
    phase[index] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('rocketSample', new THREE.BufferAttribute(sample, 1));
  geometry.setAttribute('rocketPhase', new THREE.BufferAttribute(phase, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -4.5, 0), 7);
  return geometry;
}

const COMMON_GLSL = `
const float FIREWORK_TAU = 6.28318530718;
float fireworkHash(float value) { return fract(sin(value * 91.3458 + 17.137) * 47453.5453); }
vec3 fireworkDirection(float branch) {
  float count = max(fireworkBranches, 1.0);
  float angle = FIREWORK_TAU * (branch + .5) / count + (fireworkHash(branch) - .5) * .16;
  float depth = (fireworkHash(branch + 23.7) - .5) * 2.0 * fireworkDepth;
  return normalize(vec3(cos(angle), sin(angle), depth));
}
vec3 fireworkTrajectory(vec3 direction, float age, float speedScale) {
  float resistance = max(fireworkDrag, .001);
  float radial = fireworkBurstSpeed * speedScale * (1.0 - exp(-resistance * age)) / resistance;
  vec3 result = direction * radial * fireworkSpread;
  result.y -= .5 * fireworkGravity * age * age;
  result.x += fireworkWind * age * age * .12;
  return result;
}`;

const TRAIL_VERTEX = `
attribute float fireworkBranch, fireworkSample, fireworkSpeedScale, fireworkPhase;
uniform float fireworkTime, fireworkLaunchDuration, fireworkBurstLife, fireworkBranches;
uniform float fireworkTrailDensity, fireworkBurstSpeed, fireworkSpread, fireworkDepth;
uniform float fireworkGravity, fireworkDrag, fireworkWind, fireworkTrailLength;
uniform float fireworkTrailWidth, fireworkPixelRatio;
varying float vTrailAlpha, vTrailHead, vTrailPhase;
${COMMON_GLSL}
void main() {
  float burstAge = fireworkTime - fireworkLaunchDuration;
  float density = max(fireworkTrailDensity, 2.0);
  float trailU = fireworkSample / max(density - 1.0, 1.0);
  float pathAge = burstAge - trailU * fireworkTrailLength;
  float branchVisible = step(fireworkBranch, fireworkBranches - .5) * step(fireworkSample, density - .5);
  float revealed = step(0.0, pathAge) * step(0.0, burstAge);
  float endFade = 1.0 - smoothstep(fireworkBurstLife * .72, fireworkBurstLife, burstAge);
  vec3 direction = fireworkDirection(fireworkBranch);
  vec3 p = fireworkTrajectory(direction, max(pathAge, 0.0), fireworkSpeedScale);
  vec3 lateral = normalize(vec3(-direction.y, direction.x, 0.0));
  p += lateral * sin(pathAge * 8.0 + fireworkPhase) * .025 * pathAge;
  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  float headGlow = exp(-trailU * 5.5);
  gl_PointSize = max(1.0, (1.85 + headGlow * 1.9) * fireworkTrailWidth * fireworkPixelRatio * clamp(28.0 / -viewPosition.z, .55, 2.4));
  vTrailAlpha = branchVisible * revealed * endFade * mix(.22, 1.0, pow(1.0 - trailU, .42));
  vTrailHead = headGlow;
  vTrailPhase = fireworkPhase + pathAge * 19.0;
  if (vTrailAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const TRAIL_FRAGMENT = `
uniform vec3 fireworkGold, fireworkEmber;
varying float vTrailAlpha, vTrailHead, vTrailPhase;
void main() {
  vec2 q = gl_PointCoord - .5;
  float radius = length(q);
  float core = smoothstep(.48, .04, radius);
  float glint = .78 + .22 * sin(vTrailPhase);
  float alpha = core * vTrailAlpha * glint;
  if (alpha < .008) discard;
  vec3 color = mix(fireworkGold, fireworkEmber, .34 + vTrailHead * .22);
  gl_FragColor = vec4(color * alpha * (1.15 + vTrailHead * .85), alpha);
}`;

const TRAIL_LINE_VERTEX = `
attribute float fireworkBranch, fireworkSample, fireworkSegment, fireworkSpeedScale, fireworkPhase;
uniform float fireworkTime, fireworkLaunchDuration, fireworkBurstLife, fireworkBranches;
uniform float fireworkTrailDensity, fireworkBurstSpeed, fireworkSpread, fireworkDepth;
uniform float fireworkGravity, fireworkDrag, fireworkWind, fireworkTrailLength;
varying float vLineAlpha, vLineHead, vLinePhase;
${COMMON_GLSL}
void main() {
  float burstAge = fireworkTime - fireworkLaunchDuration;
  float density = max(fireworkTrailDensity, 2.0);
  float trailU = fireworkSample / max(density - 1.0, 1.0);
  float pathAge = burstAge - trailU * fireworkTrailLength;
  float branchVisible = step(fireworkBranch, fireworkBranches - .5) * step(fireworkSegment, density - 2.0);
  float revealed = step(0.0, pathAge) * step(0.0, burstAge);
  float endFade = 1.0 - smoothstep(fireworkBurstLife * .72, fireworkBurstLife, burstAge);
  vec3 direction = fireworkDirection(fireworkBranch);
  vec3 p = fireworkTrajectory(direction, max(pathAge, 0.0), fireworkSpeedScale);
  vec3 lateral = normalize(vec3(-direction.y, direction.x, 0.0));
  p += lateral * sin(pathAge * 8.0 + fireworkPhase) * .025 * pathAge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vLineHead = exp(-trailU * 5.5);
  vLineAlpha = branchVisible * revealed * endFade * mix(.07, .5, pow(1.0 - trailU, .48));
  vLinePhase = fireworkPhase + pathAge * 19.0;
  if (vLineAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const TRAIL_LINE_FRAGMENT = `
uniform vec3 fireworkGold, fireworkEmber;
varying float vLineAlpha, vLineHead, vLinePhase;
void main() {
  float glint = .82 + .18 * sin(vLinePhase);
  float alpha = vLineAlpha * glint;
  vec3 color = mix(fireworkGold, fireworkEmber, .38 + vLineHead * .18);
  gl_FragColor = vec4(color * alpha * (1.0 + vLineHead * .52), alpha);
}`;

const SPARK_VERTEX = `
attribute float sparkBranch, sparkDelay, sparkLife, sparkSize, sparkSeed, sparkKind;
attribute vec3 sparkVelocity;
uniform float fireworkTime, fireworkLaunchDuration, fireworkBranches, fireworkBurstLife;
uniform float fireworkBurstSpeed, fireworkSpread, fireworkDepth, fireworkGravity;
uniform float fireworkDrag, fireworkWind, fireworkSparkSize, fireworkSparkPersistence;
uniform float fireworkPixelRatio;
varying float vSparkAlpha, vSparkSeed, vSparkKind;
${COMMON_GLSL}
void main() {
  float burstAge = fireworkTime - fireworkLaunchDuration;
  float life = sparkLife * fireworkSparkPersistence;
  float age = burstAge - sparkDelay;
  float normalizedAge = age / max(life, .001);
  float branch = mod(sparkBranch, max(floor(fireworkBranches), 1.0));
  vec3 direction = fireworkDirection(branch);
  float branchSpeed = mix(.88, 1.1, fireworkHash(branch + 4.2));
  vec3 center = fireworkTrajectory(direction, sparkDelay, branchSpeed);
  vec3 p = center + sparkVelocity * max(age, 0.0);
  p.y -= fireworkGravity * .18 * max(age, 0.0) * max(age, 0.0);
  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  float alive = step(0.0, age) * step(normalizedAge, 1.0) * step(burstAge, fireworkBurstLife);
  float envelope = sin(clamp(normalizedAge, 0.0, 1.0) * 3.14159265);
  vSparkAlpha = alive * pow(max(envelope, 0.0), sparkKind > .5 ? .75 : .28);
  vSparkSeed = sparkSeed;
  vSparkKind = sparkKind;
  gl_PointSize = max(1.0, sparkSize * fireworkSparkSize * fireworkPixelRatio * clamp(32.0 / -viewPosition.z, .55, 2.6));
  if (vSparkAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const SPARK_FRAGMENT = `
uniform vec3 fireworkSparkle, fireworkEmber;
uniform float fireworkSparkIntensity, fireworkTime;
varying float vSparkAlpha, vSparkSeed, vSparkKind;
float sparkleHash(float value) { return fract(sin(value * 47.17) * 19341.17); }
void main() {
  vec2 q = gl_PointCoord - .5;
  float r = length(q);
  float edge = 1.0 - smoothstep(.32, .5, r);
  float soft = exp(-r * r * 21.0) * edge;
  float core = exp(-r * r * 105.0) * edge;
  float tick = floor(fireworkTime * mix(16.0, 27.0, sparkleHash(vSparkSeed)));
  float strobe = mix(.42, 1.0, step(.38, sparkleHash(vSparkSeed + tick)));
  float shape = soft * .34 + core * 1.28;
  float alpha = shape * vSparkAlpha * mix(strobe, .78, vSparkKind);
  if (alpha < .018) discard;
  vec3 color = mix(fireworkSparkle, fireworkEmber, vSparkKind * .8 + sparkleHash(vSparkSeed) * .12);
  gl_FragColor = vec4(color * alpha * fireworkSparkIntensity, alpha);
}`;

const ROCKET_VERTEX = `
attribute float rocketSample, rocketPhase;
uniform float fireworkTime, fireworkLaunchDuration, fireworkPixelRatio;
varying float vRocketAlpha, vRocketHeat, vRocketPhase;
vec3 rocketPath(float progress) {
  float eased = 1.0 - pow(1.0 - progress, 2.25);
  return vec3(sin(progress * 8.0) * .12 + progress * .18, mix(-8.5, 0.0, eased), cos(progress * 5.0) * .055);
}
void main() {
  float head = clamp(fireworkTime / max(fireworkLaunchDuration, .001), 0.0, 1.0);
  float progress = max(0.0, head - rocketSample * .24);
  vec3 p = rocketPath(progress);
  p.x += sin(rocketPhase + fireworkTime * 15.0) * .025 * rocketSample;
  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  float rocketVisible = step(0.0, fireworkTime) * step(fireworkTime, fireworkLaunchDuration + .08) * step(.0001, head - rocketSample * .24);
  vRocketAlpha = rocketVisible * pow(1.0 - rocketSample, .42);
  vRocketHeat = exp(-rocketSample * 9.0);
  vRocketPhase = rocketPhase;
  gl_PointSize = max(1.0, (1.2 + vRocketHeat * 3.2) * fireworkPixelRatio * clamp(30.0 / -viewPosition.z, .6, 2.4));
  if (vRocketAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const ROCKET_FRAGMENT = `
uniform vec3 fireworkGold, fireworkSparkle;
uniform float fireworkTime;
varying float vRocketAlpha, vRocketHeat, vRocketPhase;
void main() {
  vec2 q = gl_PointCoord - .5;
  float r = length(q);
  float shape = exp(-r * r * 34.0);
  float flicker = .6 + .4 * sin(fireworkTime * 31.0 + vRocketPhase);
  float alpha = shape * vRocketAlpha * flicker;
  if (alpha < .006) discard;
  vec3 color = mix(fireworkGold, fireworkSparkle, vRocketHeat);
  gl_FragColor = vec4(color * alpha * (1.1 + vRocketHeat * 1.6), alpha);
}`;

const BILLBOARD_VERTEX = `
varying vec2 vUv;
uniform float fireworkFlashSize;
void main() {
  vUv = uv;
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  center.xy += position.xy * fireworkFlashSize;
  gl_Position = projectionMatrix * center;
}`;

const BILLBOARD_FRAGMENT = `
varying vec2 vUv;
uniform float fireworkTime, fireworkLaunchDuration, fireworkFlashIntensity;
uniform vec3 fireworkFlash, fireworkSparkle;
void main() {
  float age = fireworkTime - fireworkLaunchDuration;
  vec2 q = vUv - .5;
  float r = length(q);
  float angle = atan(q.y, q.x);
  float flashEnvelope = step(0.0, age) * exp(-max(age, 0.0) * 5.2);
  float smokeEnvelope = step(0.0, age) * exp(-max(age, 0.0) * .56) * (1.0 - smoothstep(.15, 4.8, age));
  float core = exp(-r * r * 155.0) * 2.2;
  float halo = exp(-r * r * 14.0) * .58;
  float rays = pow(abs(cos(angle * 8.0)), 22.0) * exp(-r * 9.0) * .42;
  float smoke = exp(-r * r * 2.7) * (.72 + .28 * sin(angle * 5.0 + age * .6)) * .12;
  float light = (core + halo + rays) * flashEnvelope * fireworkFlashIntensity;
  vec3 color = fireworkFlash * light + fireworkSparkle * smoke * smokeEnvelope;
  float alpha = clamp(light + smoke * smokeEnvelope, 0.0, 1.0);
  if (alpha < .002) discard;
  gl_FragColor = vec4(color, alpha);
}`;

const BACKGROUND_VERTEX = `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BACKGROUND_FRAGMENT = `
varying vec3 vDirection;
uniform float fireworkBackgroundTime, fireworkBackgroundStrength;
uniform vec3 fireworkBackground, fireworkHaze, fireworkAccent;
void main() {
  vec3 direction = normalize(vDirection);
  float time = fireworkBackgroundTime;
  float broad = .5 + .5 * sin(direction.x * 3.1 + direction.y * 2.2 + time);
  float fold = .5 + .5 * sin(direction.y * 5.7 - direction.x * 2.6 - time * .73 + sin(direction.z * 3.0));
  float veil = smoothstep(.18, .86, broad * .58 + fold * .42);
  float horizon = pow(1.0 - abs(direction.y), 2.5);
  vec3 color = mix(fireworkBackground, fireworkHaze, veil * fireworkBackgroundStrength);
  color = mix(color, fireworkAccent, horizon * fireworkBackgroundStrength * .34);
  gl_FragColor = vec4(color, 1.0);
}`;

function shaderMaterial(name, uniforms, vertexShader, fragmentShader, options = {}) {
  const settings = {
    name,
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: options.transparent ?? true,
    depthWrite: false,
    depthTest: options.depthTest ?? false,
    blending: options.blending ?? THREE.AdditiveBlending,
    toneMapped: false,
  };
  if (options.side !== undefined) settings.side = options.side;
  return new THREE.ShaderMaterial(settings);
}

export function createFireworkScene(scene, renderer, requestRender, { reducedMotion = false } = {}) {
  const parameters = { ...FIREWORK_DEFAULTS, playing: !reducedMotion };
  const timeUniform = { value: 0 };
  const commonUniforms = {
    fireworkTime: timeUniform,
    fireworkLaunchDuration: { value: parameters.launchDuration },
    fireworkBurstLife: { value: parameters.burstLife },
    fireworkBranches: { value: parameters.branchCount },
    fireworkTrailDensity: { value: parameters.trailDensity },
    fireworkBurstSpeed: { value: parameters.burstSpeed },
    fireworkSpread: { value: parameters.spread },
    fireworkDepth: { value: parameters.depthSpread },
    fireworkGravity: { value: parameters.gravity },
    fireworkDrag: { value: parameters.drag },
    fireworkWind: { value: parameters.wind },
    fireworkTrailLength: { value: parameters.trailLength },
    fireworkTrailWidth: { value: parameters.trailWidth },
    fireworkSparkSize: { value: parameters.sparkSize },
    fireworkSparkIntensity: { value: parameters.sparkIntensity },
    fireworkSparkPersistence: { value: parameters.sparkPersistence },
    fireworkPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    fireworkGold: { value: new THREE.Color(parameters.goldColor) },
    fireworkEmber: { value: new THREE.Color(parameters.emberColor) },
    fireworkSparkle: { value: new THREE.Color(parameters.sparkleColor) },
  };
  const root = new THREE.Group();
  root.name = '场景4·金菊闪柳烟花主体';
  root.position.set(0, 0.6, -8);

  const rocketGeometry = buildRocketGeometry();
  const rocketMaterial = shaderMaterial('上升火箭尾迹材质', commonUniforms, ROCKET_VERTEX, ROCKET_FRAGMENT);
  const rocket = new THREE.Points(rocketGeometry, rocketMaterial);
  rocket.name = '上升火箭尾迹';
  rocket.frustumCulled = false;
  rocket.renderOrder = 0;
  root.add(rocket);

  const trailGeometry = buildFireworkTrailGeometry();
  const trailMaterial = shaderMaterial('金菊柳尾材质', commonUniforms, TRAIL_VERTEX, TRAIL_FRAGMENT);
  const trailLineGeometry = buildFireworkTrailLineGeometry();
  const trailLineMaterial = shaderMaterial('金菊柳尾连续线材质', commonUniforms, TRAIL_LINE_VERTEX, TRAIL_LINE_FRAGMENT);
  const trailLines = new THREE.LineSegments(trailLineGeometry, trailLineMaterial);
  trailLines.name = '金菊柳尾连续线';
  trailLines.frustumCulled = false;
  trailLines.renderOrder = 2;
  root.add(trailLines);
  const trails = new THREE.Points(trailGeometry, trailMaterial);
  trails.name = '金菊放射主枝';
  trails.frustumCulled = false;
  trails.renderOrder = 2;
  root.add(trails);

  const sparkGeometry = buildFireworkSparkGeometry();
  const sparkMaterial = shaderMaterial('冷绿白闪烁簇材质', commonUniforms, SPARK_VERTEX, SPARK_FRAGMENT);
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.name = '冷绿白闪烁簇';
  sparks.frustumCulled = false;
  sparks.renderOrder = 3;
  root.add(sparks);

  const flashUniforms = {
    fireworkTime: timeUniform,
    fireworkLaunchDuration: commonUniforms.fireworkLaunchDuration,
    fireworkFlashIntensity: { value: parameters.flashIntensity },
    fireworkFlashSize: { value: parameters.flashSize },
    fireworkFlash: { value: new THREE.Color(parameters.flashColor) },
    fireworkSparkle: commonUniforms.fireworkSparkle,
  };
  const flashMaterial = shaderMaterial('爆心闪光与青绿烟晕材质', flashUniforms, BILLBOARD_VERTEX, BILLBOARD_FRAGMENT);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flashMaterial);
  flash.name = '爆心闪光与青绿烟晕';
  flash.frustumCulled = false;
  flash.renderOrder = 1;
  root.add(flash);

  const backgroundUniforms = {
    fireworkBackgroundTime: { value: 0 },
    fireworkBackgroundStrength: { value: parameters.backgroundStrength },
    fireworkBackground: { value: new THREE.Color(parameters.backgroundColor) },
    fireworkHaze: { value: new THREE.Color(parameters.hazeColor) },
    fireworkAccent: { value: new THREE.Color(parameters.accentColor) },
  };
  const backgroundMaterial = shaderMaterial(
    '场景4夜空混色材质', backgroundUniforms, BACKGROUND_VERTEX, BACKGROUND_FRAGMENT,
    { transparent: false, depthTest: false, blending: THREE.NoBlending, side: THREE.BackSide },
  );
  const background = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 20), backgroundMaterial);
  background.name = '场景4独立夜空背景';
  background.renderOrder = -100;
  background.frustumCulled = false;
  scene.add(background, root);

  let disposed = false;
  let active = false;
  let previousTime = null;
  let previousStatusTime = -Infinity;
  let panelRefresh = () => {};
  let statusRefresh = () => {};

  function duration() {
    return parameters.launchDuration + parameters.burstLife;
  }

  function quality() {
    return FIREWORK_QUALITY[parameters.quality] || FIREWORK_QUALITY['均衡（推荐）'];
  }

  function apply() {
    if (disposed) return;
    root.visible = parameters.enabled;
    background.visible = parameters.enabled;
    commonUniforms.fireworkLaunchDuration.value = parameters.launchDuration;
    commonUniforms.fireworkBurstLife.value = parameters.burstLife;
    commonUniforms.fireworkBranches.value = parameters.branchCount;
    commonUniforms.fireworkTrailDensity.value = parameters.trailDensity;
    commonUniforms.fireworkBurstSpeed.value = parameters.burstSpeed;
    commonUniforms.fireworkSpread.value = parameters.spread;
    commonUniforms.fireworkDepth.value = parameters.depthSpread;
    commonUniforms.fireworkGravity.value = parameters.gravity;
    commonUniforms.fireworkDrag.value = parameters.drag;
    commonUniforms.fireworkWind.value = parameters.wind;
    commonUniforms.fireworkTrailLength.value = parameters.trailLength;
    commonUniforms.fireworkTrailWidth.value = parameters.trailWidth;
    commonUniforms.fireworkSparkSize.value = parameters.sparkSize;
    commonUniforms.fireworkSparkIntensity.value = parameters.sparkIntensity;
    commonUniforms.fireworkSparkPersistence.value = parameters.sparkPersistence;
    commonUniforms.fireworkGold.value.set(parameters.goldColor);
    commonUniforms.fireworkEmber.value.set(parameters.emberColor);
    commonUniforms.fireworkSparkle.value.set(parameters.sparkleColor);
    flashUniforms.fireworkFlashIntensity.value = parameters.flashIntensity;
    flashUniforms.fireworkFlashSize.value = parameters.flashSize;
    flashUniforms.fireworkFlash.value.set(parameters.flashColor);
    backgroundUniforms.fireworkBackgroundStrength.value = parameters.backgroundStrength;
    backgroundUniforms.fireworkBackground.value.set(parameters.backgroundColor);
    backgroundUniforms.fireworkHaze.value.set(parameters.hazeColor);
    backgroundUniforms.fireworkAccent.value.set(parameters.accentColor);
    const particleScale = quality().particleScale;
    sparkGeometry.setDrawRange(0, Math.min(FIREWORK_LIMITS.sparks, Math.floor(parameters.sparkCount * particleScale)));
    timeUniform.value = THREE.MathUtils.clamp(parameters.timeline, 0, duration());
    panelRefresh();
    statusRefresh();
    requestRender();
  }

  function setBackgroundPreset(style) {
    const preset = BACKGROUND_PRESETS[style];
    if (!preset) return;
    Object.assign(parameters, preset, { backgroundStyle: style });
    apply();
  }

  function seek(value, { pause = true } = {}) {
    parameters.timeline = THREE.MathUtils.clamp(Number(value) || 0, 0, duration());
    if (pause) parameters.playing = false;
    previousTime = null;
    timeUniform.value = parameters.timeline;
    panelRefresh();
    statusRefresh();
    requestRender();
  }

  function replay() {
    parameters.timeline = 0;
    parameters.playing = true;
    previousTime = null;
    timeUniform.value = 0;
    panelRefresh();
    statusRefresh();
    requestRender();
  }

  function update(timestamp, visible = true) {
    if (disposed || !active) return false;
    commonUniforms.fireworkPixelRatio.value = Math.min(renderer.getPixelRatio?.() || 1, 2);
    const animate = parameters.enabled && parameters.playing && parameters.speed > 0 && visible;
    if (animate && previousTime !== null) {
      const delta = Math.min(Math.max((timestamp - previousTime) / 1000, 0), .1) * parameters.speed;
      parameters.timeline += delta;
      const sequenceDuration = duration();
      if (parameters.timeline >= sequenceDuration) {
        if (parameters.loop) parameters.timeline %= sequenceDuration;
        else {
          parameters.timeline = sequenceDuration;
          parameters.playing = false;
          panelRefresh();
        }
      }
      timeUniform.value = parameters.timeline;
      if (timestamp - previousStatusTime > 100) {
        previousStatusTime = timestamp;
        statusRefresh();
      }
    }
    if (parameters.enabled && parameters.backgroundFlow && parameters.backgroundSpeed > 0 && visible) {
      backgroundUniforms.fireworkBackgroundTime.value += previousTime === null
        ? 0
        : Math.min(Math.max((timestamp - previousTime) / 1000, 0), .1) * parameters.backgroundSpeed;
    }
    previousTime = animate || (parameters.enabled && parameters.backgroundFlow && parameters.backgroundSpeed > 0 && visible)
      ? timestamp
      : null;
    return previousTime !== null;
  }

  function restore() {
    Object.assign(parameters, FIREWORK_DEFAULTS, { playing: !reducedMotion });
    backgroundUniforms.fireworkBackgroundTime.value = 0;
    previousTime = null;
    apply();
  }

  apply();
  return {
    parameters,
    root,
    rocket,
    trails,
    trailLines,
    sparks,
    flash,
    background,
    apply,
    update,
    seek,
    replay,
    restore,
    setBackgroundPreset,
    get duration() { return duration(); },
    get renderScale() { return quality().renderScale; },
    get visibleSparkCount() { return sparkGeometry.drawRange.count; },
    onPanelRefresh(callback) { panelRefresh = callback; },
    onStatusRefresh(callback) { statusRefresh = callback; },
    activate() { active = true; previousTime = null; requestRender(); },
    deactivate() { active = false; previousTime = null; },
    pauseClock() { previousTime = null; },
    setReducedMotion(value) {
      reducedMotion = value;
      if (value) {
        parameters.playing = false;
        parameters.backgroundFlow = false;
      }
      previousTime = null;
      panelRefresh();
      statusRefresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      background.removeFromParent();
      [rocketGeometry, trailGeometry, trailLineGeometry, sparkGeometry, flash.geometry, background.geometry]
        .forEach((geometry) => geometry.dispose());
      [rocketMaterial, trailMaterial, trailLineMaterial, sparkMaterial, flashMaterial, backgroundMaterial]
        .forEach((material) => material.dispose());
      panelRefresh = () => {};
      statusRefresh = () => {};
    },
  };
}

export function bindFireworkPanel(gui, firework, requestRender) {
  const folder = gui.addFolder('场景4·金菊闪柳烟花');
  const p = firework.parameters;
  const update = () => { firework.apply(); requestRender(); };
  folder.add(p, 'enabled').name('启用烟花场景').onChange(update);
  folder.add(p, 'playing').name('播放动画').onChange(update);
  folder.add(p, 'loop').name('循环播放').onChange(update);
  folder.add(p, 'speed', .2, 2, .01).name('播放速度').onChange(update);
  folder.add(p, 'timeline', 0, 13, .01).name('时间预览（秒）').onChange((value) => firework.seek(value));
  folder.add({ replay: () => firework.replay() }, 'replay').name('从头播放');
  folder.add(p, 'launchDuration', .8, 5, .05).name('升空时长').onChange(update);
  folder.add(p, 'burstLife', 3, 8, .05).name('绽放时长').onChange(update);
  folder.add(p, 'branchCount', 12, FIREWORK_LIMITS.branches, 1).name('金菊主枝数量').onChange(update);
  folder.add(p, 'trailDensity', 16, FIREWORK_LIMITS.trailSamples, 1).name('每枝尾迹密度').onChange(update);
  folder.add(p, 'burstSpeed', 2, 11, .05).name('绽放速度').onChange(update);
  folder.add(p, 'spread', .45, 1.5, .01).name('整体展开范围').onChange(update);
  folder.add(p, 'depthSpread', 0, 1, .01).name('三维纵深').onChange(update);
  folder.add(p, 'gravity', 0, 1.2, .01).name('柳尾下坠').onChange(update);
  folder.add(p, 'drag', .08, 1.2, .01).name('空气阻力').onChange(update);
  folder.add(p, 'wind', -.8, .8, .01).name('横向风力').onChange(update);
  folder.add(p, 'trailLength', .5, 6.5, .05).name('金色尾迹长度').onChange(update);
  folder.add(p, 'trailWidth', .35, 2.5, .01).name('金色尾迹宽度').onChange(update);
  folder.add(p, 'sparkCount', 500, FIREWORK_LIMITS.sparks, 50).name('闪烁粒子数量').onChange(update);
  folder.add(p, 'sparkSize', .35, 2.5, .01).name('闪烁粒子大小').onChange(update);
  folder.add(p, 'sparkIntensity', 0, 4, .01).name('冷绿闪烁强度').onChange(update);
  folder.add(p, 'sparkPersistence', .35, 2.2, .01).name('闪烁持续时间').onChange(update);
  folder.addColor(p, 'goldColor').name('金菊主枝颜色').onChange(update);
  folder.addColor(p, 'emberColor').name('柳尾余烬颜色').onChange(update);
  folder.addColor(p, 'sparkleColor').name('冷绿闪烁颜色').onChange(update);
  folder.addColor(p, 'flashColor').name('爆心闪光颜色').onChange(update);
  folder.add(p, 'flashIntensity', 0, 6, .01).name('爆心闪光强度').onChange(update);
  folder.add(p, 'flashSize', 1, 10, .05).name('爆心烟晕范围').onChange(update);
  folder.add(p, 'backgroundStyle', Object.keys(BACKGROUND_PRESETS)).name('夜空风格')
    .onChange((style) => firework.setBackgroundPreset(style));
  folder.add(p, 'backgroundFlow').name('夜空缓慢流动').onChange(update);
  folder.add(p, 'backgroundSpeed', 0, 1, .01).name('夜空流动速度').onChange(update);
  folder.add(p, 'backgroundStrength', 0, 1.5, .01).name('夜空混色强度').onChange(update);
  folder.addColor(p, 'backgroundColor').name('夜空底色').onChange(update);
  folder.addColor(p, 'hazeColor').name('烟霞颜色').onChange(update);
  folder.addColor(p, 'accentColor').name('梦境辅色').onChange(update);
  folder.add(p, 'bloomEnabled').name('启用烟花 Bloom').onChange(update);
  folder.add(p, 'bloomStrength', 0, 3, .01).name('烟花光晕强度').onChange(update);
  folder.add(p, 'bloomRadius', 0, 1, .01).name('烟花光晕半径').onChange(update);
  folder.add(p, 'bloomThreshold', 0, 2, .01).name('烟花光晕阈值').onChange(update);
  folder.add(p, 'quality', Object.keys(FIREWORK_QUALITY)).name('性能档位').onChange(update);
  folder.add({ reset: () => firework.restore() }, 'reset').name('重置烟花场景');

  const status = document.createElement('div');
  status.className = 'viewer-firework-status';
  folder.$children.appendChild(status);
  const note = document.createElement('div');
  note.className = 'viewer-effect-note';
  note.textContent = '参考视频被拆为升空尾迹、金菊放射主枝、冷绿白闪烁簇、金橙柳尾下坠和短暂过曝柔光。所有粒子使用固定批量几何与 GPU 轨迹；性能档位同时控制实际闪烁粒子数和后处理分辨率。场景4拥有独立夜空配色，不会改写场景2/3的梦境背景参数。';
  folder.$children.appendChild(note);

  function refresh() {
    const enabled = p.enabled;
    folder.controllers.filter((controller) => !['启用烟花场景', '重置烟花场景'].includes(controller._name))
      .forEach((controller) => controller.enable(enabled));
    folder.controllers.find((controller) => controller._name === '播放速度')?.enable(enabled && p.playing);
    folder.controllers.find((controller) => controller._name === '烟花光晕强度')?.enable(enabled && p.bloomEnabled);
    folder.controllers.find((controller) => controller._name === '烟花光晕半径')?.enable(enabled && p.bloomEnabled);
    folder.controllers.find((controller) => controller._name === '烟花光晕阈值')?.enable(enabled && p.bloomEnabled);
  }
  function refreshStatus() {
    const phase = p.timeline < p.launchDuration
      ? '升空'
      : p.timeline < p.launchDuration + p.burstLife * .18
        ? '爆心与初绽'
        : p.timeline < p.launchDuration + p.burstLife * .72
          ? '金菊闪柳'
          : '余烬消散';
    status.textContent = `${phase} · ${p.timeline.toFixed(1)} / ${firework.duration.toFixed(1)} 秒 · ${p.branchCount} 枝 · ${firework.visibleSparkCount} 个实际闪烁粒子`;
  }
  firework.onPanelRefresh(refresh);
  firework.onStatusRefresh(refreshStatus);
  refresh();
  refreshStatus();
  return folder;
}
