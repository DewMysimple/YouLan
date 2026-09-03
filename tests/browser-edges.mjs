import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output = process.argv[2]; if (!output) throw new Error('Provide output directory');
await mkdir(output, { recursive: true });
const b = await browserHarness(output), D = ['深邃效果'], R = ['渲染设置'], E = ['HDRI 环境设置'];
const report = { views: [] };
async function view(position) {
  await b.evaluate(`__camera.position.set(${position});__camera.lookAt(0,0,0);__camera.updateMatrixWorld();setControl(['渲染设置'],'曝光',1);`);
  await b.delay(200);
}
async function compare(name) {
  const captures = [];
  for (const strength of [0, .32]) {
    await b.set(R, '轮廓清晰度', strength); await b.delay(150);
    const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(output, `${name}-${strength ? 'on' : 'off'}.png`), Buffer.from(data, 'base64'));
    captures.push(data);
  }
  const difference = await b.evaluate(`(async()=>{
    const pixels=[];
    for(const data of ${JSON.stringify(captures)}) {
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);pixels.push(ctx.getImageData(0,0,c.width,c.height).data);
    }
    // Independent geometric reference: project all 12 box edges. A faint
    // boundary may touch the viewport center in an oblique edge-on view; that
    // pixel is not necessarily a face interior.
    const segments=[];
    if(mesh.geometry.index.count===84) {
      const V=__camera.position.constructor;
      for(const inner of [false,true]) {
        const box=mesh.geometry.boundingBox.clone().makeEmpty();
        for(const g of mesh.geometry.groups.filter(g=>!inner||g.materialIndex===1))
          for(let i=g.start;i<g.start+g.count;i++)box.expandByPoint(new V().fromBufferAttribute(mesh.geometry.attributes.corePosition,mesh.geometry.index.getX(i)));
        for(let axis=0;axis<3;axis++)for(const a of [0,1])for(const c of [0,1]) {
          const points=[];
          for(const end of [0,1]) {
            const values=[];values[axis]=end;values[(axis+1)%3]=a;values[(axis+2)%3]=c;
            const p=new V(...['x','y','z'].map((k,j)=>values[j]?box.max[k]:box.min[k])).applyMatrix4(mesh.matrixWorld).project(__camera);
            points.push([(p.x+1)*720,(1-p.y)*500]);
          }
          segments.push(points);
        }
      }
    }
    const distance=(x,y,seg)=>{const [[ax,ay],[bx,by]]=seg,dx=bx-ax,dy=by-ay;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/Math.max(1e-10,dx*dx+dy*dy)));
      return Math.hypot(x-ax-t*dx,y-ay-t*dy)};
    let changed=0,maxDelta=0,total=0,centerDelta=0,stray=0,maxEdgeDistance=0;
    for(let y=10;y<990;y++)for(let x=10;x<1120;x++) {
      const i=(y*1440+x)*4,d=Math.max(...[0,1,2].map(k=>Math.abs(pixels[0][i+k]-pixels[1][i+k])));
      if(d>2){changed++;if(segments.length){const near=Math.min(...segments.map(s=>distance(x+.5,y+.5,s)));maxEdgeDistance=Math.max(maxEdgeDistance,near);if(near>3)stray++;}}
      maxDelta=Math.max(maxDelta,d);total+=d;
      if(x===720&&y===500)centerDelta=d;
    }
    return {changed,maxDelta,meanDelta:total/(980*1110),centerDelta,stray,maxEdgeDistance};
  })()`);
  assert.ok(difference.changed > 30, `${name}: visible edge contribution`);
  assert.ok(difference.meanDelta < 1, `${name}: subtle not a face-wide recolor`);
  assert.equal(difference.stray, 0, `${name}: changes confined to the real projected box edges`);
  if(['front','side'].includes(name))assert.equal(difference.centerDelta, 0, `${name}: flat face center unchanged`);
  report.views.push({ name, ...difference });
}
try {
  await b.open(); await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.set(D, '纵深数量', 1);
  for (const [name, position] of Object.entries({front:'0,0,16',side:'16,0,0',highSide:'16,5,.8',corner:'14,8,5',back:'-14,8,-5',bottom:'16,-6,2'})) {
    await view(position); await compare(name);
  }
  await b.set(D,'纵深数量',16); await view('16,5,2'); await compare('array-16');
  await b.set(D,'纵深数量',100); await b.set(D,'纵深间距',2); await compare('array-100');
  report.geometry = await b.evaluate(`({ meshes: (()=>{let n=0;scene.traverse(o=>{if(o.isMesh)n++});return n})(), groups:mesh.geometry.groups.length, colors:mesh.material.map(m=>m.color.getHexString()), copies:mesh.geometry.index.count/84 })`);
  assert.deepEqual(report.geometry,{meshes:1,groups:2,colors:['f3faff','d1aaff'],copies:100});
  await b.set(D,'纵深数量',1); await view('16,5,.8');
  await b.set(E,'显示贴图背景',false); await compare('hidden-hdri');
  await b.click(E,'清除贴图'); await compare('white');
  for(const slot of [['外框插槽管理'],['内框插槽管理']]) {
    await b.set(slot,'透射率',0);await b.delay(200);await b.screenshot(slot[0]+'-opaque.png');
    await b.set(slot,'透射率',1);
  }
  for(const slot of [['内框插槽管理'],['外框插槽管理']])await b.set(slot,'不透明度',0);
  await b.delay(200);
  assert.deepEqual((await b.screenshot('invisible.png',[[720,500],[720,100]])),[[255,255,255,255],[255,255,255,255]],'zero opacity leaves no phantom edge');
  await b.click(D,'恢复调好的默认效果');await b.legacyComparison();await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  assert.equal(await b.evaluate(`Number(controller(['渲染设置'],'轮廓清晰度').querySelector('input').value)`),.32);
  await view('16,5,2');await b.screenshot('delivery-corner.png');
  await b.click(D,'纯透射对照');
  assert.equal(await b.evaluate(`Number(controller(['渲染设置'],'轮廓清晰度').querySelector('input').value)`),0);
  await b.click(D,'恢复调好的默认效果');await b.legacyComparison();await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.delay(300);
  const memory=await b.evaluate('JSON.stringify(__renderer.info.memory)');
  for(let i=0;i<12;i++) {await b.set(R,'轮廓清晰度',i%2?.32:0);await b.set(R,'轮廓宽度（像素）',i%2?1:2);await b.delay(30);}
  assert.equal(await b.evaluate('JSON.stringify(__renderer.info.memory)'),memory,'no extra GPU resources per toggle');
  await b.delay(300);const renders=await b.evaluate('__renderCount');await b.delay(700);
  assert.equal(await b.evaluate('__renderCount'),renders,'idle remains demand driven');
  report.memory=JSON.parse(memory);
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await b.delay(300);await b.click(D,'首层正面取景');await b.delay(300);await b.screenshot('mobile.png');
  report.mobile=await b.evaluate(`({width:__renderer.domElement.width,height:__renderer.domElement.height,gui:document.querySelector('.lil-gui.root').getBoundingClientRect().width})`);
  assert.equal(report.mobile.width,780); assert.equal(report.mobile.height,1688);
  await b.evaluate(`folder(['深邃效果']).querySelector(':scope > .title').click();folder(['渲染设置']).querySelector(':scope > .title').click();controller(['渲染设置'],'轮廓宽度（像素）').scrollIntoView({block:'center'});`);
  await b.set(R,'轮廓宽度（像素）',1.5);await b.delay(200);await b.screenshot('mobile-controls.png');
  report.mobileControls=await b.evaluate(`['轮廓清晰度','轮廓宽度（像素）'].map(label=>{const r=controller(['渲染设置'],label).getBoundingClientRect();return {label,left:r.left,right:r.right,top:r.top,bottom:r.bottom}})`);
  report.mobileControls.forEach(r=>assert.ok(r.left>=0&&r.right<=390&&r.top>=0&&r.bottom<=844,'mobile edge controls reachable'));
  assert.equal(b.errors.length,0,JSON.stringify(b.errors));
  await writeFile(join(output,'edges-report.json'),JSON.stringify({...report,errors:b.errors},null,2));
  console.log(JSON.stringify(report));
} catch(error) {await b.screenshot('edges-failure.png');console.error(b.errors);throw error;}
finally {b.close();}
