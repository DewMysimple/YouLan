import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

test('Feather first-screen assets remain intact and owl SVG is self-contained', () => {
  const read = path => readFileSync(new URL('../' + path, import.meta.url));
  const manifest = JSON.parse(read('source/feather-first-scene/assets.json'));
  assert.equal(manifest.files.filter(file => file.path.endsWith('.png')).length, 22);
  for (const file of manifest.files) {
    assert.equal(createHash('sha256').update(read(file.path)).digest('hex'), file.sha256, file.path);
  }
  const owl = read('public/feather/owl.svg').toString();
  assert.match(owl, /href="data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(owl, /<script|onload=|href="(?:https?:|\/)/);
});
