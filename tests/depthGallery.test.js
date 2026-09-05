import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryBlend, dampGallery, normalizeGalleryWheel } from '../src/viewer/depthGallery/data.js';

test('gallery transition stays bounded and blends adjacent images including endpoints', () => {
  for (let step = -10; step <= 110; step++) {
    const { index, next, mix } = galleryBlend(step / 100);
    assert.ok(index >= 0 && next <= 4 && next - index <= 1);
    assert.ok(mix >= 0 && mix < 1);
  }
  assert.deepEqual(galleryBlend(1), { index: 4, next: 4, mix: 0 });
  assert.deepEqual(galleryBlend(.375), { index: 1, next: 2, mix: .5 });
});

test('gallery damping is frame independent, reversible and settles for on-demand rendering', () => {
  const advance = hz => { let v = 0; for (let i = 0; i < hz; i++) v = dampGallery(v, 1, 1 / hz, .22); return v; };
  assert.ok(Math.abs(advance(30) - advance(120)) < 1e-10);
  const forward = dampGallery(.2, .8, 1 / 60, .22);
  const reverse = dampGallery(forward, 0, 1 / 60, .22);
  assert.ok(reverse < forward && reverse > 0);
  let v = .7; for (let i = 0; i < 360; i++) v = dampGallery(v, 0, 1 / 60, .22);
  assert.equal(v, 0);
});

test('wheel pixel/line/page units agree and huge trackpad events cannot skip the gallery', () => {
  assert.equal(normalizeGalleryWheel(48, 0, 800), normalizeGalleryWheel(3, 1, 800));
  assert.equal(normalizeGalleryWheel(.06, 2, 800), 48);
  assert.equal(normalizeGalleryWheel(10000, 0, 800), 240);
  assert.equal(normalizeGalleryWheel(-10000, 0, 800), -240);
});
