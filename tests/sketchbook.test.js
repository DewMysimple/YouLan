import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(readFileSync(new URL('../source/threeui-sketchbook/manifest.json', import.meta.url)));
const hash = path => createHash('sha256').update(readFileSync(new URL('../' + path, import.meta.url))).digest('hex');
test('ThreeUI registered source and every binary asset preserve the supplied SHA-256', () => {
  for (const file of manifest.files) assert.equal(hash('source/threeui-sketchbook/' + file.path), file.sha256, file.path);
  for (const asset of manifest.assets) assert.equal(hash(asset.path), asset.sha256, asset.path);
  assert.equal(hash('public/landing-pages/meng-to-sketchbook.html'), 'e0330548b1ac905cf1b81698163ffa29f8a3a8c39b8d39f9b71ba5b9255b6dd1');
  for (const name of ['LandingPageFrame.tsx', 'pageTypography.ts', 'pageRecipes.ts']) {
    assert.equal(hash('src/viewer/sketchbook/vendor/' + name), manifest.files.find(f => f.path.endsWith('/' + name)).sha256);
  }
});
