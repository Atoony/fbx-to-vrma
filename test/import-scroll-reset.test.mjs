import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('FBX page resets workspace scroll position after import-driven rerender', () => {
  const source = readFileSync(new URL('../src/fbx-to-vrma-page.js', import.meta.url), 'utf8');

  assert.match(source, /function resetWorkspaceScroll\(/);
  assert.match(source, /window\.scrollTo\(\{\s*top:\s*0,\s*left:\s*0/);
  assert.match(source, /dom\.railScroll\.scrollTop = 0/);
  assert.match(source, /resetWorkspaceScroll\(\);[\s\S]*renderAll\(\);|renderAll\(\);[\s\S]*resetWorkspaceScroll\(\);/);
});

