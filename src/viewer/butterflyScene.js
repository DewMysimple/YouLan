import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const BUTTERFLY_DEFAULTS = Object.freeze({
  playing: true, speed: 1, amplitude: 1, hovering: true, drift: .65,
  wingTint: '#ffffff', iridescence: .08, environmentIntensity: .45,
  dust: true, backgroundTop: '#284b50', backgroundBottom: '#080e22',
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

function createBackdrop(root, p) {
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { top: { value: new THREE.Color(p.backgroundTop) }, bottom: { value: new THREE.Color(p.backgroundBottom) } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform vec3 top,bottom;
      void main(){vec2 uv=vUv;vec3 col=mix(bottom,top,smoothstep(0.,1.,uv.y));
        float glow=exp(-dot((uv-vec2(.32,.75))*vec2(1.,1.4),(uv-vec2(.32,.75))*vec2(1.,1.4))*8.);
        col+=vec3(.10,.12,.075)*glow;
        col*=1.-.38*smoothstep(.25,.8,length(uv-.5));
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = '场景6·林间柔光'; mesh.frustumCulled = false; mesh.renderOrder = -1000;
  root.add(mesh); return material;
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
  const root = new THREE.Group(); root.name='场景6·蝶翼'; scene.add(root);
  const flight = new THREE.Group(); flight.name='蝴蝶悬停'; root.add(flight);
  const background = createBackdrop(root, parameters), dust = createDust(root);
  root.add(new THREE.HemisphereLight('#e7eee7','#292638',1.2));
  const key=new THREE.DirectionalLight('#fff2e5',2.1); key.position.set(-3,5,7);root.add(key);
  const rim=new THREE.DirectionalLight('#cddcf3',1.4); rim.position.set(4,1,-5);root.add(rim);
  let model=null,mixer=null,actions=[],loading=null,loadError=null;
  let active=false,disposed=false,previousTimestamp=null,time=0,refresh=()=>{};
  const state=scene.userData.butterfly={ready:false,time:0,animationClips:0};

  function apply() {
    if(disposed)return;
    actions.forEach(a=>{a.setEffectiveWeight(parameters.amplitude);a.setEffectiveTimeScale(parameters.speed);});
    mixer?.update(0);
    model?.traverse(o=>{if(o.isMesh){
      o.material.envMapIntensity=parameters.environmentIntensity;
      if(o.name.includes('wing')) {o.material.color.set(parameters.wingTint);o.material.iridescence=parameters.iridescence;}
    }});
    background.uniforms.top.value.set(parameters.backgroundTop);
    background.uniforms.bottom.value.set(parameters.backgroundBottom);
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
    model.traverse(o=>{
      if(o.name.endsWith('Pivot'))o.quaternion.identity();
      if(!o.isMesh)return;
      const old=o.material;
      if(o.name.includes('wing')) {
        o.material=new THREE.MeshPhysicalMaterial({map:old.map,normalMap:old.normalMap,
          normalScale:old.normalScale.clone(),side:THREE.DoubleSide,
          roughness:.72,metalness:0,sheen:.25,sheenColor:new THREE.Color('#f5e2dc'),
          sheenRoughness:.8,iridescence:parameters.iridescence,
          iridescenceIOR:1.3,iridescenceThicknessRange:[180,390]});
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
    restore(){Object.assign(parameters,BUTTERFLY_DEFAULTS,{playing:!reducedMotion});apply();},
    spread(){parameters.playing=false;parameters.amplitude=0;apply();},
    update(timestamp,visible=true){
      if(disposed||!active)return false;
      const animated=!!model&&visible&&parameters.playing&&parameters.speed>0;
      if(animated&&previousTimestamp!==null){
        const delta=Math.min(.05,Math.max(0,(timestamp-previousTimestamp)/1000));
        time+=delta*parameters.speed;mixer.update(delta);
        if(parameters.hovering){
          const d=parameters.drift;
          flight.position.set(.42*Math.sin(time*.72)*d,.23*Math.sin(time*1.45)*d,.2*Math.sin(time*.5)*d);
          flight.rotation.set(.08*Math.sin(time*.9)*d,.19*Math.sin(time*.64)*d,.10*Math.sin(time*.8)*d);
        }
        dust.material.uniforms.time.value=time;
      }
      previousTimestamp=animated?timestamp:null;state.time=time;return animated;
    },
    dispose(){
      if(disposed)return;disposed=true;active=false;
      mixer?.stopAllAction();if(model)mixer?.uncacheRoot(model);
      root.removeFromParent();disposeButterflyTree(root);refresh=()=>{};scene.userData.butterfly=null;
    },
  };
}

export function bindButterflyPanel(gui,butterfly){
  const folder=gui.addFolder('场景6·蝶翼');const p=butterfly.parameters,update=()=>butterfly.apply();
  folder.add(p,'playing').name('播放扇翅').onChange(update);
  folder.add(p,'speed',0,3,.01).name('扇翅速度').onChange(update);
  folder.add(p,'amplitude',0,1,.01).name('扇翅幅度').onChange(update);
  folder.add(p,'hovering').name('飞行起伏').onChange(update);
  folder.add(p,'drift',0,2,.01).name('起伏幅度').onChange(update);
  folder.add({spread:()=>butterfly.spread()},'spread').name('展开翅膀观察');
  folder.addColor(p,'wingTint').name('翅膀染色').onChange(update);
  folder.add(p,'iridescence',0,1,.01).name('翅面虹彩').onChange(update);
  folder.add(p,'environmentIntensity',0,2,.01).name('HDRI 质感强度').onChange(update);
  folder.add(p,'dust').name('林间微光').onChange(update);
  folder.addColor(p,'backgroundTop').name('背景顶部').onChange(update);
  folder.addColor(p,'backgroundBottom').name('背景底部').onChange(update);
  folder.add({reset:()=>butterfly.restore()},'reset').name('重置蝴蝶');
  const status=document.createElement('div');status.className='viewer-butterfly-status viewer-effect-note';
  folder.$children.appendChild(status);
  const retry=folder.add({retry:()=>butterfly.retry()},'retry').name('重试模型加载');
  butterfly.onPanelRefresh(()=>{
    status.dataset.kind=butterfly.loadError?'error':butterfly.ready?'ready':'loading';
    status.textContent=butterfly.loadError?`蝴蝶加载失败：${butterfly.loadError.message}`
      :butterfly.ready?'四片独立翅膀 · 循环扇动 · 可拖动观察':'首次进入时加载蝴蝶模型…';
    retry.show(!!butterfly.loadError);folder.controllers.forEach(c=>c.updateDisplay());
  });
  butterfly.apply();return folder;
}
