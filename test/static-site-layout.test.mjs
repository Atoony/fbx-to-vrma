import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readTemplateShell() {
  const html = readFileSync(new URL('../template/fbx-to-vrma.html', import.meta.url), 'utf8');
  return html.split('<script type="module">')[0];
}

test('root index entry uses a local module boot file', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<script type="module"\s+src="\/src\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /<script type="importmap">/);
  assert.doesNotMatch(html, /https:\/\/cdn\.jsdelivr\.net/i);
  assert.doesNotMatch(html, /https:\/\/fonts\.googleapis\.com/i);
});

test('template keeps the masthead compact and consolidates the rail into a single tabbed card', () => {
  const html = readTemplateShell();

  assert.match(html, /\.masthead\s*\{[\s\S]*padding:\s*18px 20px/);
  assert.match(html, /\.lede\s*\{[\s\S]*max-width:\s*52ch/);
  assert.match(html, /<aside class="rail">[\s\S]*<section class="rail-card">/);
  assert.match(html, /class="rail-tabs"/);
  assert.match(html, /data-rail-tab="overview"/);
  assert.match(html, /data-rail-tab="mapping"/);
  assert.match(html, /data-rail-tab="export"/);
  assert.match(html, /data-rail-tab="debug"/);
  assert.match(html, /data-rail-panel="overview"/);
  assert.match(html, /rail-panel--overview[\s\S]*is-active|is-active[\s\S]*rail-panel--overview/);
  assert.match(html, /data-rail-panel="mapping"/);
  assert.match(html, /data-rail-panel="export"/);
  assert.match(html, /data-rail-panel="debug"/);
  assert.doesNotMatch(html, /<section class="rail-section"/);
});

test('template simplifies the primary workflow around FBX import and optional VRM replacement', () => {
  const html = readTemplateShell();

  assert.match(html, /id="loadFbxButton"[\s\S]*导入 FBX/);
  assert.match(html, /id="loadVrmButton"[\s\S]*更换 VRM/);
  assert.match(html, /id="verifyButton"[\s\S]*重新角色预览/);
  assert.doesNotMatch(html, /id="sourcePreviewButton"/);
  assert.doesNotMatch(html, /id="vrmPreviewButton"/);
  assert.match(html, /内置默认 VRM 已就绪/);
});

test('template redirects direct opens back to the real app entry instead of running stale inline runtime', () => {
  const html = readFileSync(new URL('../template/fbx-to-vrma.html', import.meta.url), 'utf8');

  assert.match(html, /window\.location\.pathname\.includes\('\/template\/'\)/);
  assert.match(html, /new URL\('\.\.\/index\.html', window\.location\.href\)\.href/);
});

test('desktop layout preserves bottom breathing room instead of pinning cards to the viewport edge', () => {
  const html = readTemplateShell();

  assert.match(html, /--frame-gap-bottom:\s*18px/);
  assert.match(html, /\.workspace\s*\{[\s\S]*min-height:\s*0[\s\S]*height:\s*100%/);
  assert.doesNotMatch(html, /\.stage-panel\s*\{[\s\S]*min-height:\s*calc\(100dvh - 132px\)/);
  assert.doesNotMatch(html, /\.rail\s*\{[\s\S]*min-height:\s*calc\(100dvh - 132px\)/);
  assert.match(html, /\.stage-panel\s*\{[\s\S]*height:\s*100%/);
  assert.match(html, /\.rail\s*\{[\s\S]*height:\s*100%/);
});

test('mapping tab keeps both cards fixed and scrolls details inside the right panel', () => {
  const html = readTemplateShell();

  assert.match(html, /\.stage-column,\s*\.rail\s*\{[\s\S]*min-height:\s*0/);
  assert.match(html, /\.stage-column\s*\{[\s\S]*height:\s*100%/);
  assert.match(html, /\.shell\s*\{[\s\S]*height:\s*calc\(100dvh - \(var\(--frame-gap-top\) \+ var\(--frame-gap-bottom\)\)\)/);
  assert.match(html, /\.rail-card\s*\{[\s\S]*min-height:\s*0[\s\S]*height:\s*100%/);
  assert.match(html, /\.rail-scroll\s*\{[\s\S]*height:\s*100%[\s\S]*min-height:\s*0[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(html, /\.rail-panels\s*\{[\s\S]*height:\s*100%[\s\S]*min-height:\s*0/);
  assert.match(html, /\.rail-panel\s*\{[\s\S]*height:\s*100%[\s\S]*min-height:\s*0/);
  assert.match(html, /\.rail-panel--mapping\s*\{[\s\S]*height:\s*100%[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(html, /\.mapping-shell\s*\{[\s\S]*height:\s*100%[\s\S]*min-height:\s*0[\s\S]*overflow:\s*auto/);
  assert.match(html, /id="mappingScroll"/);
});
