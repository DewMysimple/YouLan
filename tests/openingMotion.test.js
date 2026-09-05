import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpeningMotion } from '../src/viewer/openingMotion.js';
import { SCENE_IDS, SCENE_LABELS, resolveScene } from '../src/viewer/sceneCatalog.js';

test('opening insertion preserves stable identities with unique contiguous numeric routes', () => {
  assert.equal(SCENE_LABELS.opening,'场景1·纸纹序章');
  assert.equal(SCENE_LABELS.specimen,'场景2·标本纵深');
  assert.equal(SCENE_LABELS.character,'场景12·字符物理实验');
  SCENE_IDS.forEach((id,i)=>{assert.equal(resolveScene(String(i+1)),id);assert.equal(resolveScene(id),id);});
  for(const invalid of [null,'','0','13','-1','1.1','missing'])assert.equal(resolveScene(invalid),null);
});
const options={active:true,visible:true,ready:true,reduced:false,lineDuration:1.4,revealDuration:1.2};
test('opening waits for assets and user entry, then ends on an idle paper background', () => {
  const m=createOpeningMotion();
  for(let t=0;t<3000;t+=20)m.update(t,{...options,ready:false});
  assert.equal(m.stage,'line');m.update(3000,options);assert.equal(m.stage,'circle');
  for(let t=3020;t<4700;t+=20)m.update(t,options);
  assert.equal(m.stage,'ready');assert.equal(m.update(10000,options),false);
  m.enter();assert.equal(m.stage,'reveal');
  for(let t=10020;t<11400;t+=20)m.update(t,options);
  assert.equal(m.stage,'paper');assert.equal(m.update(20000,options),false);
});
test('hidden/inactive time never advances opening and reduced motion keeps the entry action', () => {
  const m=createOpeningMotion();m.update(0,options);m.update(20,options);const before=m.elapsed;
  m.update(4000,{...options,visible:false});m.update(5000,{...options,active:false});m.update(9000,options);
  assert.equal(m.elapsed,before);m.pause();m.update(12000,options);assert.equal(m.elapsed,before);
  m.update(13000,{...options,reduced:true});assert.equal(m.stage,'ready');
  m.enter(true);assert.equal(m.stage,'paper');
  m.show('line');assert.equal(m.elapsed,0);
});
