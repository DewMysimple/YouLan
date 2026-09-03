import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const ATMOSPHERE_DEFAULTS = Object.freeze({
  enabled: true, background: '流动混色', animated: true, speed: 0.18,
  backgroundStrength: 1.9, sunIntensity: 40, sunRadius: 0.6, distance: 12, sunMode: '无限远（太阳）',
  rays: 0.65, halo: 0.4, spread: 0.8, protection: 0.72,
});

// View-dependent art direction, not a volumetric scattering equation. The
// finite mode projects a world point; infinite mode projects a world direction
// through a finite camera-relative proxy. Rays stay fully active for every
// camera pose in which any part of the projected solar disk remains on screen.
export function projectSun(camera, position, worldRadius = 0, infinite = false) {
  const toward = position.clone().sub(camera.getWorldPosition(new THREE.Vector3()));
  const depth = toward.length();
  if (!depth) return { gate: 0, uv: new THREE.Vector2(0.5, 0.5), depth: 0, radius: 0 };
  toward.divideScalar(depth);
  const inFront = camera.getWorldDirection(new THREE.Vector3()).dot(toward) > 0;
  const p = position.clone().project(camera);
  if (![p.x, p.y, p.z].every(Number.isFinite)) {
    return { gate: 0, uv: new THREE.Vector2(.5, .5), depth, radius: 0 };
  }
  const uv = new THREE.Vector2(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
  const radius = Math.max(0, worldRadius) / depth /
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2));
  const radiusX = radius / Math.max(camera.aspect, Number.EPSILON);
  const intersectsViewport = uv.x + radiusX >= 0 && uv.x - radiusX <= 1 &&
    uv.y + radius >= 0 && uv.y - radius <= 1;
  const insideDepth = infinite || (p.z > -1 && p.z < 1);
  return { gate: inFront && insideDepth && intersectsViewport ? 1 : 0, uv, depth, radius };
}

const vertex = `varying vec2 vUv;
void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,1.0,1.0);}`;
const noise = `
float hash3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float softNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),
 mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),
 mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;
const skyFragment = () => `
varying vec2 vUv;
uniform mat4 inverseProjection, cameraWorld;
uniform float brightness;
uniform vec3 cream, pink, lavender;
${SUN_COMPOSITE_DECLARATIONS}
void main(){
 vec4 ray=inverseProjection*vec4(vUv*2.-1.,1.,1.);
 vec3 d=normalize(mat3(cameraWorld)*ray.xyz);
 vec3 p=d*3.2+vec3(dreamTime*.05,dreamTime*.018,0.);
 p+=vec3(softNoise(p+2.),softNoise(p+9.),softNoise(p-4.))*.85;
 float a=softNoise(p*1.6+vec3(0.,0.,dreamTime*.035));
 float b=softNoise(p*1.9+vec3(7.,3.,-dreamTime*.026));
 vec3 color=mix(pink,cream,smoothstep(.32,.62,a));
 color=mix(color,lavender,smoothstep(.44,.7,b)*.92);
 // The pastel reference contains colored streaks, not only white scatter.
 // Directional domain stretching of the sky is an artistic companion to the
 // solar glare, and is rendered INSIDE the transmission scene, not as CSS.
 vec2 delta=(vUv-dreamSunUv)*vec2(dreamAspect,1.);
 float angle=atan(delta.y,delta.x);
 float bands=.5+.5*sin(angle*6.+.45*sin(angle*3.)+.2*softNoise(vec3(delta*2.,dreamTime*.02)));
 vec3 streakColor=mix(lavender,cream,smoothstep(.18,.82,bands));
 streakColor=mix(streakColor,pink,.22);
 vec3 lightVisibility=dreamTransmittance(dreamSunUv);
 float visible=smoothstep(0.,.05,max(max(lightVisibility.r,lightVisibility.g),lightVisibility.b));
 float facing=dreamGate*visible*min(dreamOptics.y,1.4)*.63*(1.-exp(-length(delta)*14.));
 color=mix(color,streakColor,facing);
 gl_FragColor=vec4(color*brightness,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

// Added to the existing linear OutputPass BEFORE its tone mapping and sRGB
// conversion. Colored source visibility uses the actual front-face coverage
// texture (including the embedded insert), not the array's total copy count.
export const SUN_COMPOSITE_DECLARATIONS = `
uniform bool dreamActive, dreamHasCounts;
uniform sampler2D dreamCounts;
uniform vec2 dreamSunUv;
uniform vec4 dreamOptics;
uniform vec3 dreamTintOuter, dreamTintInner;
uniform vec2 dreamBlocking;
uniform vec3 dreamAccumulation;
uniform float dreamGate, dreamAspect, dreamRadius, dreamTime, dreamProtection;
${noise}
vec3 dreamTransmittance(vec2 uv){
 if(!dreamHasCounts || any(lessThan(uv,vec2(0.))) || any(greaterThan(uv,vec2(1.))))return vec3(1.);
 vec2 count=texture2D(dreamCounts,uv).rg;
 vec2 optical=max(count-1.,0.)*dreamAccumulation.y;
 vec2 extra=dreamAccumulation.z*optical/(dreamAccumulation.z+optical);
 vec2 path=min(count,1.)+extra*dreamAccumulation.x;
 // Opaque glass settings really block the source, independently of tint.
 float blocking=exp(-dot(min(count,vec2(256.)),dreamBlocking));
 return exp(-dreamTintOuter*path.x-dreamTintInner*path.y)*blocking;
}
vec3 dreamGlare(vec2 uv){
 if(!dreamActive || dreamGate<.00001)return vec3(0.);
 vec2 d=(uv-dreamSunUv)*vec2(dreamAspect,1.);
 float r=length(d),angle=atan(d.y,d.x);
 vec3 visibility=vec3(0.);
 // Small area sample avoids popping when the light crosses a glass edge.
 for(int i=0;i<5;i++){
   float a=float(i)*6.2831853/5.;
   visibility+=dreamTransmittance(dreamSunUv+vec2(cos(a)/dreamAspect,sin(a))*dreamRadius*.5);
 }
 visibility*=.2;
 float bands=.5+.5*sin(angle*6.+.45*sin(angle*3.));
 bands=smoothstep(.18,.82,bands);
 float wisps=.65+.35*softNoise(vec3(d*3.,dreamTime*.013));
 // Spread changes the reach of the rays, never whether an on-screen sun emits them.
 float falloff=exp(-r*1.55*(.8/max(dreamOptics.w,.01)))*(1.-exp(-r*34.));
 float coverage=dreamHasCounts?smoothstep(0.,1.,texture2D(dreamCounts,uv).g):0.;
 float protect=1.-dreamProtection*coverage;
 vec3 rays=mix(vec3(.82,.64,1.),vec3(1.,.9,.65),bands)*bands*wisps*falloff*dreamOptics.y*protect*.4;
 // Compact soft solar glare + four mild streaks; no fullscreen exposure lift.
 float halo=exp(-r*r/(.0018+dreamRadius*dreamRadius*5.));
 float streak=exp(-min(abs(d.x),abs(d.y))*180.)*exp(-r*30.);
 vec3 glow=vec3(1.,.88,.68)*(halo+streak*.15)*dreamOptics.z;
 return (rays+glow)*visibility*dreamGate*min(dreamOptics.x/12.,2.);
}
`;

export function createDreamAtmosphere(scene, camera, slices, { reducedMotion = false } = {}) {
  let motionReduced = reducedMotion;
  let panelRefresh = () => {};
  const parameters = { ...ATMOSPHERE_DEFAULTS, animated: !reducedMotion };
  const uniforms = {
    dreamActive: { value: false }, dreamHasCounts: { value: false }, dreamCounts: { value: null },
    dreamSunUv: { value: new THREE.Vector2(.5, .5) }, dreamOptics: { value: new THREE.Vector4() },
    dreamTintOuter: { value: new THREE.Vector3() }, dreamTintInner: { value: new THREE.Vector3() },
    dreamBlocking: { value: new THREE.Vector2() }, dreamAccumulation: { value: new THREE.Vector3() },
    dreamGate: { value: 0 }, dreamAspect: { value: 1 }, dreamRadius: { value: .01 },
    dreamTime: { value: 0 }, dreamProtection: { value: parameters.protection },
  };
  const skyMaterial = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: skyFragment(),
    uniforms: { ...uniforms, inverseProjection: { value: camera.projectionMatrixInverse }, cameraWorld: { value: camera.matrixWorld },
      brightness: { value: parameters.backgroundStrength },
      cream: { value: new THREE.Color('#fff19b') }, pink: { value: new THREE.Color('#ffb9e7') },
      lavender: { value: new THREE.Color('#b787f5') } }, depthWrite: false, depthTest: false });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMaterial);
  sky.name = '流动混色天空（独立环境）'; sky.frustumCulled = false; sky.renderOrder = -10000;
  const sunMaterial = new THREE.MeshBasicMaterial({ color: '#fff2d8' });
  const distantSun = { value: true };
  // Keep finite coordinates and the native unlit color pipeline. At infinity
  // the disk is drawn at the far depth, behind geometry even beyond its proxy.
  // Projection still uses camera rotation/FOV: it is NOT a screen-fixed icon.
  sunMaterial.onBeforeCompile = shader => {
    shader.uniforms.distantSun = distantSun;
    shader.vertexShader = 'uniform bool distantSun;\n' + shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nif (distantSun) gl_Position.z = gl_Position.w * 0.999999;');
  };
  const sun = new THREE.Mesh(new THREE.CircleGeometry(1, 64), sunMaterial);
  sun.frustumCulled = false;
  sun.name = '尽头亮心（独立亮源）';
  const group = new THREE.Group(); group.name = '梦境环境与尽头亮源'; group.add(sky, sun); scene.add(group);
  let source, baseSize = 9.1, disposed = false, previousTime = null;
  const bounds = new THREE.Box3(), dimensions = new THREE.Vector3();
  const black = new THREE.Color('#000000');
  const originalSun = new THREE.Color('#fff2d8');
  const solarEmission = new THREE.ShaderMaterial({ vertexShader: vertex,
    uniforms: { ...uniforms, solarColor: { value: originalSun } },
    fragmentShader: `${SUN_COMPOSITE_DECLARATIONS}
      varying vec2 vUv;uniform vec3 solarColor;
      void main(){vec2 d=(vUv-dreamSunUv)*vec2(dreamAspect,1.);
        float edge=max(fwidth(length(d)),.00005);
        float disk=1.-smoothstep(max(dreamRadius-edge,0.),dreamRadius+edge,length(d));
        gl_FragColor=vec4(solarColor*dreamOptics.x*disk*dreamTransmittance(vUv)*dreamGate*dreamOptics.z*2.5,0.);}`,
    transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const solarQuad = new FullScreenQuad(solarEmission);
  sky.onBeforeRender = syncCounts;

  function update(timestamp, visible = true) {
    if (disposed) return;
    const animate = parameters.enabled && parameters.background === '流动混色' && parameters.animated && parameters.speed > 0 && visible;
    if (animate && previousTime !== null) uniforms.dreamTime.value += Math.min((timestamp - previousTime) / 1000, .1) * parameters.speed;
    previousTime = animate ? timestamp : null;
    group.visible = parameters.enabled;
    if (parameters.enabled && !group.parent) scene.add(group);
    if (!parameters.enabled && group.parent) group.removeFromParent();
    sky.visible = parameters.enabled && parameters.background === '流动混色';
    skyMaterial.uniforms.brightness.value = parameters.backgroundStrength;
    sun.visible = parameters.enabled && parameters.sunIntensity > 0 && !!source;
    const infinite = parameters.sunMode === '无限远（太阳）';
    distantSun.value = infinite;
    if (source) {
      if (infinite) {
        // 50 is a projection reference, not a distance to the last slice.
        // Radius/distance ratio stays fixed under pan, dolly and depth changes.
        camera.getWorldPosition(sun.position); sun.position.z -= 50;
        sun.scale.setScalar(parameters.sunRadius);
      } else {
        bounds.setFromObject(source);
        bounds.getCenter(sun.position);
        sun.position.z = bounds.min.z - parameters.distance;
        sun.scale.setScalar(parameters.sunRadius * baseSize / 9.1);
      }
      sunMaterial.color.copy(originalSun).multiplyScalar(parameters.sunIntensity);
    }
    camera.updateMatrixWorld();
    const projected = projectSun(camera, sun.position, sun.scale.x, infinite);
    uniforms.dreamSunUv.value.copy(projected.uv);
    uniforms.dreamGate.value = sun.visible ? projected.gate : 0;
    uniforms.dreamAspect.value = camera.aspect;
    uniforms.dreamRadius.value = projected.radius;
    uniforms.dreamOptics.value.set(parameters.sunIntensity, parameters.rays, parameters.halo, parameters.spread);
    uniforms.dreamProtection.value = parameters.protection;
    uniforms.dreamActive.value = parameters.enabled;
    slices.requireCounts(parameters.enabled && sun.visible);
    return animate;
  }
  function syncCounts() {
    const data = slices.optics();
    uniforms.dreamCounts.value = data.texture;
    uniforms.dreamHasCounts.value = !!data.texture;
    uniforms.dreamAccumulation.value.set(slices.parameters.enabled ? 1 : 0, slices.parameters.strength, slices.parameters.limit);
    if (source) source.material.forEach((material, slot) => {
      const tint = slot ? uniforms.dreamTintInner.value : uniforms.dreamTintOuter.value;
      const weight = material.visible && source.visible ? material.opacity : 0;
      tint.set(...material.color.toArray().map(c => -Math.log(Math.max(c, .001)) * weight * material.transmission));
      uniforms.dreamBlocking.value.setComponent(slot, -Math.log(Math.max(1 - weight * (1 - material.transmission), .000001)));
    });
  }
  function renderWithBackground(render) {
    const previous = scene.background;
    if (parameters.enabled && parameters.background !== 'HDRI / 纯白') scene.background = parameters.background === '纯黑对照' ? black : null;
    try { render(); } finally { scene.background = previous; }
  }
  return { parameters, uniforms, sun, group, update, syncCounts, renderWithBackground,
    get effectActive() { return parameters.enabled; },
    get sunBloomActive() { return parameters.enabled && parameters.sunIntensity > 0 && parameters.halo > 0 && uniforms.dreamGate.value > 0; },
    renderEmission(renderer) { if (parameters.enabled && parameters.halo > 0 && uniforms.dreamGate.value > 0) solarQuad.render(renderer); },
    attach(mesh) { source = mesh; bounds.setFromObject(mesh).getSize(dimensions); baseSize = Math.max(dimensions.x, dimensions.y); },
    patchOutput(output) {
      if (!output.material.fragmentShader.includes('gl_FragColor = texture2D(tDiffuse, vUv);')) {
        throw new Error('最终颜色输出接口已改变，请检查梦境光效合成。');
      }
      Object.assign(output.uniforms, uniforms);
      output.material.fragmentShader = output.material.fragmentShader.replace('uniform sampler2D tDiffuse;', SUN_COMPOSITE_DECLARATIONS + '\nuniform sampler2D tDiffuse;');
      // OutputPass uses preprocessor branches, so append to its linear fetch.
      output.material.fragmentShader = output.material.fragmentShader.replace('gl_FragColor = texture2D(tDiffuse, vUv);',
        'gl_FragColor = texture2D(tDiffuse, vUv); gl_FragColor.rgb += dreamGlare(vUv);');
    },
    pauseClock() { previousTime = null; },
    onPanelRefresh(callback) { panelRefresh = callback; },
    setReducedMotion(value) { motionReduced = value; if (value) parameters.animated = false; panelRefresh(); },
    restore() { Object.assign(parameters, ATMOSPHERE_DEFAULTS, { animated: !motionReduced }); uniforms.dreamTime.value = 0; previousTime = null; panelRefresh(); },
    dispose() { if (disposed) return; disposed = true; slices.requireCounts(false); group.removeFromParent();
      sky.geometry.dispose(); skyMaterial.dispose(); sun.geometry.dispose(); sunMaterial.dispose();
      solarEmission.dispose(); solarQuad.dispose(); source = null; panelRefresh = () => {}; },
  };
}

export function bindAtmospherePanel(gui, atmosphere, requestRender) {
  const folder = gui.addFolder('梦境背景与迎光');
  const p = atmosphere.parameters;
  const update = () => { refresh(); requestRender(); };
  folder.add(p, 'enabled').name('启用梦境效果').onChange(update);
  folder.add(p, 'background', ['流动混色', 'HDRI / 纯白', '纯黑对照']).name('背景模式').onChange(update);
  const animated = folder.add(p, 'animated').name('背景流动').onChange(update);
  const speed = folder.add(p, 'speed', 0, 2, .01).name('流动速度').onChange(update);
  const brightness = folder.add(p, 'backgroundStrength', .2, 3, .01).name('混色背景亮度').onChange(requestRender);
  folder.add(p, 'sunIntensity', 0, 60, .1).name('尽头亮心强度').onChange(requestRender);
  folder.add(p, 'sunRadius', .1, 3, .01).name('亮心半径').onChange(requestRender);
  folder.add(p, 'sunMode', ['无限远（太阳）', '有限距离']).name('亮心距离模式').onChange(update);
  const distance = folder.add(p, 'distance', 1, 80, .1).name('亮心距末层').onChange(requestRender);
  folder.add(p, 'rays', 0, 2, .01).name('迎光放射强度').onChange(requestRender);
  folder.add(p, 'halo', 0, 2, .01).name('亮心柔晕').onChange(requestRender);
  folder.add(p, 'spread', .3, 1, .01).name('光束扩散范围').onChange(requestRender);
  folder.add(p, 'protection', 0, 1, .01).name('紫色层级保护').onChange(requestRender);
  const note = document.createElement('div'); note.className = 'viewer-effect-note';
  note.textContent = '无限远模式：太阳方向固定为世界 −Z，平移和拉近不改变视角大小，转动镜头会移出视野。半径控制视角大小；距末层只在有限距离下生效，数值保留。只要太阳圆盘仍与画面相交，光束就保持显示；圆盘完全移出视野后才隐藏。混色与 HDRI 照明分开；手动选图或清除切回 HDRI / 纯白。速度 0 或关闭流动即暂停，后台自动停。屏幕光效不含完整体积散射或多次折射。';
  folder.$children.appendChild(note);
  function refresh() { const moving = p.enabled && p.background === '流动混色'; animated.enable(moving); speed.enable(moving && p.animated); brightness.enable(moving); distance.enable(p.sunMode === '有限距离'); }
  atmosphere.onPanelRefresh(refresh);
  refresh();
  return refresh;
}
