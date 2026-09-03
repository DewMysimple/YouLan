import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output=process.argv[2]; if(!output)throw Error('Provide output directory');
await mkdir(output,{recursive:true});
const b=await browserHarness(output), dream=['梦境背景与迎光'], depth=['深邃效果'];
const report={};
const pause=async()=>{await b.set(dream,'背景流动',false);await b.delay(250);};
const capture=async(name,points=[])=>{await b.delay(150);return b.screenshot(name,points);};
const wake=()=>b.evaluate(`setControl(['渲染设置'],'曝光',1)`);
const pose=async(position,target)=>{await b.evaluate(`__camera.position.set(...${JSON.stringify(position)});__camera.lookAt(...${JSON.stringify(target)});setControl(['渲染设置'],'曝光',1);`);await b.delay(200);};
try{
  await b.open({dream:true});
  await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  await b.evaluate(`window.sky=scene.getObjectByName('流动混色天空（独立环境）');window.sun=scene.getObjectByName('尽头亮心（独立亮源）');window.front=__camera.position.toArray();`);
  report.defaults=await b.evaluate(`({colors:mesh.material.map(m=>m.color.getHexString()),opacity:mesh.material.map(m=>m.opacity),depthWrite:mesh.material.map(m=>m.depthWrite),geometry:mesh.geometry.index.count,source:sun.position.toArray(),animated:controller(['梦境背景与迎光'],'背景流动').querySelector('input').checked})`);
  assert.deepEqual(report.defaults.colors,['f3faff','d1aaff']);assert.deepEqual(report.defaults.opacity,[.5,.6]);
  assert.deepEqual(report.defaults.depthWrite,[false,false]);assert.equal(report.defaults.animated,true);
  const clock=await b.evaluate('sky.material.uniforms.dreamTime.value');const renders=await b.evaluate('__renderCount');
  await b.delay(1600);assert.ok(await b.evaluate('sky.material.uniforms.dreamTime.value')>clock);assert.ok(await b.evaluate('__renderCount')>renders);
  await pause();const idle=await b.evaluate('__renderCount');await b.delay(500);assert.equal(await b.evaluate('__renderCount'),idle);
  report.animation='advances when enabled, stops when paused';
  // A failed replacement must not switch the selected procedural background.
  await writeFile(join(output,'damaged.hdr'),Buffer.from('invalid environment fixture'));
  await b.send('DOM.enable');
  const {root}=await b.send('DOM.getDocument');
  const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file]'});
  await b.send('DOM.setFileInputFiles',{nodeId,files:[join(output,'damaged.hdr')]});
  await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载失败')`);
  assert.equal(await b.evaluate(`controller(['梦境背景与迎光'],'背景模式').querySelector('select').value`),'流动混色');
  // Reset only the sampled animation phase for deterministic visual comparisons.
  await b.evaluate('sky.material.uniforms.dreamTime.value=0');await wake();
  report.front=await capture('01-front.png',[[720,500],[820,520],[890,620],[950,680],[100,100]]);
  assert.ok(report.front[0].slice(0,3).every(n=>n>=245),'soft white sun center');
  const frozen=await capture(null,[[100,100],[300,800],[1050,700]]);
  await b.evaluate('sky.material.uniforms.dreamTime.value=8');await wake();
  const moved=await capture('02-background-later.png',[[100,100],[300,800],[1050,700]]);
  assert.ok(moved.some((p,i)=>p.some((n,c)=>Math.abs(n-frozen[i][c])>2)),'procedural background changes without camera movement');
  await b.evaluate('sky.material.uniforms.dreamTime.value=0');await wake();
  const fixed=await b.evaluate('sun.position.toArray()');
  await pose([8,1,17],[0,0,-6]);
  report.oblique=await b.evaluate('({uv:sky.material.uniforms.dreamSunUv.value.toArray(),gate:sky.material.uniforms.dreamGate.value,position:sun.position.toArray()})');
  assert.notEqual(report.oblique.uv[0],.5);assert.notDeepEqual(report.oblique.position,fixed);await capture('03-oblique.png');
  await pose([30,8,-8],[0,0,-12]);assert.equal(await b.evaluate('sky.material.uniforms.dreamGate.value'),0);
  const side=await capture('04-side.png',[[100,100],[700,500],[1000,700]]);
  await b.set(dream,'迎光放射强度',0);const sideNoRays=await capture(null,[[100,100],[700,500],[1000,700]]);
  assert.deepEqual(side,sideNoRays,'rays are absent after the sun leaves this side-view viewport');
  await b.set(dream,'迎光放射强度',.65);
  await pose([0,0,-60],[0,0,-20]);assert.equal(await b.evaluate('sky.material.uniforms.dreamGate.value'),0);await capture('05-back.png');
  await b.click(depth,'首层正面取景');await b.set(dream,'背景模式','纯黑对照');
  const black=await capture('06-black.png',[[720,500],[100,300],[1050,800]]);
  await b.set(dream,'迎光放射强度',0);const blackNoRays=await capture('07-black-no-rays.png',[[720,500],[100,300],[1050,800]]);
  assert.ok(black.some((p,i)=>p.some((n,c)=>n-blackNoRays[i][c]>10)),'actual radial effect on black background');
  await b.set(dream,'迎光放射强度',.65);
  // Both fully opaque slots must occlude the distant light and its screen glow.
  for(const slot of [['外框插槽管理'],['内框插槽管理']]){
    await b.set(slot,'不透明度',1);await b.set(slot,'透射率',0);await b.set(slot,'写入深度（遮挡后层）',true);
  }
  const opaque=await capture('08-opaque-occlusion.png',[[720,500],[100,300]]);
  await b.set(dream,'尽头亮心强度',0);const opaqueOff=await capture(null,[[720,500],[100,300]]);
  opaque.forEach((p,i)=>p.forEach((n,c)=>assert.ok(Math.abs(n-opaqueOff[i][c])<=1,'occluded sun does not leak')));
  await b.click(depth,'恢复调好的默认效果');await pause();await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  // Infinite source direction/radius are independent of total depth.
  report.arrays=[];
  for(const count of [1,2,16,76,100,101,200]){
    await b.set(depth,'纵深数量',count);await b.delay(180);
    const state=await b.evaluate(`({indices:mesh.geometry.index.count,groups:mesh.geometry.groups.map(g=>g.count),source:sun.position.toArray(),colors:mesh.material.map(m=>m.color.getHexString()),gate:sky.material.uniforms.dreamGate.value})`);
    assert.equal(state.indices,count*84);assert.deepEqual(state.groups,[count*72,count*12]);
    assert.deepEqual(state.colors,['f3faff','d1aaff']);assert.deepEqual(state.source,fixed);
    report.arrays.push({count,...state});if(count===76||count===100)await capture(`09-array-${count}.png`);
  }
  // The material knobs remain independent; environment switching doesn't reset them.
  await b.set(['内框插槽管理'],'自发光强度',.42);
  const materialState=await b.evaluate('mesh.material.map(m=>({color:m.color.getHexString(),emission:m.emissiveIntensity,opacity:m.opacity,depthWrite:m.depthWrite}))');
  await b.set(dream,'背景模式','HDRI / 纯白');await b.set(['HDRI 环境设置'],'显示贴图背景',false);
  await capture('10-hdri-hidden.png');
  await b.click(['HDRI 环境设置'],'清除贴图');
  assert.equal(await b.evaluate(`controller(['梦境背景与迎光'],'背景模式').querySelector('select').value`),'HDRI / 纯白');
  assert.deepEqual(await b.evaluate('mesh.material.map(m=>({color:m.color.getHexString(),emission:m.emissiveIntensity,opacity:m.opacity,depthWrite:m.depthWrite}))'),materialState);
  await b.set(dream,'启用梦境效果',false);
  assert.deepEqual((await capture('11-white-fallback.png',[[10,10]]))[0],[255,255,255,255]);
  await b.set(depth,'纵深数量',1);await b.delay(200);assert.equal(await b.evaluate('mesh.geometry.index.count'),84);
  await b.click(depth,'恢复调好的默认效果');await pause();await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  assert.equal(await b.evaluate(`controller(['梦境背景与迎光'],'混色背景亮度').querySelector('input').disabled`),false);
  // Bloom bypass equivalence away from the solar halo: one output transform.
  await b.set(dream,'尽头亮心强度',0);await b.set(depth,'局部 Bloom 光晕',false);
  const without=await capture(null,[[100,100],[800,600],[950,700]]);
  await b.set(depth,'局部 Bloom 光晕',true);await b.set(depth,'光晕阈值',5);
  const threshold=await capture(null,[[100,100],[800,600],[950,700]]);
  without.forEach((p,i)=>p.forEach((n,c)=>assert.ok(Math.abs(n-threshold[i][c])<=1,'linear output equivalence')));
  await b.click(depth,'恢复调好的默认效果');await pause();await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  const resources=await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})');
  for(let i=0;i<5;i++){await b.set(dream,'背景模式','纯黑对照');await b.delay(80);await b.set(dream,'背景模式','流动混色');await b.delay(80);}
  assert.deepEqual(await b.evaluate('({...__renderer.info.memory,programs:__renderer.info.programs.length})'),resources);report.resources=resources;
  // OS reduced motion, including restoring defaults after the preference changes.
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await b.click(depth,'恢复调好的默认效果');await b.delay(250);
  assert.equal(await b.evaluate(`controller(['梦境背景与迎光'],'背景流动').querySelector('input').checked`),false);
  await b.send('Emulation.setEmulatedMedia',{features:[]});
  // Page visibility is browser-driven and must cancel the animation scheduler.
  await b.set(dream,'背景流动',true);
  await b.send('Emulation.setPageVisibilityOverride',{visibilityState:'hidden'}).then(async()=>{
    await b.delay(200);const hidden=await b.evaluate('__renderCount');await b.delay(500);assert.equal(await b.evaluate('__renderCount'),hidden);
    await b.send('Emulation.setPageVisibilityOverride',{visibilityState:'visible'});await b.delay(200);assert.ok(await b.evaluate('__renderCount')>hidden);
    report.visibility='browser hidden/visible verified';
  }).catch(async error=>{
    if(!String(error.message||JSON.stringify(error)).includes('wasn\'t found'))throw error;
    // Headless CDP versions without visibility override: exercise the exact DOM
    // event/state path, explicitly recording that this is a synthetic event.
    await b.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));`);
    await b.delay(200);const hidden=await b.evaluate('__renderCount');await b.delay(400);assert.equal(await b.evaluate('__renderCount'),hidden);
    await b.evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));`);await b.delay(200);assert.ok(await b.evaluate('__renderCount')>hidden);
    report.visibility='synthetic visibility state/event (CDP override unavailable)';
  });
  await pause();
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await b.click(depth,'首层正面取景');
  await b.evaluate(`folder(['梦境背景与迎光']).classList.remove('closed');controller(['梦境背景与迎光'],'紫色层级保护').scrollIntoView({block:'center'});`);
  await capture('12-mobile.png');
  assert.ok(await b.evaluate(`(()=>{const r=controller(['梦境背景与迎光'],'紫色层级保护').getBoundingClientRect();return r.top>=0&&r.bottom<=844;})()`));
  await b.set(dream,'紫色层级保护',.8);await b.until('sky.material.uniforms.dreamProtection.value===.8');
  await b.open({dream:true});await pause();await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  await b.evaluate(`window.sky=scene.getObjectByName('流动混色天空（独立环境）');sky.material.uniforms.dreamTime.value=0;`);await wake();
  await capture('13-delivery.png');
  assert.deepEqual(await b.evaluate('mesh.material.map(m=>m.color.getHexString())'),['f3faff','d1aaff']);
  assert.equal(b.errors.length,0,JSON.stringify(b.errors));
  report.errors=b.errors;report.result='passed';await writeFile(join(output,'dream-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await b.screenshot('dream-failure.png');console.error(b.errors);throw error;}finally{b.close();}
