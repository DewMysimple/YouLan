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
  for (const label of ['启用指针视差', '视差幅度（°）', '垂直响应比例', '跟随缓动（秒）', '操作后当前位置为中心', '视差回中']) {
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

  // Starting OrbitControls must adopt the pose already visible on screen,
  // rather than restoring the hidden base pose first.
  const beforeDrag = report.edge.rendered;
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1000, y: 180, button: 'left', buttons: 1, clickCount: 1 });
  await b.delay(100);
  report.press = await b.evaluate('({rendered:__renderPose,base:__camera.position.toArray()})');
  report.press.rendered.position.forEach((value, index) => assert.ok(Math.abs(value - beforeDrag.position[index]) < 0.01));
  report.press.base.forEach((value, index) => assert.ok(Math.abs(value - beforeDrag.position[index]) < 0.01));
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 820, y: 300, button: 'left', buttons: 1 });
  await b.delay(100);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 820, y: 300, button: 'left', buttons: 0, clickCount: 1 });
  await b.delay(120);
  const orbitBase = await b.evaluate('__camera.position.toArray()');
  await move(825, 302);
  await b.delay(120);
  report.afterDrag = await b.evaluate('({rendered:__renderPose,base:__camera.position.toArray()})');
  assert.deepEqual(report.afterDrag.base, orbitBase);
  const postDragShift = Math.hypot(...report.afterDrag.rendered.position.map((value, index) => value - orbitBase[index]));
  assert.ok(postDragShift < 0.02, 'small movement after release does not reapply a corner-sized offset');

  // Wheel zoom uses the same no-snap hand-off and leaves no residual offset.
  await move(1050, 180);
  await b.delay(500);
  const beforeWheel = await b.evaluate('__renderPose.position');
  await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 1050, y: 180, deltaX: 0, deltaY: -120 });
  await b.delay(150);
  report.wheel = await b.evaluate('({rendered:__renderPose,base:__camera.position.toArray()})');
  assert.ok(Math.hypot(...report.wheel.base.map((value, index) => value - beforeWheel[index])) > 0.01, 'wheel changes distance from the adopted visible pose');
  report.wheel.rendered.position.forEach((value, index) => assert.ok(Math.abs(value - report.wheel.base[index]) < 1e-9));

  await b.click(P, '视差回中');
  await b.delay(700);
  report.center = await b.evaluate('({rendered:__renderPose,restored:__camera.position.toArray(),renders:__renderCount})');
  report.center.rendered.position.forEach((value, index) => assert.ok(Math.abs(value - report.wheel.base[index]) < 0.01));
  assert.deepEqual(report.center.restored, report.wheel.base);
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
  report.disabled.rendered.position.forEach((value, index) => assert.ok(Math.abs(value - report.wheel.base[index]) < 1e-12));
  assert.deepEqual(report.disabled.restored, report.wheel.base);
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
