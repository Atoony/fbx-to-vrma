import test from 'node:test';
import assert from 'node:assert/strict';

import {
  quatFromAxisAngle,
  retargetLocalQuaternion,
  retargetMixamoQuaternion,
  multiplyQuat,
  invertQuat,
  roundQuat,
} from '../src/mixamo-retarget-pose.js';

test('retargetLocalQuaternion preserves target rest pose when source sample equals source rest', () => {
  const sourceRest = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
  const targetRest = quatFromAxisAngle([0, 0, 1], 0);
  const sample = quatFromAxisAngle([0, 0, 1], Math.PI / 2);

  assert.deepEqual(roundQuat(retargetLocalQuaternion(sample, sourceRest, targetRest)), [0, 0, 0, 1]);
});

test('retargetLocalQuaternion transfers local delta from source rest onto target rest', () => {
  const sourceRest = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
  const targetRest = quatFromAxisAngle([0, 0, 1], 0);
  const sample = quatFromAxisAngle([0, 0, 1], Math.PI);

  assert.deepEqual(
    roundQuat(retargetLocalQuaternion(sample, sourceRest, targetRest)),
    roundQuat(quatFromAxisAngle([0, 0, 1], Math.PI / 2)),
  );
});

test('retargetMixamoQuaternion returns identity when the sample matches source rest pose', () => {
  const sourceParentRestWorld = quatFromAxisAngle([0, 1, 0], Math.PI / 4);
  const sourceRestLocal = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
  const sourceRestWorld = multiplyQuat(sourceParentRestWorld, sourceRestLocal);

  assert.deepEqual(
    roundQuat(
      retargetMixamoQuaternion(
        sourceRestLocal,
        sourceParentRestWorld,
        invertQuat(sourceRestWorld),
      ),
    ),
    [0, 0, 0, 1],
  );
});
