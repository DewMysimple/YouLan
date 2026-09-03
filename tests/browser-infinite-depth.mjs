import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output=process.argv[2];await mkdir(output,{recursive:true});
const b=await browserHarness(output),D=['深邃效果'],A=['梦境背景与迎光'];
const report={};
const wake=()=>b.set(['渲染设置'],'曝光',1);
const settle=()=>b.delay(200);
const sameOptics=(a,b)=>{assert.ok(Math.abs(a.radius-b.radius)<1e-12);assert.ok(Math.abs(a.gate-b.gate)<1e-12);a.uv.forEach((v,i)=>assert.ok(Math.abs(v-b.uv[i])<1e-12));};
const pose=async(position,target)=>{await b.evaluate(`__camera.position.set(...${JSON.stringify(position)});__camera.lookAt(...${JSON.stringify(target)});`);await wake();await settle();};
try {
  await b.open({dream:true});await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  await b.set(A,'背景流动',false);await settle();
  await b.evaluate(`window.sky=scene.getObjectByName('流动混色天空（独立环境）');window.sun=scene.getObjectByName('尽头亮心（独立亮源）');window.initialCamera=__camera.position.toArray();`);
  report.folders=await b.evaluate(`Array.from(document.querySelector('.lil-gui.root > .children').children).filter(e=>e.classList.contains('lil-gui')).map(e=>e.querySelector(':scope > .title').textContent)`);
  assert.deepEqual(report.folders,['深邃效果','梦境背景与迎光','HDRI 环境设置','外框插槽管理','内框插槽管理','渲染设置']);
  assert.equal(await b.evaluate(`!!folder(['阵列修改器'])`),false);
  // Every existing non-array control remains reachable, with the same binding.
  const inventory={
    '深邃效果':['纵深数量','纵深间距','首层取景视角（°）','首层正面取景','适配全部','恢复调好的默认效果','纯透射对照','仅颜色层级对照','局部 Bloom 光晕','光晕强度','光晕半径','光晕阈值'],
    '梦境背景与迎光':['启用梦境效果','背景模式','背景流动','流动速度','混色背景亮度','尽头亮心强度','亮心半径','亮心距末层','迎光放射强度','亮心柔晕','光束扩散范围','紫色层级保护','亮心距离模式'],
    'HDRI 环境设置':['选择本地贴图','清除贴图','使用内置 HDRI','环境强度','显示贴图背景','背景亮度','背景模糊','水平旋转（°）'],
    '渲染设置':['内嵌色体透射','轮廓清晰度','轮廓宽度（像素）','切片颜色累积','累积强度','加深上限','HDRI 分级显色','曝光','透射分辨率比例'],
  };
  inventory['外框插槽管理']=inventory['内框插槽管理']=['颜色','自发光颜色','自发光强度','透射率','不透明度','写入深度（遮挡后层）','金属度','粗糙度','折射率（IOR）','厚度','镜面反射强度','镜面反射颜色','环境贴图强度','仅局部光纹发光'];
  for(const [name,labels] of Object.entries(inventory)) for(const label of labels)assert.equal(await b.evaluate(`!!controller([${JSON.stringify(name)}],${JSON.stringify(label)})`),true,`${name}/${label}`);
  report.preservedControls=Object.values(inventory).reduce((n,a)=>n+a.length,0);
  const optics=()=>b.evaluate(`({uv:sky.material.uniforms.dreamSunUv.value.toArray(),radius:sky.material.uniforms.dreamRadius.value,gate:sky.material.uniforms.dreamGate.value})`);
  const infinite=await optics();
  assert.equal(await b.evaluate(`controller(['梦境背景与迎光'],'亮心距末层').querySelector('input').disabled`),true);
  await b.set(A,'亮心距离模式','有限距离');await settle();const finite=await optics();
  assert.ok(Math.abs(finite.radius/infinite.radius-1)<.06,'default angular size visually close to previous source');
  await b.set(A,'亮心距末层',80);await settle();const finiteFar=await optics();assert.ok(finiteFar.radius<finite.radius/2);
  await b.set(A,'亮心距离模式','无限远（太阳）');await settle();sameOptics(await optics(),infinite);
  for(const position of [[30,10,1000],[-100,0,-3000]]) {
    await pose(position,[position[0],position[1],position[2]-1]);sameOptics(await optics(),infinite);
  }
  await pose([0,0,14],[10,0,-40]);const turned=await optics();assert.notEqual(turned.uv[0],.5);
  await b.evaluate(`__camera.fov=75;__camera.updateProjectionMatrix();`);
  await pose([0,0,14],[45,0,-40]);const extreme75=await optics();assert.equal(extreme75.gate,1);assert.ok(extreme75.uv[0]<.15);await b.screenshot('00-fov75-sun-visible-rays-on.png');
  await b.set(A,'光束扩散范围',.3);await settle();assert.equal((await optics()).gate,1);
  await b.set(A,'光束扩散范围',1);await settle();assert.equal((await optics()).gate,1);
  await b.set(A,'光束扩散范围',.8);
  await pose([0,0,14],[90,0,-40]);const outside75=await optics();assert.equal(outside75.gate,0);await b.screenshot('00-fov75-sun-outside-rays-off.png');
  await pose([0,0,-3000],[0,0,0]);assert.equal((await optics()).gate,0);
  report.sun={infinite,finite,finiteFar,turned,extreme75,outside75,translation:'invariant',visibility:'rays persist until solar disk exits viewport'};
  await b.click(D,'首层正面取景');await settle();
  const materials=await b.evaluate('mesh.material.map(m=>({color:m.color.getHexString(),opacity:m.opacity,emissive:m.emissiveIntensity}))');
  const camera=await b.evaluate('__camera.position.toArray()');
  for(const count of [1,2,100,101,199,200]) {
    await b.set(D,'纵深数量',count);await settle();
    assert.equal(await b.evaluate('mesh.geometry.index.count'),84*count);
    assert.deepEqual(await b.evaluate('mesh.geometry.groups.map(g=>g.count)'),[72*count,12*count]);
    assert.deepEqual(await b.evaluate('__camera.position.toArray()'),camera);
    sameOptics(await optics(),infinite);
  }
  await b.set(D,'纵深数量',201);await settle();assert.equal(await b.evaluate('mesh.geometry.index.count'),84*200);
  await b.set(D,'纵深间距',10);await settle();
  report.far=await b.evaluate(`({far:__camera.far,endDepth:__camera.position.z-mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).min.z})`);
  assert.ok(report.far.far>2004,'last layer not clipped at maximum span');
  await b.evaluate(`__camera.fov=75;__camera.updateProjectionMatrix();`);await pose([0,0,14],[45,0,-40]);
  report.maxDepthExtreme=await optics();assert.equal(report.maxDepthExtreme.gate,1,'200 layers and spacing 10 cannot suppress visible-sun rays');
  await pose([0,0,14],[90,0,-40]);assert.equal((await optics()).gate,0,'same max-depth scene suppresses rays only after the sun exits');
  await b.click(D,'首层正面取景');await settle();
  report.coverage=await b.evaluate(`(()=>{const p=new Uint16Array(4);__renderer.readRenderTargetPixels(__countRT,720,499,1,1,p);const h=n=>{const e=(n>>10)&31,m=n&1023;return e===0?m*2**-24:(1+m/1024)*2**(e-15)};return Array.from(p,h);})()`);
  assert.equal(report.coverage[1],200,'all 200 inner slices counted through center');
  await b.screenshot('01-depth-200-front.png');
  await b.evaluate(`window.disposals=0;mesh.geometry.addEventListener('dispose',()=>disposals++);[2,150,200].forEach(n=>setControl(['深邃效果'],'纵深数量',n));`);await settle();assert.equal(await b.evaluate('disposals'),1);
  const direction=await b.evaluate('__camera.getWorldDirection(__camera.position.clone()).toArray()');
  await b.click(D,'适配全部');await settle();assert.deepEqual(await b.evaluate('__camera.getWorldDirection(__camera.position.clone()).toArray()'),direction);
  sameOptics(await optics(),infinite);
  await b.screenshot('02-fit-200.png');
  // Finite distance retained exactly when returning from infinity.
  await b.set(A,'亮心距离模式','有限距离');await settle();assert.equal(await b.evaluate(`Number(controller(['梦境背景与迎光'],'亮心距末层').querySelector('input[type=number]').value)`),80);
  assert.ok(await b.evaluate('sun.position.z < -1990'));await b.set(A,'亮心距离模式','无限远（太阳）');
  await b.click(D,'首层正面取景');await b.set(D,'纵深数量',1);await settle();
  const attributes=await b.evaluate(`Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([n,a])=>[n,Array.from(a.array)]))`);
  const resources=await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  for(let i=0;i<5;i++){await b.set(D,'纵深数量',200);await settle();await b.set(D,'纵深数量',1);await settle();}
  assert.deepEqual(await b.evaluate(`Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([n,a])=>[n,Array.from(a.array)]))`),attributes);
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),resources);report.resources=resources;
  assert.deepEqual(await b.evaluate('mesh.material.map(m=>({color:m.color.getHexString(),opacity:m.opacity,emissive:m.emissiveIntensity}))'),materials);
  await b.set(A,'背景流动',true);await b.set(A,'流动速度',0);await settle();const idle=await b.evaluate('__renderCount');await b.delay(500);assert.equal(await b.evaluate('__renderCount'),idle);
  const before=await b.evaluate('sky.material.uniforms.dreamTime.value');await b.set(A,'流动速度',2);await b.delay(1200);report.timeAtSpeed2=await b.evaluate('sky.material.uniforms.dreamTime.value')-before;assert.ok(report.timeAtSpeed2>1,'speed 2 actually advances time');
  await b.set(A,'流动速度',0);await settle();const stopped=await b.evaluate('sky.material.uniforms.dreamTime.value');await b.delay(350);assert.equal(await b.evaluate('sky.material.uniforms.dreamTime.value'),stopped);
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await b.evaluate(`folder(['梦境背景与迎光']).classList.remove('closed');controller(['梦境背景与迎光'],'紫色层级保护').scrollIntoView({block:'center'});`);await settle();
  assert.ok(await b.evaluate(`(()=>{const r=controller(['梦境背景与迎光'],'紫色层级保护').getBoundingClientRect();return r.top>=0&&r.bottom<=844;})()`));await b.screenshot('03-mobile-panel.png');
  await b.open({dream:true});await b.set(A,'背景流动',false);await settle();
  assert.equal(await b.evaluate(`controller(['梦境背景与迎光'],'亮心距离模式').querySelector('select').value`),'无限远（太阳）');
  assert.equal(await b.evaluate('mesh.geometry.index.count'),84*16);
  await b.screenshot('04-delivery.png');
  assert.equal(b.errors.length,0,JSON.stringify(b.errors));report.errors=b.errors;report.result='passed';
  await writeFile(join(output,'infinite-depth-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} catch(error){await b.screenshot('failure.png');console.error(b.errors);throw error;} finally{b.close();}
