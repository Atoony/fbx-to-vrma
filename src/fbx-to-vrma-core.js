const TRACK_NAME_RE = /^(.+)\.(quaternion|position|scale)$/;

const REQUIRED_BONE_IDS = [
  'hips',
  'spine',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'rightUpperArm',
  'rightLowerArm',
  'leftUpperLeg',
  'leftLowerLeg',
  'rightUpperLeg',
  'rightLowerLeg',
];

const MIXAMO_PRESET = {
  Hips: 'hips',
  Spine: 'spine',
  Spine1: 'chest',
  Spine2: 'upperChest',
  Neck: 'neck',
  Head: 'head',
  LeftShoulder: 'leftShoulder',
  LeftArm: 'leftUpperArm',
  LeftForeArm: 'leftLowerArm',
  LeftHand: 'leftHand',
  RightShoulder: 'rightShoulder',
  RightArm: 'rightUpperArm',
  RightForeArm: 'rightLowerArm',
  RightHand: 'rightHand',
  LeftUpLeg: 'leftUpperLeg',
  LeftLeg: 'leftLowerLeg',
  LeftFoot: 'leftFoot',
  LeftToeBase: 'leftToes',
  RightUpLeg: 'rightUpperLeg',
  RightLeg: 'rightLowerLeg',
  RightFoot: 'rightFoot',
  RightToeBase: 'rightToes',
  LeftHandThumb1: 'leftThumbMetacarpal',
  LeftHandThumb2: 'leftThumbProximal',
  LeftHandThumb3: 'leftThumbDistal',
  LeftHandIndex1: 'leftIndexProximal',
  LeftHandIndex2: 'leftIndexIntermediate',
  LeftHandIndex3: 'leftIndexDistal',
  LeftHandMiddle1: 'leftMiddleProximal',
  LeftHandMiddle2: 'leftMiddleIntermediate',
  LeftHandMiddle3: 'leftMiddleDistal',
  LeftHandRing1: 'leftRingProximal',
  LeftHandRing2: 'leftRingIntermediate',
  LeftHandRing3: 'leftRingDistal',
  LeftHandPinky1: 'leftLittleProximal',
  LeftHandPinky2: 'leftLittleIntermediate',
  LeftHandPinky3: 'leftLittleDistal',
  RightHandThumb1: 'rightThumbMetacarpal',
  RightHandThumb2: 'rightThumbProximal',
  RightHandThumb3: 'rightThumbDistal',
  RightHandIndex1: 'rightIndexProximal',
  RightHandIndex2: 'rightIndexIntermediate',
  RightHandIndex3: 'rightIndexDistal',
  RightHandMiddle1: 'rightMiddleProximal',
  RightHandMiddle2: 'rightMiddleIntermediate',
  RightHandMiddle3: 'rightMiddleDistal',
  RightHandRing1: 'rightRingProximal',
  RightHandRing2: 'rightRingIntermediate',
  RightHandRing3: 'rightRingDistal',
  RightHandPinky1: 'rightLittleProximal',
  RightHandPinky2: 'rightLittleIntermediate',
  RightHandPinky3: 'rightLittleDistal',
};

const UE_PRESET = {
  pelvis: 'hips',
  spine_01: 'spine',
  spine_02: 'chest',
  spine_03: 'upperChest',
  neck_01: 'neck',
  head: 'head',
  clavicle_l: 'leftShoulder',
  upperarm_l: 'leftUpperArm',
  lowerarm_l: 'leftLowerArm',
  hand_l: 'leftHand',
  clavicle_r: 'rightShoulder',
  upperarm_r: 'rightUpperArm',
  lowerarm_r: 'rightLowerArm',
  hand_r: 'rightHand',
  thigh_l: 'leftUpperLeg',
  calf_l: 'leftLowerLeg',
  foot_l: 'leftFoot',
  ball_l: 'leftToes',
  thigh_r: 'rightUpperLeg',
  calf_r: 'rightLowerLeg',
  foot_r: 'rightFoot',
  ball_r: 'rightToes',
};

const PRESETS = [
  { id: 'mixamo', map: MIXAMO_PRESET },
  { id: 'ue', map: UE_PRESET },
];

function normalizeKey(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, '');
}

function roundNumber(value, digits = 6) {
  const rounded = Number(value.toFixed(digits));
  return Math.abs(rounded) < 1e-6 ? 0 : rounded;
}

function normalizeQuat([x, y, z, w]) {
  const length = Math.hypot(x, y, z, w) || 1;
  return [x / length, y / length, z / length, w / length];
}

function invertQuat([x, y, z, w]) {
  const lengthSquared = x * x + y * y + z * z + w * w || 1;
  return [-x / lengthSquared, -y / lengthSquared, -z / lengthSquared, w / lengthSquared];
}

function multiplyQuat([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function scaleVec3(values, scalar) {
  return [values[0] * scalar, values[1] * scalar, values[2] * scalar];
}

function toNormalizedLocalRotation(sampleRotation, restPose) {
  const sample = normalizeQuat(sampleRotation);
  const localRestRotation = normalizeQuat(restPose.rotation);
  const worldRestRotation = restPose.worldRotation ? normalizeQuat(restPose.worldRotation) : null;

  if (!worldRestRotation) {
    return normalizeQuat(multiplyQuat(invertQuat(localRestRotation), sample));
  }

  return normalizeQuat(
    multiplyQuat(
      multiplyQuat(
        multiplyQuat(worldRestRotation, invertQuat(localRestRotation)),
        sample,
      ),
      invertQuat(worldRestRotation),
    ),
  );
}

function chunkValues(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function encodeBase64(uint8Array) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(uint8Array).toString('base64');
  }

  let binary = '';
  uint8Array.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return result;
}

function createFloat32Chunk(values) {
  const floatArray = new Float32Array(values);
  return new Uint8Array(floatArray.buffer.slice(0));
}

export function normalizeSourceBoneName(name) {
  return String(name)
    .split('|')
    .pop()
    .replace(/^mixamorig[:_]?/i, '')
    .replace(/^def[_:]/i, '')
    .replace(/^bip0?1[\s:_-]*/i, '')
    .replace(/^bone[:_\s-]*/i, '')
    .trim();
}

export function parseTrackBinding(trackName) {
  const match = String(trackName).match(TRACK_NAME_RE);
  if (!match) {
    return null;
  }

  const property = match[2] === 'quaternion' ? 'rotation' : match[2];
  return {
    sourceBoneName: normalizeSourceBoneName(match[1]),
    property,
  };
}

export function inferHumanoidMap(sourceBoneNames) {
  const normalizedNames = [...new Set(sourceBoneNames.map((name) => normalizeSourceBoneName(name)).filter(Boolean))];

  let bestPreset = null;
  let bestMatches = {};

  PRESETS.forEach((preset) => {
    const matches = {};

    normalizedNames.forEach((name) => {
      const boneId = preset.map[name] ?? preset.map[normalizeKey(name)];
      if (boneId) {
        matches[name] = {
          boneId,
          source: 'preset',
          preset: preset.id,
        };
      }
    });

    if (Object.keys(matches).length > Object.keys(bestMatches).length) {
      bestPreset = preset.id;
      bestMatches = matches;
    }
  });

  return {
    preset: bestPreset,
    mapping: bestMatches,
    normalizedNames,
  };
}

export function validateHumanoidMap(humanoidMap) {
  const counts = new Map();
  Object.values(humanoidMap || {}).forEach((entry) => {
    const boneId = entry?.boneId;
    if (!boneId) {
      return;
    }
    counts.set(boneId, (counts.get(boneId) || 0) + 1);
  });

  const mappedBoneIds = new Set(counts.keys());
  const duplicateBoneIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([boneId]) => boneId);

  const missingRequired = REQUIRED_BONE_IDS.filter((boneId) => !mappedBoneIds.has(boneId));

  return {
    isValid: missingRequired.length === 0 && duplicateBoneIds.length === 0,
    missingRequired,
    duplicateBoneIds,
    mappedBoneIds: [...mappedBoneIds],
  };
}

export function buildVrmaAnimationTracks({
  sourceTracks = [],
  humanoidMap = {},
  restPose = {},
  unitScale = 1,
}) {
  const animationTracks = [];

  sourceTracks.forEach((track) => {
    const binding = parseTrackBinding(track.name);
    if (!binding) {
      return;
    }

    const target = humanoidMap[binding.sourceBoneName];
    const rest = restPose[binding.sourceBoneName];
    if (!target || !rest) {
      return;
    }

    if (binding.property === 'position' && target.boneId === 'hips') {
      const deltas = chunkValues(track.values, 3)
        .map((value) => scaleVec3(value, unitScale))
        .flat()
        .map((value) => roundNumber(value));

      animationTracks.push({
        boneId: target.boneId,
        path: 'position',
        times: [...track.times],
        values: deltas,
        valueType: 'VEC3',
      });
    }

    if (binding.property === 'rotation') {
      const deltas = chunkValues(track.values, 4)
        .map((value) => toNormalizedLocalRotation(value, rest))
        .flat()
        .map((value) => roundNumber(value));

      animationTracks.push({
        boneId: target.boneId,
        path: 'rotation',
        times: [...track.times],
        values: deltas,
        valueType: 'VEC4',
      });
    }
  });

  return animationTracks;
}

export function buildVrmaDocument({
  generator = 'FBX to VRMA Workbench',
  humanoidNodes = [],
  animationTracks = [],
}) {
  const nodes = [{ name: 'Root' }];
  const humanBones = {};

  humanoidNodes.forEach((node, index) => {
    const nodeIndex = index + 1;
    const jsonNode = {
      name: node.name || node.boneId,
    };

    if (node.translation) {
      jsonNode.translation = node.translation.map((value) => roundNumber(value));
    }

    if (node.rotation) {
      jsonNode.rotation = node.rotation.map((value) => roundNumber(value));
    }

    nodes.push(jsonNode);
    humanBones[node.boneId] = { node: nodeIndex };
  });

  const nodeIndexByBoneId = Object.fromEntries(
    humanoidNodes.map((node, index) => [node.boneId, index + 1]),
  );

  const rootChildren = [];
  humanoidNodes.forEach((node) => {
    const nodeIndex = nodeIndexByBoneId[node.boneId];
    const childIndices = (node.childrenBoneIds || [])
      .map((boneId) => nodeIndexByBoneId[boneId])
      .filter((childIndex) => Number.isInteger(childIndex));

    if (childIndices.length) {
      nodes[nodeIndex].children = childIndices;
    }

    if (!node.parentBoneId || !nodeIndexByBoneId[node.parentBoneId]) {
      rootChildren.push(nodeIndex);
    }
  });

  if (rootChildren.length) {
    nodes[0].children = rootChildren;
  }

  const rawChunks = [];
  const bufferViews = [];
  const accessors = [];
  const samplers = [];
  const channels = [];

  animationTracks.forEach((track) => {
    const inputChunk = createFloat32Chunk(track.times);
    const inputOffset = rawChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    rawChunks.push(inputChunk);
    bufferViews.push({
      buffer: 0,
      byteOffset: inputOffset,
      byteLength: inputChunk.byteLength,
    });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: track.times.length,
      type: 'SCALAR',
      min: [Math.min(...track.times)],
      max: [Math.max(...track.times)],
    });
    const inputAccessorIndex = accessors.length - 1;

    const outputChunk = createFloat32Chunk(track.values);
    const outputOffset = rawChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    rawChunks.push(outputChunk);
    bufferViews.push({
      buffer: 0,
      byteOffset: outputOffset,
      byteLength: outputChunk.byteLength,
    });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: track.times.length,
      type: track.valueType,
    });
    const outputAccessorIndex = accessors.length - 1;

    samplers.push({
      input: inputAccessorIndex,
      output: outputAccessorIndex,
      interpolation: 'LINEAR',
    });

    channels.push({
      sampler: samplers.length - 1,
      target: {
        node: nodeIndexByBoneId[track.boneId],
        path: track.path === 'position' ? 'translation' : track.path,
      },
    });
  });

  const binaryBuffer = concatUint8Arrays(rawChunks);
  const base64 = encodeBase64(binaryBuffer);

  const json = {
    asset: {
      version: '2.0',
      generator,
    },
    scene: 0,
    scenes: [
      {
        nodes: [0],
        name: 'Scene',
      },
    ],
    nodes,
    animations: [
      {
        channels,
        samplers,
      },
    ],
    accessors,
    bufferViews,
    buffers: [
      {
        byteLength: binaryBuffer.byteLength,
        uri: `data:application/octet-stream;base64,${base64}`,
      },
    ],
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: '1.0',
        humanoid: {
          humanBones,
        },
      },
    },
  };

  return {
    json,
    text: `${JSON.stringify(json, null, 2)}\n`,
    bytes: binaryBuffer,
    stats: {
      nodeCount: humanoidNodes.length,
      channelCount: channels.length,
      duration: animationTracks.reduce((max, track) => Math.max(max, track.times.at(-1) ?? 0), 0),
    },
  };
}

export function getRequiredBoneIds() {
  return [...REQUIRED_BONE_IDS];
}

export function getSupportedBoneIds() {
  const ids = new Set([
    ...REQUIRED_BONE_IDS,
    ...Object.values(MIXAMO_PRESET),
    ...Object.values(UE_PRESET),
  ]);
  return [...ids].sort();
}
