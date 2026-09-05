import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output=process.argv[2];
if(!output)throw new Error('Provide output directory');
await mkdir(output,{recursive:true});
const b=await browserHarness(output),report={};
try{
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await b.open({dream:true});
  await b.set(['指针视差'],'启用指针视差',false);
  await b.set(['场景选择'],'当前场景','场景7·蝶翼');
  await b.until(`document.querySelector('.viewer-butterfly-status')?.dataset.kind==='ready'`);
  await b.evaluate(`window.bf=__observed.findLast(o=>o.name==='场景7·蝶翼');void 0`);
  await b.delay(500);
  report.materials=await b.evaluate(`['LeftForewing','RightForewing','LeftHindwing','RightHindwing'].map(name=>{
    const material=bf.getObjectByName(name).material,u=material.userData.butterflyFlowUniforms;
    return {name,map:!!material.map,normalMap:!!material.normalMap,physical:material.isMeshPhysicalMaterial,
      materialName:material.name,roughness:material.roughness,metalness:material.metalness,
      colors:[u.butterflyFlowColorA.value.getHexString(),u.butterflyFlowColorB.value.getHexString(),u.butterflyFlowColorC.value.getHexString()],
      emission:u.butterflyFlowEmission.value};
  })`);
  assert.ok(report.materials.every(m=>!m.map&&!m.normalMap&&m.physical&&m.roughness>.35&&m.metalness===0));
  assert.ok(report.materials.every(m=>m.colors.join()==='ffe36f,ffbd20,ff692f'&&m.emission>0));
  const before=await b.evaluate('bf.userData.butterfly.flowTime');await b.delay(300);
  const after=await b.evaluate('bf.userData.butterfly.flowTime');assert.ok(after>before);
  report.flowAdvances=true;
  await b.set(['场景7·蝶翼'],'播放扇翅',false);
  const pose=await b.evaluate(`({q:bf.getObjectByName('LeftForewingPivot').quaternion.toArray(),t:bf.userData.butterfly.time,flow:bf.userData.butterfly.flowTime})`);
  await b.delay(250);
  const flowOnly=await b.evaluate(`({q:bf.getObjectByName('LeftForewingPivot').quaternion.toArray(),t:bf.userData.butterfly.time,flow:bf.userData.butterfly.flowTime})`);
  assert.deepEqual(flowOnly.q,pose.q);assert.equal(flowOnly.t,pose.t);assert.ok(flowOnly.flow>pose.flow);
  report.flowIndependentOfWingbeat=true;
  await b.click(['场景7·蝶翼'],'展开翅膀观察');
  report.palettes={};
  for(const name of ['晨光金蝶','柠檬萤火','杏桃日晕','蜂蜜琥珀','月白金辉','青柠暖焰']){
    await b.set(['场景7·蝶翼'],'翼面配色方案',name);await b.delay(150);
    report.palettes[name]=await b.evaluate(`bf.getObjectByName('LeftForewing').material.userData.butterflyFlowUniforms.butterflyFlowColorB.value.getHexString()`);
    await b.screenshot('palette-'+name+'.png');
  }
  assert.equal(new Set(Object.values(report.palettes)).size,6);
  await b.set(['场景7·蝶翼'],'翼面配色方案','晨光金蝶');
  await b.set(['场景7·蝶翼','程序流动混色材质'],'播放色彩流动',false);await b.delay(100);
  const still=await b.screenshot('default-open-wing.png',[[420,360],[720,410],[990,570]]);
  await b.delay(250);
  const stopped=await b.evaluate('bf.userData.butterfly.flowTime');await b.delay(200);
  assert.equal(await b.evaluate('bf.userData.butterfly.flowTime'),stopped);
  report.samplePixels=still;
  assert.ok(still.some(pixel=>pixel[0]!==pixel[1]||pixel[1]!==pixel[2]),'wing remains chromatic instead of pure white');
  assert.deepEqual(b.errors,[]);report.errors=b.errors;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{b.close();}
