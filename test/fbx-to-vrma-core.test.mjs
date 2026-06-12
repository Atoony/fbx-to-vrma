import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSourceBoneName,
  inferHumanoidMap,
  validateHumanoidMap,
  buildVrmaAnimationTracks,
  buildVrmaDocument,
} from '../src/fbx-to-vrma-core.js';
import {
  quatFromAxisAngle,
  retargetMixamoQuaternion,
  multiplyQuat,
  invertQuat,
  roundQuat,
} from '../src/mixamo-retarget-pose.js';

test('normalizeSourceBoneName strips common humanoid prefixes', () => {
  assert.equal(normalizeSourceBoneName('mixamorig:Hips'), 'Hips');
  assert.equal(normalizeSourceBoneName('Armature|mixamorig:LeftArm'), 'LeftArm');
  assert.equal(normalizeSourceBoneName('Bip01 Right ForeArm'), 'Right ForeArm');
});

test('inferHumanoidMap prefers Mixamo preset for standard names', () => {
  const result = inferHumanoidMap([
    'mixamorig:Hips',
    'mixamorig:Spine',
    'mixamorig:LeftArm',
    'mixamorig:RightArm',
  ]);

  assert.equal(result.preset, 'mixamo');
  assert.equal(result.mapping.Hips.boneId, 'hips');
  assert.equal(result.mapping.LeftArm.boneId, 'leftUpperArm');
});

test('validateHumanoidMap reports missing required bones', () => {
  const result = validateHumanoidMap({
    Hips: { boneId: 'hips' },
    Spine: { boneId: 'spine' },
  });

  assert.equal(result.isValid, false);
  assert.ok(result.missingRequired.includes('head'));
});

test('buildVrmaAnimationTracks converts local FBX samples into absolute hips translation and normalized rotation tracks', () => {
  const tracks = buildVrmaAnimationTracks({
    sourceTracks: [
      {
        name: 'mixamorig:Hips.position',
        times: [0, 1],
        values: [0, 100, 0, 10, 110, 0],
      },
      {
        name: 'mixamorig:Hips.quaternion',
        times: [0, 1],
        values: [0, 0, 0, 1, 0, 0.7071068, 0, 0.7071068],
      },
    ],
    humanoidMap: {
      Hips: { boneId: 'hips' },
    },
    restPose: {
      Hips: {
        position: [0, 100, 0],
        rotation: [0, 0, 0, 1],
      },
    },
  });

  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks[0], {
    boneId: 'hips',
    path: 'position',
    times: [0, 1],
    values: [0, 100, 0, 10, 110, 0],
    valueType: 'VEC3',
  });
  assert.deepEqual(tracks[1], {
    boneId: 'hips',
    path: 'rotation',
    times: [0, 1],
    values: [0, 0, 0, 1, 0, 0.707107, 0, 0.707107],
    valueType: 'VEC4',
  });
});

test('buildVrmaAnimationTracks scales absolute hips translation into meters when unitScale is provided', () => {
  const tracks = buildVrmaAnimationTracks({
    sourceTracks: [
      {
        name: 'mixamorig:Hips.position',
        times: [0, 1],
        values: [0, 96.3756, 0, 21.3479, 57.3164, 724.0143],
      },
    ],
    humanoidMap: {
      Hips: { boneId: 'hips' },
    },
    restPose: {
      Hips: {
        position: [0, 96.3756, 0],
        rotation: [0, 0, 0, 1],
      },
    },
    unitScale: 0.01,
  });

  assert.deepEqual(tracks[0], {
    boneId: 'hips',
    path: 'position',
    times: [0, 1],
    values: [0, 0.963756, 0, 0.213479, 0.573164, 7.240143],
    valueType: 'VEC3',
  });
});

test('buildVrmaAnimationTracks converts source rotations into normalized humanoid rotations when world rest rotation is available', () => {
  const sourceParentRestWorld = quatFromAxisAngle([0, 1, 0], Math.PI / 4);
  const sourceRestLocal = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
  const sourceRestWorld = multiplyQuat(sourceParentRestWorld, sourceRestLocal);
  const sourceDelta = quatFromAxisAngle([1, 0, 0], Math.PI / 6);
  const sampleLocal = multiplyQuat(sourceRestLocal, sourceDelta);

  const tracks = buildVrmaAnimationTracks({
    sourceTracks: [
      {
        name: 'mixamorig:RightArm.quaternion',
        times: [0],
        values: sampleLocal,
      },
    ],
    humanoidMap: {
      RightArm: { boneId: 'rightUpperArm' },
    },
    restPose: {
      RightArm: {
        position: [0, 0, 0],
        rotation: sourceRestLocal,
        worldRotation: sourceRestWorld,
      },
    },
  });

  assert.deepEqual(tracks[0], {
    boneId: 'rightUpperArm',
    path: 'rotation',
    times: [0],
    values: roundQuat(
      retargetMixamoQuaternion(
        sampleLocal,
        sourceParentRestWorld,
        invertQuat(sourceRestWorld),
      ),
    ),
    valueType: 'VEC4',
  });
});

test('buildVrmaDocument creates a VRMC_vrm_animation JSON asset with embedded buffer data', () => {
  const result = buildVrmaDocument({
    generator: 'Test Exporter',
    humanoidNodes: [
      { boneId: 'hips', name: 'hips', translation: [0, 1, 0], childrenBoneIds: ['spine'] },
      { boneId: 'spine', name: 'spine', parentBoneId: 'hips' },
    ],
    animationTracks: [
      { boneId: 'hips', path: 'position', times: [0, 1], values: [0, 0, 0, 0, 0.1, 0], valueType: 'VEC3' },
      { boneId: 'spine', path: 'rotation', times: [0, 1], values: [0, 0, 0, 1, 0, 0, 0.7071068, 0.7071068], valueType: 'VEC4' },
    ],
  });

  assert.equal(result.json.asset.generator, 'Test Exporter');
  assert.deepEqual(result.json.extensionsUsed, ['VRMC_vrm_animation']);
  assert.equal(result.json.extensions.VRMC_vrm_animation.specVersion, '1.0');
  assert.equal(result.json.extensions.VRMC_vrm_animation.humanoid.humanBones.hips.node, 1);
  assert.deepEqual(result.json.nodes[1].translation, [0, 1, 0]);
  assert.deepEqual(result.json.nodes[0].children, [1]);
  assert.deepEqual(result.json.nodes[1].children, [2]);
  assert.ok(result.text.includes('data:application/octet-stream;base64,'));
});

test('buildVrmaDocument emits glTF translation channels instead of three.js position channels', () => {
  const result = buildVrmaDocument({
    humanoidNodes: [
      { boneId: 'hips', name: 'hips', translation: [0, 1, 0] },
    ],
    animationTracks: [
      { boneId: 'hips', path: 'position', times: [0, 1], values: [0, 0, 0, 0, 0.1, 0], valueType: 'VEC3' },
    ],
  });

  assert.equal(result.json.animations[0].channels[0].target.path, 'translation');
});
