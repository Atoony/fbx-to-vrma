import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('root index entry uses a local module boot file', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<script type="module"\s+src="\/src\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /<script type="importmap">/);
  assert.doesNotMatch(html, /https:\/\/cdn\.jsdelivr\.net/i);
  assert.doesNotMatch(html, /https:\/\/fonts\.googleapis\.com/i);
});
