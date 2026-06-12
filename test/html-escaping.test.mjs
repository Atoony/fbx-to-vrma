import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('page runtime escapes dynamic HTML content before injecting it into the panel DOM', () => {
  const source = readFileSync(new URL('../src/fbx-to-vrma-page.js', import.meta.url), 'utf8');

  assert.match(source, /function escapeHtml\(/);
  assert.match(source, /escapeHtml\(state\.sourceFile\.name\)/);
  assert.match(source, /escapeHtml\(sourceBoneName\)/);
  assert.match(source, /escapeHtml\(artifact\.fileName/);
  assert.match(source, /escapeHtml\(entry\.summary\)/);
});

