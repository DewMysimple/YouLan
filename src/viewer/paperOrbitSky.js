import * as THREE from 'three';
import { seededRandom } from './paperOrbitMotion.js';

export const PAPER_SKY_DEFAULTS = Object.freeze({
  clouds: true, cloudOpacity: .78, cloudDrift: .35, sunStrength: .65,
});

const noiseGLSL = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){return .55*noise(p)+.27*noise(p*2.03+7.)+.13*noise(p*4.07+19.);}
`;

// World-space cloud banks: distant sky, middle-distance islands, then the
// approach corridor. No camera-attached cloud layer, texture download or RNG per frame.
export function createCloudBanks() {
  const random = seededRandom(20260906), banks = [];
  function add(x, y, z, width, height, opacity) {
    banks.push({ center: new THREE.Vector3(x, y, z), width, height, opacity, seed: random() * 100 });
  }
  for (let i = 0; i < 36; i++) {
    const a = i * Math.PI * 2 / 36, r = 64 + random() * 30;
    add(Math.cos(a) * r, -14 + random() * 36, Math.sin(a) * r,
      16 + random() * 21, 6 + random() * 9, .5 + random() * .25);
  }
  for (let i = 0; i < 18; i++) {
    const a = i * Math.PI * 2 / 18, r = 22 + random() * 15;
    add(Math.cos(a) * r, i % 3 === 0 ? 11 + random() * 5 : -9 - random() * 5,
      Math.sin(a) * r, 10 + random() * 11, 4 + random() * 4, .7);
  }
  for (const bank of [
    [-8, 0, 48, 13, 6], [9, -2, 53, 15, 6], [-9, 10, 63, 16, 7],
    [17, 7, 60, 13, 5], [2, -7, 65, 22, 8], [-18, 4, 75, 25, 9],
    [17, -2, 39, 12, 5], [4, 10, 35, 11, 5], [24, 3, 30, 13, 7],
    [6, -4, 26, 14, 6], [23, 10, 16, 16, 7], [-10, 7, -25, 17, 7],
  ]) add(...bank, .85);
  return banks;
}

export function createPaperOrbitSky(root, camera, parameters) {
  const skyUniforms = {
    skyTop: { value: new THREE.Color(parameters.backgroundTop) },
    skyBottom: { value: new THREE.Color(parameters.backgroundBottom) },
    skyAccent: { value: new THREE.Color(parameters.backgroundAccent) },
    cameraWorld: { value: new THREE.Matrix4() }, inverseProjection: { value: new THREE.Matrix4() },
    sunDirection: { value: new THREE.Vector3(.9, .25, 1).normalize() },
    sunStrength: { value: parameters.sunStrength },
  };
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false, uniforms: skyUniforms,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}',
    fragmentShader: `varying vec2 vUv;
      uniform vec3 skyTop,skyBottom,skyAccent,sunDirection;
      uniform mat4 inverseProjection,cameraWorld; uniform float sunStrength;
      void main(){
        vec3 ray=normalize(mat3(cameraWorld)*(inverseProjection*vec4(vUv*2.-1.,1.,1.)).xyz);
        float elevation=smoothstep(-.42,.62,ray.y);
        vec3 color=mix(skyBottom,skyTop,elevation);
        color=mix(color,skyAccent,.22*exp(-6.*abs(ray.y+.03)));
        float angle=acos(clamp(dot(ray,sunDirection),-1.,1.));
        float aureole=exp(-angle*angle*9.);
        color=mix(color,vec3(1.,.79,.54),aureole*.33*sunStrength);
        float disc=1.-smoothstep(.024,.031,angle);
        float halo=exp(-angle*angle*170.);
        vec3 basisX=normalize(cross(vec3(0.,1.,0.),sunDirection));
        vec3 basisY=cross(sunDirection,basisX);
        float phi=atan(dot(ray,basisY),dot(ray,basisX));
        float rays=pow(.5+.5*sin(phi*9.+.6*sin(phi*3.)),12.)
          *exp(-angle*8.)*smoothstep(.03,.08,angle);
        color+=vec3(1.,.85,.63)*(disc*.65+halo*.19+rays*.028)*sunStrength;
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  }));
  backdrop.name = '场景5·粉彩天空'; backdrop.frustumCulled = false; backdrop.renderOrder = -10000;
  root.add(backdrop);

  const random = seededRandom(7331);
  const banks = createCloudBanks().flatMap(bank => Array.from({ length: 10 }, (_, i) => ({
    center: bank.center.clone().add(new THREE.Vector3(
      (random() - .5) * bank.width * .7,
      (random() - .5) * bank.height * .45,
      (random() - .5) * bank.height * .8)),
    width: bank.width * (.27 + random() * .14),
    height: bank.height * (.48 + random() * .28),
    opacity: bank.opacity * (i < 4 ? .85 : .65), seed: random() * 100,
  })));
  const geometry = new THREE.PlaneGeometry(1, 1);
  const details = new THREE.InstancedBufferAttribute(new Float32Array(banks.length * 4), 4);
  geometry.setAttribute('cloudData', details);
  const cloudUniforms = { opacity: { value: parameters.cloudOpacity }, sunStrength: skyUniforms.sunStrength };
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: cloudUniforms,
    vertexShader: `attribute vec4 cloudData; varying vec2 vUv; varying vec4 vCloud; varying float vDepth;
      void main(){vUv=uv;vCloud=cloudData;
        vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        vDepth=-center.z;
        center.xy+=position.xy*cloudData.xy;
        gl_Position=projectionMatrix*center;
      }`,
    fragmentShader: `${noiseGLSL}
      varying vec2 vUv; varying vec4 vCloud; varying float vDepth;
      uniform float opacity,sunStrength;
      void main(){
        vec2 p=vUv*2.-1.; float seed=vCloud.z;
        float n=fbm(p*3.+seed);
        float r2=max(0.,dot(p,p)+(n-.45)*.18);
        if(r2>1.)discard;
        float thickness=sqrt(max(0.,1.-r2));
        vec3 normal=normalize(vec3(p,thickness));
        float light=clamp(dot(normal,normalize(vec3(-.45,.7,1.))),0.,1.);
        vec3 color=mix(vec3(.39,.45,.62),vec3(1.,.97,.91),.28+.7*light);
        color+=vec3(1.,.85,.68)*pow(1.-thickness,3.)*.055*sunStrength;
        float density=smoothstep(0.,.65,1.-r2)*.8;
        float alpha=density*opacity*vCloud.w*smoothstep(.6,3.5,vDepth);
        if(alpha<.003)discard;
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const clouds = new THREE.InstancedMesh(geometry, cloudMaterial, banks.length);
  clouds.name = '场景5·远近云层'; clouds.frustumCulled = false;
  // Each bank has puffs at different world depths; sort all translucent puffs
  // back-to-front after camera motion, including during the intro.
  clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage); details.setUsage(THREE.DynamicDrawUsage);
  root.add(clouds);
  const matrix = new THREE.Matrix4(), depthPoint = new THREE.Vector3();
  const sorted = banks.map(bank => ({ bank, depth: 0, x: 0 }));
  let time = 0;
  return {
    backdrop, clouds,
    apply() {
      skyUniforms.skyTop.value.set(parameters.backgroundTop);
      skyUniforms.skyBottom.value.set(parameters.backgroundBottom);
      skyUniforms.skyAccent.value.set(parameters.backgroundAccent);
      skyUniforms.sunStrength.value = parameters.sunStrength;
      cloudUniforms.opacity.value = parameters.cloudOpacity;
      clouds.visible = parameters.clouds && parameters.cloudOpacity > 0;
    },
    update(delta) {
      time += delta * parameters.cloudDrift;
      camera.updateMatrixWorld();
      skyUniforms.cameraWorld.value.copy(camera.matrixWorld);
      skyUniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      if (!clouds.visible) return;
      for (const item of sorted) {
        item.x = item.bank.center.x + Math.sin(time * .025 + item.bank.seed) * 1.3;
        depthPoint.copy(item.bank.center); depthPoint.x = item.x;
        item.depth = depthPoint.applyMatrix4(camera.matrixWorldInverse).z;
      }
      sorted.sort((a, b) => a.depth - b.depth);
      sorted.forEach(({ bank, x }, i) => {
        matrix.makeTranslation(x, bank.center.y, bank.center.z);
        clouds.setMatrixAt(i, matrix);
        details.setXYZW(i, bank.width, bank.height, bank.seed, bank.opacity);
      });
      clouds.instanceMatrix.needsUpdate = true; details.needsUpdate = true;
    },
  };
}
