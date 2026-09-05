import * as THREE from 'three';

export const BUTTERFLY_FLOW_PALETTES = Object.freeze({
  '晨光金蝶': ['#ffe36f', '#ffbd20', '#ff692f'],
  '柠檬萤火': ['#dfff69', '#bddd16', '#ff9e1d'],
  '杏桃日晕': ['#ffd477', '#ffa91f', '#ff5741'],
  '蜂蜜琥珀': ['#ffc64a', '#e78b0c', '#c94b18'],
  '月白金辉': ['#ffeab0', '#edbd35', '#ff8744'],
  '青柠暖焰': ['#b9e944', '#ffc20d', '#ff5f21'],
});

const FLOW_VERTEX = `
varying vec2 vButterflyFlowUv;
varying vec3 vButterflyFlowPosition;
`;

const FLOW_FRAGMENT = `
uniform vec3 butterflyFlowColorA;
uniform vec3 butterflyFlowColorB;
uniform vec3 butterflyFlowColorC;
uniform float butterflyFlowTime;
uniform float butterflyFlowScale;
uniform float butterflyFlowWarp;
uniform float butterflyFlowContrast;
uniform float butterflyFlowEmission;
uniform float butterflyFlowPhase;
varying vec2 vButterflyFlowUv;
varying vec3 vButterflyFlowPosition;

float butterflyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float butterflyNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(butterflyHash(i),butterflyHash(i+vec2(1.0,0.0)),f.x),
    mix(butterflyHash(i+vec2(0.0,1.0)),butterflyHash(i+vec2(1.0,1.0)),f.x),f.y);
}
float butterflyFbm(vec2 p) {
  float value=0.0;
  value+=butterflyNoise(p)*0.55;p=p*2.03+11.7;
  value+=butterflyNoise(p)*0.28;p=p*2.01+7.2;
  value+=butterflyNoise(p)*0.17;
  return value;
}
vec4 butterflyFlowSample() {
  vec2 p=(vButterflyFlowUv-0.5)*butterflyFlowScale;
  p.x+=vButterflyFlowPosition.y*0.18;
  float t=butterflyFlowTime;
  vec2 warp=vec2(
    butterflyFbm(p*0.72+vec2(t*0.16,butterflyFlowPhase)),
    butterflyFbm(p*0.69+vec2(8.3,-t*0.13-butterflyFlowPhase))
  )-0.5;
  vec2 q=p+warp*butterflyFlowWarp;
  float broad=butterflyFbm(q+vec2(t*0.11,-t*0.075));
  float ribbon=0.5+0.5*sin(q.x*1.35-q.y*0.78+t*0.34+butterflyFlowPhase+broad*4.2);
  float blend=smoothstep(0.18,0.82,mix(broad,ribbon,0.48));
  blend=clamp((blend-0.5)*butterflyFlowContrast+0.5,0.0,1.0);
  float ember=butterflyFbm(q*1.37+vec2(-t*0.09,t*0.12)+4.6);
  vec3 color=mix(butterflyFlowColorA,butterflyFlowColorB,blend);
  color=mix(color,butterflyFlowColorC,smoothstep(0.48,0.82,ember+0.12*ribbon)*0.88);
  float glowMask=0.04+0.96*smoothstep(0.5,0.9,max(blend,ember*0.92));
  return vec4(color,glowMask);
}
`;

export function createButterflyFlowMaterial(parameters, phase = 0) {
  const uniforms = {
    butterflyFlowColorA: { value: new THREE.Color(parameters.flowColorA) },
    butterflyFlowColorB: { value: new THREE.Color(parameters.flowColorB) },
    butterflyFlowColorC: { value: new THREE.Color(parameters.flowColorC) },
    butterflyFlowTime: { value: 0 },
    butterflyFlowScale: { value: parameters.flowScale },
    butterflyFlowWarp: { value: parameters.flowWarp },
    butterflyFlowContrast: { value: parameters.flowContrast },
    butterflyFlowEmission: { value: parameters.emissionStrength },
    butterflyFlowPhase: { value: phase },
  };
  const material = new THREE.MeshPhysicalMaterial({
    name: '程序流动混色自发光翼面', color: '#ffffff', emissive: '#ffffff',
    emissiveIntensity: 1, roughness: .48, metalness: 0,
    sheen: .32, sheenColor: new THREE.Color('#fff0b8'), sheenRoughness: .72,
    clearcoat: .16, clearcoatRoughness: .62,
    iridescence: parameters.iridescence, iridescenceIOR: 1.3,
    iridescenceThicknessRange: [170, 360], side: THREE.DoubleSide,
  });
  material.userData.butterflyFlowUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = FLOW_VERTEX + shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vButterflyFlowUv=uv;
        vButterflyFlowPosition=position;`);
    shader.fragmentShader = FLOW_FRAGMENT + shader.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec4 butterflyFlow=butterflyFlowSample();
        diffuseColor.rgb=butterflyFlow.rgb*0.48;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance=butterflyFlow.rgb*butterflyFlowEmission*butterflyFlow.a;`);
  };
  material.customProgramCacheKey = () => 'butterfly-flow-material-v1';
  return material;
}

export function syncButterflyFlowMaterial(material, parameters, time) {
  const uniforms=material.userData.butterflyFlowUniforms;
  if(!uniforms)return;
  uniforms.butterflyFlowColorA.value.set(parameters.flowColorA);
  uniforms.butterflyFlowColorB.value.set(parameters.flowColorB);
  uniforms.butterflyFlowColorC.value.set(parameters.flowColorC);
  uniforms.butterflyFlowTime.value=time;
  uniforms.butterflyFlowScale.value=parameters.flowScale;
  uniforms.butterflyFlowWarp.value=parameters.flowWarp;
  uniforms.butterflyFlowContrast.value=parameters.flowContrast;
  uniforms.butterflyFlowEmission.value=parameters.emissionStrength;
  material.iridescence=parameters.iridescence;
  material.envMapIntensity=parameters.environmentIntensity;
}
