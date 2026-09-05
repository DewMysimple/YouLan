import { browserHarness } from './browserHarness.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

// Run after browser-scene8.mjs against the same isolated page.
const output = process.argv[2], b = await browserHarness(output);
try {
  const result = await b.evaluate(`(async()=>{
    const THREE=await import('/source/threejs-transmission/build/three.module.js');
    const {createDepthGalleryScene}=await import('/src/viewer/depthGalleryScene.js');
    const scratch=new THREE.Scene(); let requests=0;
    const effect=createDepthGalleryScene(scratch,__renderer,()=>requests++);
    const status=document.createElement('div'); effect.setStatusElement(status);
    const originalLoad=THREE.TextureLoader.prototype.loadAsync;
    try {
      THREE.TextureLoader.prototype.loadAsync=function(url){
        return url.endsWith('05.webp')?Promise.reject(new Error('injected missing image')):originalLoad.call(this,url);
      };
      effect.activate(); await effect.retry();
    } finally { THREE.TextureLoader.prototype.loadAsync=originalLoad; }
    const failureReported=status.textContent.includes('1 张图片加载失败');
    await effect.retry();
    const retryWorked=effect.planes.every(p=>p.material.map)&&status.textContent.includes('1 / 5');
    effect.setSize(1440,900); effect.parameters.animate=false;
    effect.planes.forEach(p=>__renderer.initTexture(p.material.map));
    effect.update(0); effect.render();
    const before={...__renderer.info.memory};
    effect.dispose(); effect.dispose(); const mark=requests;
    const after={...__renderer.info.memory};
    __renderer.domElement.dispatchEvent(new WheelEvent('wheel',{deltaY:200}));
    __renderer.domElement.dispatchEvent(new PointerEvent('pointermove',{isPrimary:true,clientX:30,clientY:20}));
    const cleaned={geometry:after.geometries===before.geometries-4,textures:after.textures===before.textures-5,
      events:requests===mark,sceneEmpty:scratch.children.length===0};
    let resolvePending; let textureDisposals=0;
    THREE.TextureLoader.prototype.loadAsync=()=>new Promise(resolve=>{
      const prior=resolvePending; resolvePending=()=>{prior?.(); const texture=new THREE.Texture();
        texture.addEventListener('dispose',()=>textureDisposals++); resolve(texture);};
    });
    const late=createDepthGalleryScene(new THREE.Scene(),__renderer,()=>requests++);
    try {
      late.activate(); const pending=late.retry(); late.dispose(); resolvePending(); await pending;
    } finally { THREE.TextureLoader.prototype.loadAsync=originalLoad; }
    return {failureReported,retryWorked,...cleaned,lateTextureCleanup:textureDisposals===5};
  })()`);
  assert.ok(Object.values(result).every(Boolean), JSON.stringify(result));
  await writeFile(join(output, 'lifecycle-report.json'), JSON.stringify(result, null, 2));
  console.log(result);
} finally { b.close(); }
