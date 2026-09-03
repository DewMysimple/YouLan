// Record actual WebGL output (not an edited reference or generated mockup).
import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const output=process.argv[2];await mkdir(output,{recursive:true});
const b=await browserHarness(output);
try {
  await b.open({dream:true});await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.evaluate(`window.__dreamRecording={status:'recording'}; window.__dreamVideoPromise=new Promise(resolve=>{
    const stream=__renderer.domElement.captureStream(24),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:5000000});
    window.__dreamRecording.recorder=recorder;
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=e=>{window.__dreamRecording.status='error';window.__dreamRecording.error=e.error?.message;resolve(null);};
    recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>{window.__dreamRecording.status='complete';resolve(reader.result);};reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};
    const start=performance.now(),front=__camera.position.clone();recorder.start();
    function animate(now){
      const seconds=(now-start)/1000;
      const t=seconds<2?0:seconds<6?(seconds-2)/4:seconds<8?1:Math.max(0,1-(seconds-8)/3);
      const ease=t*t*(3-2*t);
      __camera.position.set(front.x*(1-ease)+30*ease,8*ease,front.z*(1-ease)-8*ease);
      __camera.lookAt(0,0,-12*ease);__camera.updateMatrixWorld();
      if(seconds<12)requestAnimationFrame(animate);else recorder.stop();
    }
    requestAnimationFrame(animate);
  }); 'started';`);
  for(let i=0;i<100;i++){
    const state=await b.evaluate('({status:__dreamRecording.status,error:__dreamRecording.error})');
    if(state.status==='error')throw Error(JSON.stringify(state));
    if(state.status==='complete')break;
    await b.delay(500);
  }
  const status=await b.evaluate('__dreamRecording.status');if(status!=='complete')throw Error(`Recording did not finish: ${status}`);
  // Keep CDP messages bounded; multi-megabyte returnByValue responses may stall
  // the native WebSocket transport on this host even after recording finishes.
  const length=await b.evaluate('__dreamVideoPromise.then(s=>s.length)');
  let data='';
  for(let offset=0;offset<length;offset+=262144)data+=await b.evaluate(`__dreamVideoPromise.then(s=>s.slice(${offset},${offset+262144}))`);
  await writeFile(join(output,'dream-preview.webm'),Buffer.from(data.split(',')[1],'base64'));
  await b.set(['梦境背景与迎光'],'背景流动',false);await b.delay(200);await b.screenshot('dream-preview.png');
  console.log(JSON.stringify({recording:join(output,'dream-preview.webm'),errors:b.errors}));
}finally{b.close();}
