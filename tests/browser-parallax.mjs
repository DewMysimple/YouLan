import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browserHarness } from './browserHarness.mjs';

const output = process.argv[2];
await mkdir(output, { recursive: true });
const b = await browserHarness(output);
const P = ['指针视差'];
const A = ['梦境背景与迎光'];
const report = {};
try {
  await b.open({ dream: true });
  await b.set(A, '背景流动', false);
  await b.delay(500);
  assert.equal(await b.evaluate(`!!folder(${JSON.stringify(P)})`), true);
  for (const label of ['启用指针视差', '视差幅度（°）', '跟随缓动（秒）']) {
    assert.equal(await b.evaluate(`!!controller(${JSON.stringify(P)},${JSON.stringify(label)})`), true);
  }
  await b.evaluate(`
    window.__renderPose = null;
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = function(renderer, renderedScene, camera, geometry, material, group) {
      __renderPose = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() };
      previous?.call(this, renderer, renderedScene, camera, geometry, material, group);
    };
    window.__basePose = { position: __camera.position.toArray(), quaternion: __camera.quaternion.toArray() };
  `);
  const move = (x, y) => b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  // Stay on the WebGL canvas; the panel intentionally does not drive motion.
  await move(1000, 180);
  await b.delay(700);
  report.edge = await b.evaluate('({rendered:__renderPose,base:__basePose,restored:__camera.position.toArray(),renders:__renderCount})');
  assert.ok(report.edge.rendered.position[0] > report.edge.base.position[0] + 0.1);
  assert.ok(report.edge.rendered.position[1] > report.edge.base.position[1] + 0.05);
  assert.deepEqual(report.edge.restored, report.edge.base.position, 'render-only parallax does not corrupt OrbitControls pose');
  await b.screenshot('01-pointer-upper-right.png');

  await move(720, 500);
  await b.delay(700);
  report.center = await b.evaluate('({rendered:__renderPose,restored:__camera.position.toArray(),renders:__renderCount})');
  report.center.rendered.position.forEach((value, index) => assert.ok(Math.abs(value - report.edge.base.position[index]) < 0.01));
  assert.deepEqual(report.center.restored, report.edge.base.position);
  await b.delay(450);
  await b.delay(250);
  const idle = await b.evaluate('__renderCount');
  await b.delay(400);
  assert.equal(await b.evaluate('__renderCount'), idle, 'static background and settled pointer return to on-demand rendering');
  await b.screenshot('02-pointer-centered.png');

  await b.set(P, '启用指针视差', false);
  await move(1000, 200);
  await b.delay(250);
  report.disabled = await b.evaluate('({rendered:__renderPose,restored:__camera.position.toArray()})');
  report.disabled.rendered.position.forEach((value, index) => assert.ok(Math.abs(value - report.edge.base.position[index]) < 1e-12));
  assert.deepEqual(report.disabled.restored, report.edge.base.position);
  assert.deepEqual(b.errors, []);
  report.result = 'passed';
  await writeFile(join(output, 'parallax-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await b.screenshot('failure.png');
  console.error(b.errors);
  throw error;
} finally {
  b.close();
}
