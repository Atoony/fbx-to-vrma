import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('page runtime tracks the active rail tab and switches to mapping after FBX import', () => {
  const source = readFileSync(new URL('../src/fbx-to-vrma-page.js', import.meta.url), 'utf8');

  assert.match(source, /activeRailTab:\s*'overview'/);
  assert.match(source, /function setActiveRailTab\(tabId\)/);
  assert.match(source, /dom\.railTabs\.forEach\(\(button\) => \{/);
  assert.match(source, /button\.dataset\.railTab === state\.activeRailTab/);
  assert.match(source, /panel\.dataset\.railPanel === state\.activeRailTab/);
  assert.match(source, /setActiveRailTab\('mapping'\);[\s\S]*setStatus\('FBX 已载入'/);
  assert.match(source, /dom\.railTabBar\.addEventListener\('click', handleRailTabClick\)/);
});

test('page runtime boots with a built-in VRM and uses it for direct post-import preview', () => {
  const source = readFileSync(new URL('../src/fbx-to-vrma-page.js', import.meta.url), 'utf8');

  assert.match(source, /const DEFAULT_VRM_URL = '\/vrm\/8329890252317737768\.vrm';/);
  assert.match(source, /previewMode:\s*'vrm'/);
  assert.match(source, /await loadVRMFromUrl\(DEFAULT_VRM_URL,\s*\{\s*isDefault:\s*true/);
  assert.match(source, /await verifyArtifact\(true\);[\s\S]*setActiveRailTab\('mapping'\);/);
  assert.match(source, /void bootstrapDefaultVRM\(\);/);
});
