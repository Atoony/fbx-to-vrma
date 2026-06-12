export function quatFromAxisAngle(axis, angle) {
  const half = angle / 2;
  const s = Math.sin(half);
  return normalizeQuat([axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)]);
}

export function multiplyQuat(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function invertQuat(q) {
  const [x, y, z, w] = q;
  const lenSq = x * x + y * y + z * z + w * w || 1;
  return [-x / lenSq, -y / lenSq, -z / lenSq, w / lenSq];
}

export function normalizeQuat(q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((value) => value / len);
}

export function retargetLocalQuaternion(sample, sourceRest, targetRest) {
  const delta = multiplyQuat(invertQuat(sourceRest), sample);
  return normalizeQuat(multiplyQuat(targetRest, delta));
}

export function retargetMixamoQuaternion(sampleLocal, sourceParentRestWorld, sourceRestWorldInverse) {
  return normalizeQuat(
    multiplyQuat(
      multiplyQuat(sourceParentRestWorld, sampleLocal),
      sourceRestWorldInverse,
    ),
  );
}

export function roundQuat(q, digits = 6) {
  return normalizeQuat(q).map((value) => {
    const rounded = Number(value.toFixed(digits));
    return Math.abs(rounded) < 1e-6 ? 0 : rounded;
  });
}
