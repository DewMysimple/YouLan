import { browserHarness } from './browserHarness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const output=process.argv[2]; if(!output) throw new Error('Provide output directory');
await mkdir(output,{recursive:true});
const b=await browserHarness(output), D=['深邃效果'], R=['渲染设置'], E=['HDRI 环境设置'];
const report={views:[],saturation:[],progressive:[]};
async function view(p,target='0,0,0') {
  await b.evaluate(`__camera.up.set(0,1,0);__camera.position.set(${p});__camera.lookAt(${target});__camera.updateMatrixWorld();setControl(['渲染设置'],'曝光',1);`);
  await b.delay(200);
}
try {
  await b.open();await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.click(D,'仅颜色层级对照');
  await b.set(D,'纵深数量',2);
  await b.set(['阵列修改器','阵列 1','恒定偏移'],'Z',0);
  // The two deliberately coincident copies are a diagnostic: a ray crossing
  // the closed insert must count exactly two, not zero at a missing side or
  // four from counting a front and an added side twice.
  await b.evaluate(`
    window.coreBox=mesh.geometry.boundingBox.clone().makeEmpty();
    const V=__camera.position.constructor;
    for(const g of mesh.geometry.groups.filter(g=>g.materialIndex===1))
      for(let i=g.start;i<g.start+g.count;i++)coreBox.expandByPoint(new V().fromBufferAttribute(mesh.geometry.attributes.corePosition,mesh.geometry.index.getX(i)));
    window.inspectCoverage=()=>{
      const buffer=new Uint16Array(__countRT.width*__countRT.height*4);
      __renderer.readRenderTargetPixels(__countRT,0,0,__countRT.width,__countRT.height,buffer);
      const half=n=>{const exp=(n>>10)&31,m=n&1023;return exp===0?m*2**-24:(1+m/1024)*2**(exp-15)};
      const inverse=mesh.matrixWorld.clone().invert(),origin=__camera.position.clone().applyMatrix4(inverse);
      const hit=(d,pad)=>{
        let lo=0,hi=Infinity;
        for(const axis of ['x','y','z']) {
          const a=coreBox.min[axis]-pad,c=coreBox.max[axis]+pad;
          if(Math.abs(d[axis])<1e-9){if(origin[axis]<a||origin[axis]>c)return false;continue;}
          const x=(a-origin[axis])/d[axis],y=(c-origin[axis])/d[axis];
          lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));
        }
        return hi>lo;
      };
      let inside=0,holes=0,outside=0,leaks=0,maxGreen=0;
      window.closureOutside=[];
      for(let y=10;y<990;y+=3)for(let x=10;x<1120;x+=3){
        const d=new V((x+.5)/1440*2-1,1-(y+.5)/1000*2,.5).unproject(__camera).sub(__camera.position).transformDirection(inverse);
        const green=half(buffer[((999-y)*1440+x)*4+1]);maxGreen=Math.max(maxGreen,green);
        if(hit(d,-.025)){inside++;if(Math.abs(green-2)>.05)holes++;}
        if(!hit(d,.025)){outside++;closureOutside.push([x,y]);if(green>.05)leaks++;}
      }
      return {inside,holes,outside,leaks,maxGreen};
    };
  `);
  // Top/bottom, opposite corners and near-edge-on views (the reported defect).
  const views={right:'16,0,0',left:'-16,0,0',top:'0,16,.001',bottom:'0,-16,.001',
    highRight:'16,5,2',highLeft:'-16,5,2',backRight:'16,5,-2',backLeft:'-16,5,-2',
    lowRight:'16,-5,2',lowBack:'-16,-5,-2',corner:'14,8,5',front:'0,0,16',back:'0,0,-16'};
  for(const [name,p] of Object.entries(views)) {
    await view(p);
    const coverage=await b.evaluate('inspectCoverage()');
    assert.ok(coverage.inside>20,`${name}: meaningful insert coverage`);
    assert.equal(coverage.holes,0,`${name}: no gap at insert joins`);
    assert.equal(coverage.leaks,0,`${name}: no floating color outside the closed insert`);
    assert.ok(coverage.maxGreen<=2.01,`${name}: no double tint at joins`);
    await b.screenshot(`closure-${name}.png`);
    report.views.push({name,...coverage});
  }
  // Check actual displayed pixels, not only the diagnostic coverage buffer.
  await b.set(D,'纵深数量',1);await view(views.highRight);
  const on=await b.send('Page.captureScreenshot',{format:'png'});
  await b.set(R,'内嵌色体透射',false);await b.delay(200);
  const off=await b.send('Page.captureScreenshot',{format:'png'});
  // Rebuild the outside mask for this camera after the last coverage view.
  await b.set(R,'内嵌色体透射',true);
  await b.set(D,'纵深数量',2);await b.set(['阵列修改器','阵列 1','恒定偏移'],'Z',0);await b.delay(200);
  await b.evaluate('inspectCoverage()');
  report.outsideBeauty=await b.evaluate(`(async()=>{
    const arrays=[];
    for(const data of ${JSON.stringify([on.data,off.data])}){
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1000;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);arrays.push(ctx.getImageData(0,0,1440,1000).data);
    }
    let changed=0,maxDelta=0;
    for(const [x,y] of closureOutside){const i=(y*1440+x)*4;const delta=Math.max(...[0,1,2].map(c=>Math.abs(arrays[0][i+c]-arrays[1][i+c])));maxDelta=Math.max(maxDelta,delta);if(delta>2)changed++;}
    return {tested:closureOutside.length,changed,maxDelta};
  })()`);
  assert.equal(report.outsideBeauty.changed,0,'displayed top and clear border do not receive leaked tint');

  // Neutral lighting removes legitimate HDRI direction differences. Same
  // material and path endpoints must no longer make the side more saturated.
  await b.click(E,'清除贴图');await b.set(D,'纵深数量',1);
  for(const slot of [['外框插槽管理'],['内框插槽管理']]) {
    await b.set(slot,'折射率（IOR）',1);await b.set(slot,'厚度',0);await b.set(slot,'粗糙度',0);
  }
  for(const name of ['front','right','left','top','bottom','back']) {
    await view(views[name]);
    const pixel=(await b.screenshot(`same-color-${name}.png`,[[720,500]]))[0];
    report.saturation.push({name,pixel});
    pixel.forEach((n,c)=>assert.ok(Math.abs(n-report.saturation[0].pixel[c])<=1,`${name}: equal neutral boundary color`));
  }
  // 1/2/5/16/100 overlaps from the front AND side, identical neutral values.
  for(const [direction,p,axis] of [['front',views.front,'Z'],['side',views.right,'X']]) {
    await view(p);
    const series=[];
    for(const count of [1,2,5,16,100]) {
      await b.set(D,'纵深数量',count);
      await b.set(['阵列修改器','阵列 1','恒定偏移'],'Z',0);
      await b.set(['阵列修改器','阵列 1','恒定偏移'],axis,-1.7);
      await b.delay(200);
      const pixel=(await b.screenshot(`${direction}-${count}.png`,[[720,500]]))[0];
      if(series.length)assert.ok(pixel[1]<series.at(-1).pixel[1],`${direction}: more overlaps deepen`);
      series.push({count,pixel});
    }
    report.progressive.push({direction,series});
  }
  report.progressive[0].series.forEach((s,i)=>s.pixel.forEach((n,c)=>assert.ok(Math.abs(n-report.progressive[1].series[i].pixel[c])<=1,'side and front use identical accumulation')));
  // Restore the delivered scene, with no testing color or camera stored.
  await b.click(D,'恢复调好的默认效果');await b.until(`document.querySelector('.viewer-panel-status').textContent.includes('加载完成')`);
  await b.screenshot('delivery-front.png');
  await view('16,5,2');await b.screenshot('delivery-corner.png');
  await b.set(D,'纵深数量',100);await b.set(D,'纵深间距',10);
  await b.screenshot('delivery-hundred.png');
  assert.equal(b.errors.length,0,JSON.stringify(b.errors));
  await writeFile(join(output,'closure-report.json'),JSON.stringify({...report,errors:b.errors},null,2));
  console.log(JSON.stringify(report));
} catch(error) {await b.screenshot('closure-failure.png');console.error(b.errors);throw error;}
finally {b.close();}
