import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {browserHarness} from './browserHarness.mjs';
const output=process.argv[2]||'artifacts/parameter-workspace'; await mkdir(output,{recursive:true});
const h=await browserHarness(output);
const labels=['纸纹序章','标本纵深','花粉星云','指尖花火','无限花开','纸飞机环游','蝶翼','斑驳光影','纵深花廊','狮城手记','纸间来信','字符物理实验'];
const sceneLabel=n=>`场景${n}·${labels[n-1]}`;
const select=n=>h.set(['场景选择'],'当前场景',sceneLabel(n));
const val=(path,label)=>h.evaluate(`(()=>{let c=controller(${JSON.stringify(path)},${JSON.stringify(label)});let e=c.querySelector('select,input[type=color],input[type=number],input[type=checkbox]');return e.type==='checkbox'?e.checked:e.value})()`);
const change=async(path,label,value)=>{await h.set(path,label,value);await h.evaluate(`(()=>{const e=controller(${JSON.stringify(path)},${JSON.stringify(label)}).querySelector('input,select');e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new FocusEvent('blur'));})()`);};
const key=async(k,modifiers=2)=>{await h.send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code:`Key${k.toUpperCase()}`,modifiers});await h.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:`Key${k.toUpperCase()}`,modifiers});};
const toolbar=text=>h.evaluate(`[...document.querySelectorAll('.parameter-tools button')].find(e=>e.textContent===${JSON.stringify(text)}).click()`);
try{
 await h.open({dream:true});
 await h.evaluate(`window.offered=e=>{for(let n=e;n;n=n.parentElement)if(n.hidden||n.style.display==='none'||n.classList.contains('parameter-unavailable'))return false;return true};`);
 const matrix=[];
 for(let n=1;n<=12;n++){
  await select(n);await h.delay(n===10?1500:150);
  const row=await h.evaluate(`({n:${n},left:[...document.querySelectorAll('.parameter-left .parameter-body > .lil-gui')].filter(offered).map(e=>e.querySelector(':scope>.title').textContent),right:[...document.querySelectorAll('.parameter-right .parameter-body > .lil-gui')].filter(offered).map(e=>e.querySelector(':scope>.title').textContent),common:[...document.querySelectorAll('.parameter-common-control')].filter(offered).map(e=>e.querySelector('.name').textContent)})`);
  assert.equal(row.left.includes('梦境背景与迎光'),[2,3,7].includes(n),`dream ${n}`);
  assert.equal(row.left.includes('指针视差'),[2,3,5,6,7].includes(n),`parallax ${n}`);
  assert.equal(row.left.includes('HDRI 环境设置'),[2,3,5,6,7].includes(n),`env ${n}`);
  assert.equal(row.left.includes('画面输出'),[2,3,4,5,6,7].includes(n),`output ${n}`);
  assert.deepEqual(row.right,n===2?['深邃效果','外框插槽管理','内框插槽管理','渲染设置']:[sceneLabel(n)]);
  matrix.push(row);
 }
 await select(3);
 assert.equal(await h.evaluate(`offered(controller(['梦境背景与迎光'],'尽头亮心强度'))`),false);
 await select(7);
 assert.equal(await h.evaluate(`offered(controller(['梦境背景与迎光'],'紫色层级保护'))`),false);
 assert.equal(await h.evaluate(`offered(controller(['梦境背景与迎光'],'尽头亮心强度'))`),true);
 await select(2);
 // Actual material updates must follow keyboard undo, redo and reset.
 const mat=['外框插槽管理'];const before=await val(mat,'粗糙度');
 await change(mat,'粗糙度',.62);assert.equal(await h.evaluate('mesh.material[0].roughness'),.62);
 await key('z');assert.equal(await h.evaluate('mesh.material[0].roughness'),Number(before));
 await key('z',10);assert.equal(await h.evaluate('mesh.material[0].roughness'),.62);
 await toolbar('恢复本场景默认');assert.equal(await h.evaluate('mesh.material[0].roughness'),Number(before));
 await key('z');assert.equal(await h.evaluate('mesh.material[0].roughness'),.62);
 await h.evaluate(`folder(['外框插槽管理']).classList.remove('closed');controller(['外框插槽管理'],'粗糙度').querySelector('input').focus()`);
 await h.set(mat,'粗糙度',.45);await key('z');
 assert.equal(Number(await val(mat,'粗糙度')),.62,'focused numeric text reflects undo immediately');
 const flow=['梦境背景与迎光','流动混色个性化'];
 await change(flow,'颜色1 · 底色','#123456');
 await change(flow,'配色方案','绿茵 · 林间晴光');
 await key('z');assert.equal(await val(flow,'颜色1 · 底色'),'#123456');assert.equal(await val(flow,'配色方案'),'自定义');
 await key('y');assert.equal(await val(flow,'颜色1 · 底色'),'#83bf65');
 await h.click(flow,'恢复混色默认');await key('z');assert.equal(await val(flow,'颜色1 · 底色'),'#83bf65');
 // All scene parameter adapters: edit -> undo -> redo -> default -> undo default.
 const edits=[[1,'纸纹尺度',1.5],[2,'纵深数量',9],[3,'漂浮强度',.7],[4,'彩带厚度',.7],[5,'花瓣粗糙度',.8],[6,'纸飞机大小',.4],[7,'翅面虹彩',.5],[8,'光斑密度',20],[9,'花卉画面大小',.8],[10,'放大镜倍率',3],[11,'点阵浓度',2],[12,'坍塌时长',3]];
 const editsReport=[];
 for(const [n,label,value]of edits){
  await select(n);const path=n===2?['深邃效果']:n===12?[sceneLabel(n),'文字坍塌']:[sceneLabel(n)];
  const original=await val(path,label);await change(path,label,value);await key('z');
  assert.equal(await val(path,label),original,`undo scene${n} ${label}`);
  await key('y');assert.equal(Number(await val(path,label)),value,`redo scene${n}`);
  await toolbar('恢复本场景默认');assert.equal(await val(path,label),original,`reset scene${n}`);
  await key('z');assert.equal(Number(await val(path,label)),value,`undo reset scene${n}`);
  editsReport.push({n,label,original,value});
 }
 await select(6); await h.click([sceneLabel(6)],'跳过入场');
 await change([sceneLabel(6)],'播放环游',false);
 await change(['指针视差'],'启用指针视差',false);
 await h.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
 const samples=Array.from({length:40},(_,i)=>[420+(i%8)*75,180+Math.floor(i/8)*130]);
 const envPath=['HDRI 环境设置'];const originalEnv=await val(envPath,'环境强度');
 await change(envPath,'环境强度',0);await h.delay(150);
 const dark=await h.screenshot(null,samples);
 await change(envPath,'环境强度',3);await h.delay(150);
 const light=await h.screenshot(null,samples);
 assert.ok(dark.some((p,i)=>p.some((v,k)=>k<3&&Math.abs(v-light[i][k])>3)),'shared HDRI intensity changes rendered paper scene');
 await key('z');assert.equal(await h.evaluate(`__observed.findLast(o=>o.name==='场景6·纸飞机环游').environmentIntensity`),0);
 await change(envPath,'环境强度',Number(originalEnv));
 // Repeated controls retain scene-specific settings; left default affects only offered controls.
 await change([sceneLabel(6)],'HDRI 质感强度',1.1);
 await select(7);const butterflyEnv=await val([sceneLabel(7)],'HDRI 质感强度');
 await change([sceneLabel(7)],'HDRI 质感强度',1.4);
 await toolbar('恢复左栏默认');assert.equal(await val([sceneLabel(7)],'HDRI 质感强度'),butterflyEnv);
 await select(6);assert.equal(Number(await val([sceneLabel(6)],'HDRI 质感强度')),1.1);
 // Continuous native number input events are coalesced until the edit finishes.
 const sizeBefore=await val([sceneLabel(6)],'纸飞机大小');
 for(const v of [.2,.25,.3])await h.set([sceneLabel(6)],'纸飞机大小',v);
 await key('z');assert.equal(await val([sceneLabel(6)],'纸飞机大小'),sizeBefore);
 await change([sceneLabel(6)],'播放环游',true);
 await h.screenshot('paper-panels.png');
 // Fold panels independently, then reopen all; no blocked pointer overlay.
 await h.evaluate(`document.querySelector('.parameter-left .parameter-header button').click()`);
 assert.equal(await h.evaluate(`document.querySelector('.parameter-left').hidden`),true);
 await h.evaluate(`document.querySelector('.parameter-open-left').click()`);
 assert.equal(await h.evaluate(`document.querySelector('.parameter-left').hidden`),false);
 await h.evaluate(`document.querySelector('.parameter-toggle-all').click()`);
 assert.equal(await h.evaluate(`[...document.querySelectorAll('.parameter-sidebar')].every(e=>e.hidden&&e.inert)`),true);
 await h.screenshot('collapsed.png');
 await h.evaluate(`document.querySelector('.parameter-toggle-all').click()`);
 assert.equal(await h.evaluate(`[...document.querySelectorAll('.parameter-sidebar')].every(e=>!e.hidden&&!e.inert)`),true);
 await h.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await h.evaluate(`document.querySelector('.parameter-left .parameter-header button').click();document.querySelector('.parameter-open-left').click()`);
 assert.equal(await h.evaluate(`[...document.querySelectorAll('.parameter-sidebar')].filter(e=>!e.hidden).length`),1);
 await h.evaluate(`document.querySelector('.parameter-open-right').click()`);
 assert.equal(await h.evaluate(`[...document.querySelectorAll('.parameter-sidebar')].filter(e=>!e.hidden).length`),1);
 assert.ok(await h.evaluate(`document.querySelector('.parameter-right').getBoundingClientRect().right<=innerWidth`));
 await h.screenshot('mobile-panel.png');
 await h.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await h.evaluate(`document.querySelector('.parameter-open-left').click()`);
 assert.equal(h.errors.length,0,JSON.stringify(h.errors));
 await writeFile(`${output}/report.json`,JSON.stringify({matrix,edits:editsReport,errors:h.errors},null,2));
 console.log('PASS: 12 scene capability/ownership checks, edits/undo/redo/defaults, shader/material replay, palettes, panel folding');
}finally{h.close()}
