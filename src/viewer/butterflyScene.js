import { SCENE_LABELS } from './sceneCatalog.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BUTTERFLY_FLOW_PALETTES, createButterflyFlowMaterial, syncButterflyFlowMaterial } from './butterflyFlowMaterial.js';

export const BUTTERFLY_DEFAULTS = Object.freeze({
  playing: true, speed: 1, amplitude: 1, hovering: true, drift: .65,
  palette: '晨光金蝶', flowing: true, flowSpeed: .34, flowScale: 3.6,
  flowWarp: 1.35, flowContrast: 1.12,
  flowColorA: '#ffe36f', flowColorB: '#ffbd20', flowColorC: '#ff692f',
  emissionStrength: .68, iridescence: .12, environmentIntensity: .38,
  dust: true,
});

export function disposeButterflyTree(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  textures.forEach(t => t.dispose());
}

function createDust(root) {
  let seed = 61023;
  const rand = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const positions = [], data = [];
  for (let i = 0; i < 160; i++) {
    positions.push((rand()-.5)*24,(rand()-.5)*17,-2-rand()*17);
    data.push(rand(), i < 32 ? 90+rand()*100 : 5+rand()*8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('seedSize', new THREE.Float32BufferAttribute(data,2));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 } },
    vertexShader: `attribute vec2 seedSize;uniform float time;varying float alpha;
      void main(){vec3 p=position;p.x+=.35*sin(time*.18+seedSize.x*40.);p.y+=.25*sin(time*.24+seedSize.x*21.);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(seedSize.y*10./max(1.,-mv.z),1.,120.);
        alpha=seedSize.y>80.?.055:.35;}`,
    fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;
      if(r>1.)discard;gl_FragColor=vec4(.63,.8,.57,exp(-r*r*5.)*(1.-smoothstep(.65,1.,r))*alpha);
      #include <colorspace_fragment>
    }`,
  });
  const dust = new THREE.Points(geometry, material);
  dust.name='林间微尘与远处散景'; dust.frustumCulled=false;root.add(dust);return dust;
}

export function createButterflyScene(scene, requestRender, { reducedMotion = false } = {}) {
  const parameters = { ...BUTTERFLY_DEFAULTS, playing: !reducedMotion };
  const root = new THREE.Group(); root.name=SCENE_LABELS.butterfly; scene.add(root);
  // The asset faces +Y with wings in XY. Lay it in XZ, head toward the −Z sun.
  // Keep this rest orientation outside the animated hover transform.
  const heading = new THREE.Group(); heading.name='蝴蝶水平迎光'; heading.rotation.x=-Math.PI/2; root.add(heading);
  const flight = new THREE.Group(); flight.name='蝴蝶悬停'; heading.add(flight);
  const dust = createDust(root);
  root.add(new THREE.HemisphereLight('#e7eee7','#292638',.5));
  const key=new THREE.DirectionalLight('#fff2e5',.82); key.position.set(-3,5,7);root.add(key);
  const rim=new THREE.DirectionalLight('#cddcf3',.48); rim.position.set(4,1,-5);root.add(rim);
  let model=null,mixer=null,actions=[],wingMaterials=[],loading=null,loadError=null;
  let active=false,disposed=false,previousTimestamp=null,time=0,flowTime=0,refresh=()=>{};
  const state=scene.userData.butterfly={ready:false,time:0,flowTime:0,animationClips:0};

  function apply() {
    if(disposed)return;
    actions.forEach(a=>{a.setEffectiveWeight(parameters.amplitude);a.setEffectiveTimeScale(parameters.speed);});
    mixer?.update(0);
    model?.traverse(o=>{if(o.isMesh){
      o.material.envMapIntensity=parameters.environmentIntensity;
    }});
    wingMaterials.forEach(material=>syncButterflyFlowMaterial(material,parameters,flowTime));
    dust.visible=parameters.dust;
    if(!parameters.hovering){flight.position.set(0,0,0);flight.rotation.set(0,0,0);}
    previousTimestamp=null;refresh();requestRender();
  }

  async function load() {
    const gltf=await new GLTFLoader().loadAsync('/models/blue-morpho-butterfly.glb');
    if(disposed){disposeButterflyTree(gltf.scene);return;}
    if(!gltf.animations.length || !gltf.scene.getObjectByName('LeftForewingPivot')) {
      disposeButterflyTree(gltf.scene);throw new Error('蝴蝶模型缺少翅膀关节或动画');
    }
    model=gltf.scene;
    // Capture an open-wing rest pose so action weight is an intuitive amplitude.
    let wingIndex=0;
    model.traverse(o=>{
      if(o.name.endsWith('Pivot'))o.quaternion.identity();
      if(!o.isMesh)return;
      const old=o.material;
      if(o.name.includes('wing')) {
        o.material=createButterflyFlowMaterial(parameters,wingIndex++*2.17);
        wingMaterials.push(o.material);
        old.map?.dispose();old.normalMap?.dispose();
        old.dispose();
      } else {o.material.side=THREE.DoubleSide;}
    });
    flight.add(model);
    mixer=new THREE.AnimationMixer(model);
    actions=gltf.animations.map(clip=>mixer.clipAction(clip).play());
    state.ready=true;state.animationClips=gltf.animations.length;
    apply();
  }
  function ensureLoaded(){
    if(disposed||loading||model)return;
    loadError=null;refresh();
    loading=load().catch(e=>{if(!disposed){loadError=e;loading=null;refresh();requestRender();}});
  }
  apply();
  return {
    parameters,root,apply,
    get ready(){return !!model;},get loadError(){return loadError;},
    onPanelRefresh(fn){refresh=fn;},
    activate(){active=true;previousTimestamp=null;ensureLoaded();requestRender();},
    deactivate(){active=false;previousTimestamp=null;},
    pauseClock(){previousTimestamp=null;},
    setReducedMotion(value){reducedMotion=value;if(value)parameters.playing=false;apply();},
    retry:ensureLoaded,
    setPalette(name){
      const colors=BUTTERFLY_FLOW_PALETTES[name];if(!colors)return;
      [parameters.flowColorA,parameters.flowColorB,parameters.flowColorC]=colors;
      parameters.palette=name;apply();
    },
    restore(){Object.assign(parameters,BUTTERFLY_DEFAULTS,{playing:!reducedMotion});flowTime=0;apply();},
    spread(){parameters.playing=false;parameters.amplitude=0;apply();},
    update(timestamp,visible=true){
      if(disposed||!active)return false;
      const wingAnimated=!!model&&visible&&parameters.playing&&parameters.speed>0;
      const flowAnimated=!!model&&visible&&!reducedMotion&&parameters.flowing&&parameters.flowSpeed>0;
      const animated=wingAnimated||flowAnimated;
      if(animated&&previousTimestamp!==null){
        const delta=Math.min(.05,Math.max(0,(timestamp-previousTimestamp)/1000));
        if(wingAnimated){time+=delta*parameters.speed;mixer.update(delta);
        if(parameters.hovering){
          const d=parameters.drift;
          flight.position.set(.42*Math.sin(time*.72)*d,.23*Math.sin(time*1.45)*d,.2*Math.sin(time*.5)*d);
          flight.rotation.set(.08*Math.sin(time*.9)*d,.19*Math.sin(time*.64)*d,.10*Math.sin(time*.8)*d);
        }}
        if(flowAnimated){flowTime+=delta*parameters.flowSpeed;wingMaterials.forEach(m=>syncButterflyFlowMaterial(m,parameters,flowTime));}
        dust.material.uniforms.time.value=time;
      }
      previousTimestamp=animated?timestamp:null;state.time=time;state.flowTime=flowTime;return animated;
    },
    dispose(){
      if(disposed)return;disposed=true;active=false;
      mixer?.stopAllAction();if(model)mixer?.uncacheRoot(model);
      root.removeFromParent();disposeButterflyTree(root);refresh=()=>{};scene.userData.butterfly=null;
    },
  };
}

export function bindButterflyPanel(gui,butterfly){
  const folder=gui.addFolder(SCENE_LABELS.butterfly);const p=butterfly.parameters,update=()=>butterfly.apply();
  folder.add(p,'playing').name('播放扇翅').onChange(update);
  folder.add(p,'speed',0,3,.01).name('扇翅速度').onChange(update);
  folder.add(p,'amplitude',0,1,.01).name('扇翅幅度').onChange(update);
  folder.add(p,'hovering').name('飞行起伏').onChange(update);
  folder.add(p,'drift',0,2,.01).name('起伏幅度').onChange(update);
  folder.add({spread:()=>butterfly.spread()},'spread').name('展开翅膀观察');
  folder.add(p,'palette',[...Object.keys(BUTTERFLY_FLOW_PALETTES),'自定义']).name('翼面配色方案').onChange(value=>butterfly.setPalette(value));
  const customize=folder.addFolder('程序流动混色材质');
  customize.add(p,'flowing').name('播放色彩流动').onChange(update);
  customize.add(p,'flowSpeed',0,2,.01).name('流动速度').onChange(update);
  customize.add(p,'flowScale',1,8,.01).name('混色尺度').onChange(update);
  customize.add(p,'flowWarp',0,3,.01).name('流动扭曲').onChange(update);
  customize.add(p,'flowContrast',.5,2,.01).name('色域对比').onChange(update);
  customize.addColor(p,'flowColorA').name('亮部奶黄').onChange(()=>{p.palette='自定义';update();});
  customize.addColor(p,'flowColorB').name('主色亮黄').onChange(()=>{p.palette='自定义';update();});
  customize.addColor(p,'flowColorC').name('暖部微橙').onChange(()=>{p.palette='自定义';update();});
  customize.add(p,'emissionStrength',0,4,.01).name('局部自发光').onChange(update);
  folder.add(p,'iridescence',0,1,.01).name('翅面虹彩').onChange(update);
  folder.add(p,'environmentIntensity',0,2,.01).name('HDRI 质感强度').onChange(update);
  folder.add(p,'dust').name('林间微光').onChange(update);
  folder.add({reset:()=>butterfly.restore()},'reset').name('重置蝴蝶');
  const status=document.createElement('div');status.className='viewer-butterfly-status viewer-effect-note';
  folder.$children.appendChild(status);
  const retry=folder.add({retry:()=>butterfly.retry()},'retry').name('重试模型加载');
  butterfly.onPanelRefresh(()=>{
    status.dataset.kind=butterfly.loadError?'error':butterfly.ready?'ready':'loading';
    status.textContent=butterfly.loadError?`蝴蝶加载失败：${butterfly.loadError.message}`
      :butterfly.ready?'无贴图程序混色 · 局部自发光 · 六套配色可选':'首次进入时加载蝴蝶模型…';
    retry.show(!!butterfly.loadError);folder.controllersRecursive().forEach(c=>c.updateDisplay());
  });
  butterfly.apply();return folder;
}
