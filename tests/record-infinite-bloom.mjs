// Record actual WebGL output (not an edited reference or generated mockup).
import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const output=process.argv[2];await mkdir(output,{recursive:true});
const b=await browserHarness(output);
try {
  await b.open({dream:true});await b.until(`document.querySelector('.viewer-panel-status[data-environment]').textContent.includes('加载完成')`);
  await b.set(['场景选择'],'当前场景','场景5·无限花开');
  await b.until(`__observed.some(o=>o.name==='场景5·无限花开'&&o.userData.infiniteBloom?.ready)`);
  await b.set(['场景5·无限花开'],'绽放速度',1);
  await b.evaluate(`document.querySelector('.lil-gui.root').style.display='none'`);
  await b.evaluate(`window.__bloomRecording={status:'recording'}; window.__bloomVideoPromise=new Promise(resolve=>{
    const stream=__renderer.domElement.captureStream(24),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:5000000});
    window.__bloomRecording.recorder=recorder;
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=e=>{window.__bloomRecording.status='error';window.__bloomRecording.error=e.error?.message;resolve(null);};
    recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>{window.__bloomRecording.status='complete';resolve(reader.result);};reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};
    recorder.start();
    setTimeout(()=>recorder.stop(),16000);
  }); 'started';`);
  for(let i=0;i<100;i++){
    const state=await b.evaluate('({status:__bloomRecording.status,error:__bloomRecording.error})');
    if(state.status==='error')throw Error(JSON.stringify(state));
    if(state.status==='complete')break;
    await b.delay(500);
  }
  const status=await b.evaluate('__bloomRecording.status');if(status!=='complete')throw Error(`Recording did not finish: ${status}`);
  // Keep CDP messages bounded; multi-megabyte returnByValue responses may stall
  // the native WebSocket transport on this host even after recording finishes.
  const length=await b.evaluate('__bloomVideoPromise.then(s=>s.length)');
  let data='';
  for(let offset=0;offset<length;offset+=262144)data+=await b.evaluate(`__bloomVideoPromise.then(s=>s.slice(${offset},${offset+262144}))`);
  await writeFile(join(output,'infinite-bloom-preview.webm'),Buffer.from(data.split(',')[1],'base64'));
  await b.set(['场景5·无限花开'],'播放绽放',false);await b.delay(200);await b.screenshot('infinite-bloom-preview.png');
  console.log(JSON.stringify({recording:join(output,'infinite-bloom-preview.webm'),errors:b.errors}));
}finally{b.close();}
