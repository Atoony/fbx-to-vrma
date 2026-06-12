import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

import {
  parseTrackBinding,
  inferHumanoidMap,
  validateHumanoidMap,
  buildVrmaAnimationTracks,
  buildVrmaDocument,
  getRequiredBoneIds,
  getSupportedBoneIds,
} from './fbx-to-vrma-core.js';

const DEFAULT_VRM_URL = '/vrm/8590256991748008892.vrm';
const DEFAULT_VRM_LABEL = '8590256991748008892.vrm';

const dom = {
  canvas: document.getElementById('viewport'),
  dropzone: document.getElementById('dropzone'),
  emptyOverlay: document.getElementById('emptyOverlay'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  activeHint: document.getElementById('activeHint'),
  fbxInput: document.getElementById('fbxInput'),
  vrmInput: document.getElementById('vrmInput'),
  loadFbxButton: document.getElementById('loadFbxButton'),
  loadVrmButton: document.getElementById('loadVrmButton'),
  clearButton: document.getElementById('clearButton'),
  playButton: document.getElementById('playButton'),
  restartButton: document.getElementById('restartButton'),
  speedSelect: document.getElementById('speedSelect'),
  progressTrack: document.getElementById('progressTrack'),
  progressFill: document.getElementById('progressFill'),
  timeDisplay: document.getElementById('timeDisplay'),
  importSummary: document.getElementById('importSummary'),
  mappingSummary: document.getElementById('mappingSummary'),
  mappingList: document.getElementById('mappingList'),
  mappingScroll: document.getElementById('mappingScroll'),
  railScroll: document.getElementById('railScroll'),
  railTabBar: document.getElementById('railTabBar'),
  railTabs: [...document.querySelectorAll('[data-rail-tab]')],
  railPanels: [...document.querySelectorAll('[data-rail-panel]')],
  exportSummary: document.getElementById('exportSummary'),
  verifyButton: document.getElementById('verifyButton'),
  exportButton: document.getElementById('exportButton'),
  clearLogsButton: document.getElementById('clearLogsButton'),
  copyLogsButton: document.getElementById('copyLogsButton'),
  debugFilterErrors: document.getElementById('debugFilterErrors'),
  debugLog: document.getElementById('debugLog'),
  toast: document.getElementById('toast'),
};

const REQUIRED_BONES = new Set(getRequiredBoneIds());
const SUPPORTED_BONES = getSupportedBoneIds();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#100f0d');

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 1.35, 4.6);

const renderer = new THREE.WebGLRenderer({
  canvas: dom.canvas,
  antialias: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setPixelRatio(window.devicePixelRatio);

const controls = new OrbitControls(camera, dom.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.1, 0);

scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
keyLight.position.set(1.2, 2.8, 1.6);
scene.add(keyLight);
scene.add(new THREE.HemisphereLight(0xfff1d9, 0x202632, 0.55));

const grid = new THREE.GridHelper(10, 20, 0x6a5632, 0x2c241a);
grid.material.opacity = 0.5;
grid.material.transparent = true;
scene.add(grid);

const clock = new THREE.Clock();

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

const vrmaLoader = new GLTFLoader();
vrmaLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

const state = {
  sourceFile: null,
  sourceRoot: null,
  sourceClip: null,
  sourceTracks: [],
  sourceBoneNames: [],
  restPose: {},
  sourceUnitScale: 1,
  detectedPreset: null,
  humanoidMap: {},
  currentVRM: null,
  currentVRMGroup: null,
  exportArtifact: null,
  mixer: null,
  currentAction: null,
  clipDuration: 0,
  isPlaying: false,
  previewMode: 'vrm',
  activeRailTab: 'overview',
  loading: false,
  logs: [],
  showErrorOnly: false,
  currentVRMLabel: '',
  currentVRMIsDefault: false,
};

function setStatus(text, tone = 'idle') {
  dom.statusText.textContent = text;
  dom.statusDot.dataset.tone = tone;
}

function setHint(text) {
  dom.activeHint.textContent = text;
}

function setLoading(loading) {
  state.loading = loading;
  dom.loadingOverlay.classList.toggle('visible', loading);
}

function showToast(message, tone = 'error') {
  dom.toast.textContent = message;
  dom.toast.dataset.tone = tone;
  dom.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, 2600);
}

function resetWorkspaceScroll() {
  document.activeElement?.blur?.();
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'auto',
  });

  if (dom.railScroll) {
    dom.railScroll.scrollTop = 0;
  }

  if (dom.mappingScroll) {
    dom.mappingScroll.scrollTop = 0;
  }
}

function setActiveRailTab(tabId) {
  state.activeRailTab = tabId;

  dom.railTabs.forEach((button) => {
    const isActive = button.dataset.railTab === state.activeRailTab;
    button.dataset.active = String(isActive);
  });

  dom.railPanels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.railPanel === state.activeRailTab);
  });
}

function handleRailTabClick(event) {
  const button = event.target.closest('[data-rail-tab]');
  if (!button) {
    return;
  }

  setActiveRailTab(button.dataset.railTab);
}

function logDebug(level, stage, summary, details = '', error = null) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    level,
    stage,
    summary,
    details: details || (error ? error.message : ''),
    raw: error ? String(error.stack || error.message || error) : '',
  };

  state.logs.unshift(entry);
  renderDebugConsole();
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '--';
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return '--';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remain = Math.floor(safe % 60);
  return `${minutes}:${String(remain).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function roundVec(values) {
  return values.map((value) => Number(value.toFixed(6)));
}

function createFileName(name, ext) {
  const stem = (name || 'motion').replace(/\.[^.]+$/, '');
  return `${stem}${ext}`;
}

function inferSourceUnitScale(restPose) {
  const hipsHeight = Math.abs(restPose?.Hips?.position?.[1] ?? 0);
  return hipsHeight > 10 ? 0.01 : 1;
}

function disposeObject(root) {
  if (!root) {
    return;
  }

  root.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose?.();
    }

    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value && typeof value === 'object' && typeof value.dispose === 'function') {
            value.dispose();
          }
        });
        material.dispose?.();
      });
    }
  });
}

function frameObject(object) {
  if (!object) {
    return;
  }

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    controls.target.set(0, 1, 0);
    camera.position.set(0, 1.35, 4.6);
    controls.update();
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.7 || 1;
  controls.target.set(center.x, center.y * 0.85, center.z);
  camera.position.set(center.x + radius * 1.2, center.y + radius * 0.6, center.z + radius * 2.3);
  controls.update();
}

function extractSourceTracks(clip) {
  return clip.tracks
    .map((track) => {
      const binding = parseTrackBinding(track.name);
      if (!binding) {
        return null;
      }

      if (binding.property !== 'rotation' && binding.property !== 'position') {
        return null;
      }

      return {
        name: track.name,
        sourceBoneName: binding.sourceBoneName,
        property: binding.property,
        times: Array.from(track.times),
        values: Array.from(track.values),
      };
    })
    .filter(Boolean);
}

function captureRestPose(root) {
  const restPose = {};
  const worldQuaternion = new THREE.Quaternion();

  root.updateMatrixWorld(true);

  root.traverse((node) => {
    if (!node.name) {
      return;
    }

    const boneName = parseTrackBinding(`${node.name}.position`)?.sourceBoneName;
    if (!boneName || restPose[boneName]) {
      return;
    }

    restPose[boneName] = {
      sourceName: node.name,
      parentSourceBoneName: parseTrackBinding(`${node.parent?.name || ''}.position`)?.sourceBoneName ?? null,
      position: roundVec(node.position.toArray()),
      rotation: roundVec(node.quaternion.toArray()),
      worldRotation: roundVec(node.getWorldQuaternion(worldQuaternion).toArray()),
    };
  });

  return restPose;
}

function collectSourceBoneNames(restPose, sourceTracks) {
  const names = new Set(Object.keys(restPose));
  sourceTracks.forEach((track) => {
    names.add(track.sourceBoneName);
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

function clearSourceData() {
  if (state.sourceRoot) {
    scene.remove(state.sourceRoot);
    disposeObject(state.sourceRoot);
  }

  state.sourceFile = null;
  state.sourceRoot = null;
  state.sourceClip = null;
  state.sourceTracks = [];
  state.sourceBoneNames = [];
  state.restPose = {};
  state.sourceUnitScale = 1;
  state.detectedPreset = null;
  state.humanoidMap = {};
  state.exportArtifact = null;
}

function clearVRMData() {
  if (state.currentVRMGroup) {
    scene.remove(state.currentVRMGroup);
    disposeObject(state.currentVRMGroup);
  }

  state.currentVRM = null;
  state.currentVRMGroup = null;
  state.currentVRMLabel = '';
  state.currentVRMIsDefault = false;
  state.exportArtifact = null;
}

function clearPlayback() {
  if (state.mixer) {
    state.mixer.stopAllAction();
  }

  state.mixer = null;
  state.currentAction = null;
  state.clipDuration = 0;
  state.isPlaying = false;
}

function setPreviewMode(mode) {
  state.previewMode = mode;

  if (state.sourceRoot) {
    state.sourceRoot.visible = mode === 'source';
  }

  if (state.currentVRMGroup) {
    state.currentVRMGroup.visible = mode === 'vrm';
  }
}

function playSourcePreview() {
  if (!state.sourceRoot || !state.sourceClip) {
    return;
  }

  clearPlayback();
  setPreviewMode('source');

  state.mixer = new THREE.AnimationMixer(state.sourceRoot);
  state.currentAction = state.mixer.clipAction(state.sourceClip);
  state.currentAction.play();
  state.currentAction.setLoop(THREE.LoopRepeat);
  state.mixer.timeScale = Number(dom.speedSelect.value);
  state.clipDuration = state.sourceClip.duration || 0;
  state.isPlaying = true;
  setStatus('正在预览 FBX 原始动画', 'ready');
  setHint('当前显示原始 FBX 动画。补齐右侧映射后，可点击“重新角色预览”把动作重新套用到角色。');
  updatePlaybackUi();
}

function playVRMPreview(vrmAnimation) {
  if (!state.currentVRM || !state.currentVRMGroup || !vrmAnimation) {
    return;
  }

  clearPlayback();
  setPreviewMode('vrm');

  const clip = createVRMAnimationClip(vrmAnimation, state.currentVRM);
  state.mixer = new THREE.AnimationMixer(state.currentVRMGroup);
  state.currentAction = state.mixer.clipAction(clip);
  state.currentAction.play();
  state.currentAction.setLoop(THREE.LoopRepeat);
  state.mixer.timeScale = Number(dom.speedSelect.value);
  state.clipDuration = clip.duration || 0;
  state.isPlaying = true;
  setStatus('正在预览角色动画', 'ready');
  setHint('当前角色预览来自本地回灌验证。修改映射后可再次点击“重新角色预览”刷新效果。');
  updatePlaybackUi();
}

function updatePlaybackUi() {
  dom.playButton.disabled = !state.currentAction;
  dom.restartButton.disabled = !state.currentAction;
  dom.playButton.innerHTML = state.isPlaying ? '&#10074;&#10074;' : '&#9654;';

  const currentTime = state.currentAction ? state.currentAction.time : 0;
  const progress = state.clipDuration > 0 ? Math.min(currentTime / state.clipDuration, 1) : 0;
  dom.progressFill.style.width = `${progress * 100}%`;
  dom.timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(state.clipDuration)}`;
}

function updateActionButtons() {
  const validation = validateHumanoidMap(state.humanoidMap);
  const hasSource = Boolean(state.sourceClip);
  const hasVRM = Boolean(state.currentVRM);
  const hasTracks = state.sourceTracks.length > 0;
  const hasCustomVRM = hasVRM && !state.currentVRMIsDefault;

  dom.clearButton.disabled = !hasSource && !hasCustomVRM && !state.exportArtifact;
  dom.verifyButton.disabled = !hasSource || !hasVRM || !validation.isValid || !hasTracks;
  dom.exportButton.disabled = !hasSource || !validation.isValid || !hasTracks;

  if (!hasSource && !hasVRM) {
    dom.emptyOverlay.classList.add('visible');
  } else {
    dom.emptyOverlay.classList.remove('visible');
  }
}

function renderImportSummary() {
  const items = [];

  if (state.sourceFile) {
    items.push(`
      <article class="summary-card">
        <span class="summary-label">FBX</span>
        <strong>${escapeHtml(state.sourceFile.name)}</strong>
        <span>${formatFileSize(state.sourceFile.size)} · ${state.sourceTracks.length} 条可用轨道</span>
      </article>
    `);
  } else {
    items.push(`
      <article class="summary-card empty">
        <span class="summary-label">FBX</span>
        <strong>尚未导入</strong>
        <span>支持标准 Humanoid 动画，优先 Mixamo / UE 命名。</span>
      </article>
    `);
  }

  if (state.currentVRM) {
    items.push(`
      <article class="summary-card">
        <span class="summary-label">VRM</span>
        <strong>${escapeHtml(state.currentVRMLabel || state.currentVRM.meta?.name || '已载入模型')}</strong>
        <span>${state.currentVRMIsDefault ? '内置默认 VRM 已就绪，可随时更换成你的自定义角色。' : '自定义 VRM 已载入，后续导入 FBX 会直接套用到这个角色。'}</span>
      </article>
    `);
  } else {
    items.push(`
      <article class="summary-card empty">
        <span class="summary-label">VRM</span>
        <strong>等待载入</strong>
        <span>默认 VRM 加载失败时，可以手动上传自定义 VRM 继续使用。</span>
      </article>
    `);
  }

  if (state.detectedPreset) {
    items.push(`
      <article class="summary-card accent">
        <span class="summary-label">识别预设</span>
        <strong>${state.detectedPreset === 'mixamo' ? 'Mixamo' : 'UE Humanoid'}</strong>
        <span>自动映射已写入下方编辑器，可继续手动修正。</span>
      </article>
    `);
  }

  dom.importSummary.innerHTML = items.join('');
}

function renderMappingSummary() {
  const validation = validateHumanoidMap(state.humanoidMap);
  const mappedCount = validation.mappedBoneIds.length;
  const missingHtml = validation.missingRequired.length
    ? `<span class="pill error">缺关键骨 ${validation.missingRequired.length}</span>`
    : `<span class="pill success">关键骨齐全</span>`;
  const duplicateHtml = validation.duplicateBoneIds.length
    ? `<span class="pill error">重复目标 ${validation.duplicateBoneIds.length}</span>`
    : `<span class="pill neutral">无重复映射</span>`;

  dom.mappingSummary.innerHTML = `
    <div class="summary-grid compact">
      <article class="summary-card">
        <span class="summary-label">源骨骼</span>
        <strong>${state.sourceBoneNames.length || 0}</strong>
        <span>检测到的可映射名称</span>
      </article>
      <article class="summary-card">
        <span class="summary-label">已映射</span>
        <strong>${mappedCount}</strong>
        <span>可导出目标骨骼数</span>
      </article>
    </div>
    <div class="inline-pills">
      ${missingHtml}
      ${duplicateHtml}
    </div>
  `;
}

function renderMappingList() {
  if (!state.sourceBoneNames.length) {
    dom.mappingList.innerHTML = `
      <div class="empty-block">
        导入 FBX 后，这里会列出检测到的骨骼和自动映射结果。
      </div>
    `;
    return;
  }

  const validation = validateHumanoidMap(state.humanoidMap);
  const duplicateSet = new Set(validation.duplicateBoneIds);
  const rows = state.sourceBoneNames
    .map((sourceBoneName) => {
      const current = state.humanoidMap[sourceBoneName]?.boneId || '';
      const source = state.humanoidMap[sourceBoneName]?.source || 'manual';
      const options = [`<option value="">未映射</option>`]
        .concat(
          SUPPORTED_BONES.map((boneId) => {
            const selected = boneId === current ? ' selected' : '';
            return `<option value="${boneId}"${selected}>${boneId}</option>`;
          }),
        )
        .join('');
      const isRequired = current && REQUIRED_BONES.has(current);
      const isDuplicate = current && duplicateSet.has(current);

      return `
        <label class="mapping-row ${current ? 'mapped' : 'unmapped'} ${isDuplicate ? 'duplicate' : ''}">
          <span class="mapping-meta">
            <strong>${escapeHtml(sourceBoneName)}</strong>
            <span>${source === 'preset' ? '自动识别' : '手动修正'}${isRequired ? ' · 关键骨' : ''}${isDuplicate ? ' · 重复目标' : ''}</span>
          </span>
          <select data-source-bone="${escapeHtml(sourceBoneName)}">
            ${options}
          </select>
        </label>
      `;
    })
    .join('');

  dom.mappingList.innerHTML = rows;
}

function renderExportSummary() {
  const validation = validateHumanoidMap(state.humanoidMap);
  const artifact = state.exportArtifact;
  const lines = [];

  if (!state.sourceClip) {
    lines.push('<div class="empty-block">先导入一个 FBX 动画文件，导出信息会显示在这里。</div>');
  } else {
    lines.push(`
      <article class="summary-card">
        <span class="summary-label">可导出状态</span>
        <strong>${validation.isValid ? '可以导出' : '待修正'}</strong>
        <span>${validation.isValid ? '关键骨完整且无重复映射。' : '请先补齐关键骨并消除重复映射。'}</span>
      </article>
    `);
  }

  if (artifact?.stats) {
    lines.push(`
      <article class="summary-card accent">
        <span class="summary-label">最近一次构建</span>
        <strong>${escapeHtml(artifact.fileName || createFileName(state.sourceFile?.name, '.vrma'))}</strong>
        <span>${artifact.stats.channelCount} 条动画通道 · ${formatNumber(artifact.stats.duration, 2)}s</span>
      </article>
    `);
  }

  if (artifact?.verify) {
    lines.push(`
      <article class="summary-card ${artifact.verify.ok ? '' : 'error'}">
        <span class="summary-label">自检结果</span>
        <strong>${artifact.verify.ok ? '本地重载通过' : '本地重载失败'}</strong>
        <span>
          ${
            artifact.verify.ok
              ? `${artifact.verify.humanoidBoneCount} 个 Humanoid 轨道 · ${formatNumber(artifact.verify.duration, 2)}s`
              : artifact.verify.message
          }
        </span>
      </article>
    `);
  }

  dom.exportSummary.innerHTML = lines.join('');
}

function renderDebugConsole() {
  const entries = state.showErrorOnly ? state.logs.filter((entry) => entry.level === 'error') : state.logs;

  if (!entries.length) {
    dom.debugLog.innerHTML = `
      <div class="empty-block">
        这里会保留导入、映射、导出和自检过程中的调试信息，方便我们后续一起排查问题。
      </div>
    `;
    return;
  }

  dom.debugLog.innerHTML = entries
    .map((entry) => `
      <article class="log-entry" data-level="${entry.level}">
        <div class="log-head">
          <span class="log-pill">${entry.level}</span>
          <strong>${escapeHtml(entry.stage)}</strong>
          <time>${entry.timestamp}</time>
        </div>
        <p>${escapeHtml(entry.summary)}</p>
        ${entry.details ? `<pre>${escapeHtml(entry.details)}</pre>` : ''}
        ${entry.raw ? `<details><summary>原始异常</summary><pre>${escapeHtml(entry.raw)}</pre></details>` : ''}
      </article>
    `)
    .join('');
}

function renderAll() {
  renderImportSummary();
  renderMappingSummary();
  renderMappingList();
  renderExportSummary();
  renderDebugConsole();
  updateActionButtons();
  updatePlaybackUi();
}

function buildHumanoidNodes() {
  const sourceNodes = Object.entries(state.humanoidMap)
    .filter(([, entry]) => entry?.boneId)
    .map(([sourceBoneName, entry]) => {
      const pose = state.restPose[sourceBoneName];
      return {
        sourceBoneName,
        boneId: entry.boneId,
        name: pose?.sourceName || entry.boneId,
        translation: (pose?.position || [0, 0, 0]).map((value) => Number((value * state.sourceUnitScale).toFixed(6))),
        parentSourceBoneName: pose?.parentSourceBoneName || null,
      };
    });

  const nodeBySourceBoneName = new Map(sourceNodes.map((node) => [node.sourceBoneName, node]));
  const rootNodes = [];

  sourceNodes.forEach((node) => {
    let parentSourceBoneName = node.parentSourceBoneName;
    while (parentSourceBoneName && !nodeBySourceBoneName.has(parentSourceBoneName)) {
      parentSourceBoneName = state.restPose[parentSourceBoneName]?.parentSourceBoneName || null;
    }

    if (parentSourceBoneName) {
      const parentNode = nodeBySourceBoneName.get(parentSourceBoneName);
      parentNode.childrenBoneIds = [...(parentNode.childrenBoneIds || []), node.boneId];
      node.parentBoneId = parentNode.boneId;
    } else {
      rootNodes.push(node);
    }
  });

  const ordered = [];
  const walk = (node) => {
    ordered.push(node);
    (node.childrenBoneIds || [])
      .map((boneId) => sourceNodes.find((candidate) => candidate.boneId === boneId))
      .filter(Boolean)
      .forEach(walk);
  };

  rootNodes.forEach(walk);
  return ordered.map(({ sourceBoneName, parentSourceBoneName, ...node }) => node);
}

function buildCurrentArtifact() {
  const validation = validateHumanoidMap(state.humanoidMap);
  if (!state.sourceClip) {
    throw new Error('还没有加载 FBX 动画');
  }
  if (!validation.isValid) {
    const detail = validation.missingRequired.length
      ? `缺少关键骨：${validation.missingRequired.join(', ')}`
      : `存在重复目标：${validation.duplicateBoneIds.join(', ')}`;
    throw new Error(detail);
  }

  const animationTracks = buildVrmaAnimationTracks({
    sourceTracks: state.sourceTracks,
    humanoidMap: state.humanoidMap,
    restPose: state.restPose,
    unitScale: state.sourceUnitScale,
  });

  if (!animationTracks.length) {
    throw new Error('当前映射没有生成任何合法动画轨道');
  }

  const artifact = buildVrmaDocument({
    generator: 'FBX to VRMA Workbench',
    humanoidNodes: buildHumanoidNodes(),
    animationTracks,
  });

  artifact.fileName = createFileName(state.sourceFile?.name, '.vrma');
  artifact.fileSize = artifact.text.length;
  state.exportArtifact = artifact;
  return artifact;
}

async function verifyArtifact(activatePreview = false) {
  const artifact = buildCurrentArtifact();
  const blob = new Blob([artifact.text], { type: 'model/gltf+json' });
  const url = URL.createObjectURL(blob);

  logDebug('info', 'self-verify', '开始回灌刚生成的 VRMA', artifact.fileName);
  setLoading(true);

  try {
    const gltf = await vrmaLoader.loadAsync(url);
    const vrmAnimation = gltf.userData?.vrmAnimations?.[0];
    if (!vrmAnimation) {
      throw new Error('文件已生成，但没有解析出 VRMAnimation');
    }

    const rotationCount = vrmAnimation.humanoidTracks.rotation.size;
    const translationCount = vrmAnimation.humanoidTracks.translation.size;

    artifact.verify = {
      ok: true,
      duration: vrmAnimation.duration,
      humanoidBoneCount: rotationCount + translationCount,
    };
    state.exportArtifact = artifact;

    logDebug(
      'info',
      'self-verify',
      'VRMA 本地重载成功',
      `${artifact.verify.humanoidBoneCount} 条 Humanoid 轨道 · ${formatNumber(vrmAnimation.duration, 2)}s`,
    );

    if (activatePreview && state.currentVRM) {
      playVRMPreview(vrmAnimation);
      frameObject(state.currentVRMGroup);
    }

    renderExportSummary();
    return artifact;
  } catch (error) {
    artifact.verify = {
      ok: false,
      message: error.message,
    };
    state.exportArtifact = artifact;
    logDebug('error', 'self-verify', 'VRMA 本地重载失败', error.message, error);
    renderExportSummary();
    throw error;
  } finally {
    URL.revokeObjectURL(url);
    setLoading(false);
  }
}

async function handleVerifyClick() {
  try {
    const artifact = await verifyArtifact(true);
    showToast(`验证通过：${artifact.fileName}`, 'success');
  } catch (error) {
    showToast(`验证失败：${error.message}`, 'error');
  }
}

async function handleExportClick() {
  try {
    const artifact = await verifyArtifact(false);
    const blob = new Blob([artifact.text], { type: 'model/gltf+json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = artifact.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    logDebug('info', 'download', 'VRMA 下载已触发', artifact.fileName);
    showToast(`已下载 ${artifact.fileName}`, 'success');
  } catch (error) {
    logDebug('error', 'download', 'VRMA 下载前校验失败', error.message, error);
    showToast(`导出失败：${error.message}`, 'error');
  }
}

async function loadFBXFromUrl(file, url) {
  try {
    clearSourceData();
    clearPlayback();

    const fbx = await fbxLoader.loadAsync(url);
    if (!fbx.animations?.length) {
      throw new Error('FBX 中没有找到动画数据');
    }

    state.sourceFile = file;
    state.sourceRoot = fbx;
    state.sourceClip = fbx.animations[0];
    state.sourceTracks = extractSourceTracks(state.sourceClip);
    state.restPose = captureRestPose(fbx);
    state.sourceUnitScale = inferSourceUnitScale(state.restPose);
    state.sourceBoneNames = collectSourceBoneNames(state.restPose, state.sourceTracks);

    const inferred = inferHumanoidMap(state.sourceBoneNames);
    state.detectedPreset = inferred.preset;
    state.humanoidMap = inferred.mapping;
    const validation = validateHumanoidMap(state.humanoidMap);

    scene.add(fbx);
    setActiveRailTab('mapping');

    if (state.currentVRM && validation.isValid && state.sourceTracks.length > 0) {
      await verifyArtifact(true);
      setStatus('FBX 已载入并套用到角色', 'ready');
      setHint('已切到映射面板。自动预览已更新，修改映射后可点击“重新角色预览”刷新角色效果。');
    } else {
      setPreviewMode('source');
      frameObject(fbx);
      playSourcePreview();

      if (validation.isValid) {
        setStatus('FBX 已载入', 'ready');
        setHint('FBX 检测通过，但当前角色还没准备好。可更换 VRM，或稍后点击“重新角色预览”回灌检查。');
      } else {
        setStatus('FBX 已载入，等待修正映射', 'ready');
        setHint('自动映射已完成，但还需要补齐关键骨或去掉重复目标，之后再点击“重新角色预览”。');
      }
    }

    logDebug(
      'info',
      'map-bones',
      '完成自动骨骼识别',
      `${state.sourceBoneNames.length} 个源骨骼 · 预设 ${state.detectedPreset || '未命中'} · 单位缩放 ${state.sourceUnitScale}`,
    );
  } catch (error) {
    setStatus('FBX 加载失败', 'error');
    setHint('请检查 FBX 是否包含标准 Humanoid 动画。');
    logDebug('error', 'load-fbx', 'FBX 解析失败', error.message, error);
    showToast(`FBX 加载失败：${error.message}`, 'error');
  } finally {
    URL.revokeObjectURL(url);
    setLoading(false);
    renderAll();
    resetWorkspaceScroll();
  }
}

async function loadFBX(file) {
  logDebug('info', 'load-fbx', '开始读取 FBX', `${file.name} · ${formatFileSize(file.size)}`);
  setLoading(true);
  setStatus('正在加载 FBX...', 'loading');

  const url = URL.createObjectURL(file);

  try {
    await loadFBXFromUrl(file, url);
  } finally {
    URL.revokeObjectURL(url);
    setLoading(false);
    renderAll();
    resetWorkspaceScroll();
  }
}

async function loadVRMFromUrl(url, options = {}) {
  const {
    isDefault = false,
    label = DEFAULT_VRM_LABEL,
  } = options;

  logDebug('info', 'load-vrm', isDefault ? '开始读取默认 VRM' : '开始读取 VRM', label);
  setLoading(true);
  setStatus(isDefault ? '正在加载默认 VRM...' : '正在加载 VRM...', 'loading');

  try {
    clearVRMData();

    const gltf = await gltfLoader.loadAsync(url);
    const vrm = gltf.userData?.vrm;
    if (!vrm) {
      throw new Error('文件不是有效的 VRM');
    }

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.removeUnnecessaryJoints(gltf.scene);

    state.currentVRM = vrm;
    state.currentVRMGroup = vrm.scene;
    state.currentVRMLabel = vrm.meta?.name || label;
    state.currentVRMIsDefault = isDefault;
    setPreviewMode('vrm');
    scene.add(state.currentVRMGroup);
    frameObject(state.currentVRMGroup);

    if (state.sourceClip && validateHumanoidMap(state.humanoidMap).isValid && state.sourceTracks.length > 0) {
      await verifyArtifact(true);
      setActiveRailTab('mapping');
      setStatus(isDefault ? '默认 VRM 已就绪' : 'VRM 已替换并完成预览', 'ready');
      setHint(
        isDefault
          ? '内置默认 VRM 已就绪，导入 FBX 后会直接套用预览。'
          : '自定义 VRM 已替换成功，当前动作已重新套用到新角色上。',
      );
    } else {
      setStatus(isDefault ? '默认 VRM 已就绪' : 'VRM 已载入', 'ready');
      setHint(
        isDefault
          ? '内置默认 VRM 已就绪，你现在只需要导入 FBX。'
          : '自定义 VRM 已载入，后续导入 FBX 会直接套用到这个角色。',
      );
    }

    logDebug('info', 'load-vrm', isDefault ? '默认 VRM 载入完成' : 'VRM 载入完成', vrm.meta?.name || label);
    return vrm;
  } catch (error) {
    setStatus(isDefault ? '默认 VRM 加载失败' : 'VRM 加载失败', 'error');
    setHint(isDefault ? '默认 VRM 未能载入，请手动上传自定义 VRM 继续工作。' : '请检查上传的 VRM 文件是否有效。');
    logDebug('error', 'load-vrm', isDefault ? '默认 VRM 解析失败' : 'VRM 解析失败', error.message, error);
    showToast(isDefault ? `默认 VRM 加载失败：${error.message}` : `VRM 加载失败：${error.message}`, 'error');
    throw error;
  } finally {
    setLoading(false);
    renderAll();
  }
}

async function loadVRM(file) {
  const url = URL.createObjectURL(file);

  try {
    await loadVRMFromUrl(url, {
      isDefault: false,
      label: file.name,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function bootstrapDefaultVRM() {
  try {
    await loadVRMFromUrl(DEFAULT_VRM_URL, {
      isDefault: true,
      label: DEFAULT_VRM_LABEL,
    });
  } catch (error) {
    logDebug('warning', 'load-vrm', '默认 VRM 未就绪，等待手动上传', error.message);
  }
}

function handleMappingChange(event) {
  const select = event.target.closest('select[data-source-bone]');
  if (!select) {
    return;
  }

  const sourceBoneName = select.dataset.sourceBone;
  const boneId = select.value;

  if (!boneId) {
    delete state.humanoidMap[sourceBoneName];
    logDebug('warning', 'map-bones', `已取消映射 ${sourceBoneName}`);
  } else {
    const previousSource = state.humanoidMap[sourceBoneName]?.source === 'preset' ? 'preset' : 'manual';
    state.humanoidMap[sourceBoneName] = {
      boneId,
      source: previousSource === 'preset' ? 'preset' : 'manual',
    };
    logDebug('info', 'map-bones', `映射更新 ${sourceBoneName} -> ${boneId}`);
  }

  state.exportArtifact = null;
  renderAll();
}

function togglePlay() {
  if (!state.currentAction) {
    return;
  }

  state.currentAction.paused = !state.currentAction.paused;
  state.isPlaying = !state.currentAction.paused;
  updatePlaybackUi();
}

function restartPlayback() {
  if (!state.currentAction) {
    return;
  }

  state.currentAction.reset();
  state.currentAction.play();
  state.currentAction.paused = false;
  state.isPlaying = true;
  updatePlaybackUi();
}

function seekPlayback(clientX) {
  if (!state.currentAction || !state.clipDuration) {
    return;
  }

  const rect = dom.progressTrack.getBoundingClientRect();
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const targetTime = ratio * state.clipDuration;
  state.currentAction.time = targetTime;
  if (state.mixer) {
    state.mixer.update(0);
  }
  updatePlaybackUi();
}

async function copyLogs() {
  const payload = state.logs
    .map((entry) => [
      `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.stage}`,
      entry.summary,
      entry.details,
      entry.raw,
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  try {
    await navigator.clipboard.writeText(payload);
    showToast('调试日志已复制', 'success');
  } catch (error) {
    logDebug('error', 'debug-console', '复制日志失败', error.message, error);
    showToast('复制日志失败，请手动复制', 'error');
  }
}

function resetWorkspace() {
  const needsDefaultRestore = !state.currentVRMIsDefault;

  clearPlayback();
  clearSourceData();

  if (needsDefaultRestore) {
    clearVRMData();
  } else {
    setPreviewMode('vrm');
    frameObject(state.currentVRMGroup);
  }

  setActiveRailTab('overview');
  setStatus(needsDefaultRestore ? '正在恢复默认 VRM...' : '默认 VRM 已就绪', needsDefaultRestore ? 'loading' : 'ready');
  setHint(needsDefaultRestore ? '正在恢复内置默认 VRM，请稍候。' : '内置默认 VRM 已就绪，导入 FBX 后会直接进入角色预览。');
  renderAll();
  resetWorkspaceScroll();

  if (needsDefaultRestore) {
    void bootstrapDefaultVRM();
  }
}

function handleDrop(files) {
  const fbxFile = files.find((file) => file.name.toLowerCase().endsWith('.fbx'));
  const vrmFile = files.find((file) => file.name.toLowerCase().endsWith('.vrm'));

  if (fbxFile) {
    void loadFBX(fbxFile);
  }
  if (vrmFile) {
    void loadVRM(vrmFile);
  }

  if (!fbxFile && !vrmFile) {
    showToast('仅支持拖入 .fbx 和 .vrm 文件', 'error');
  }
}

function resize() {
  const width = dom.canvas.clientWidth;
  const height = dom.canvas.clientHeight;
  if (!width || !height) {
    return;
  }

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  controls.update();

  if (state.mixer) {
    state.mixer.update(delta);
  }

  if (state.currentVRM) {
    state.currentVRM.update(delta);
  }

  updatePlaybackUi();
  renderer.render(scene, camera);
}

dom.loadFbxButton.addEventListener('click', () => dom.fbxInput.click());
dom.loadVrmButton.addEventListener('click', () => dom.vrmInput.click());
dom.clearButton.addEventListener('click', resetWorkspace);
dom.playButton.addEventListener('click', togglePlay);
dom.restartButton.addEventListener('click', restartPlayback);
dom.speedSelect.addEventListener('change', () => {
  if (state.mixer) {
    state.mixer.timeScale = Number(dom.speedSelect.value);
  }
});
dom.progressTrack.addEventListener('click', (event) => seekPlayback(event.clientX));
dom.verifyButton.addEventListener('click', () => void handleVerifyClick());
dom.exportButton.addEventListener('click', () => void handleExportClick());
dom.railTabBar.addEventListener('click', handleRailTabClick);
dom.mappingList.addEventListener('change', handleMappingChange);
dom.clearLogsButton.addEventListener('click', () => {
  state.logs = [];
  renderDebugConsole();
});
dom.copyLogsButton.addEventListener('click', () => void copyLogs());
dom.debugFilterErrors.addEventListener('change', () => {
  state.showErrorOnly = dom.debugFilterErrors.checked;
  renderDebugConsole();
});

dom.fbxInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) {
    void loadFBX(file);
  }
  event.target.value = '';
});

dom.vrmInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) {
    void loadVRM(file);
  }
  event.target.value = '';
});

dom.dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dom.dropzone.classList.add('dragover');
});

dom.dropzone.addEventListener('dragleave', () => {
  dom.dropzone.classList.remove('dragover');
});

dom.dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dom.dropzone.classList.remove('dragover');
  const files = [...(event.dataTransfer?.files || [])];
  handleDrop(files);
});

window.addEventListener('resize', resize);

setStatus('正在加载默认 VRM...', 'loading');
setHint('内置默认 VRM 加载中，完成后你只需要导入 FBX。');
setActiveRailTab('overview');
renderAll();
resize();
animate();
void bootstrapDefaultVRM();
