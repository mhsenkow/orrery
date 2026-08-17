/** XR hand skeleton helpers — pinch, cup, palm, shade + gesture→action.
 *  Next backlog hands 124. */

const JOINTS = [
  'wrist',
  'thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip',
  'thumb-phalanx-distal', 'index-finger-phalanx-proximal',
];

/** Read a hand's joint poses into a compact skeleton object. */
export function readHandSkeleton(frame, refSpace, xrHand) {
  if (!xrHand || typeof frame.getJointPose !== 'function') return null;
  const sk = { joints: {}, pinch: 0, cup: 0, palmNormal: [0, 1, 0], wrist: null };
  for (const name of JOINTS) {
    const j = xrHand.get?.(name);
    if (!j) continue;
    const pose = frame.getJointPose(j, refSpace);
    if (!pose) continue;
    const t = pose.transform;
    sk.joints[name] = {
      pos: [t.position.x, t.position.y, t.position.z],
      radius: pose.radius || 0.01,
    };
  }
  const wrist = sk.joints.wrist;
  const index = sk.joints['index-finger-tip'];
  const thumb = sk.joints['thumb-tip'];
  const middle = sk.joints['middle-finger-tip'];
  if (wrist) sk.wrist = wrist.pos;
  if (index && thumb) {
    const d = Math.hypot(
      index.pos[0] - thumb.pos[0],
      index.pos[1] - thumb.pos[1],
      index.pos[2] - thumb.pos[2]
    );
    sk.pinch = Math.max(0, 1 - d / 0.045);
  }
  if (wrist && index && middle) {
    const di = Math.hypot(index.pos[0] - wrist.pos[0], index.pos[1] - wrist.pos[1], index.pos[2] - wrist.pos[2]);
    const dm = Math.hypot(middle.pos[0] - wrist.pos[0], middle.pos[1] - wrist.pos[1], middle.pos[2] - wrist.pos[2]);
    sk.cup = Math.max(0, 1 - (di + dm) * 0.5 / 0.12);
  }
  if (wrist && index && middle) {
    const ax = index.pos[0] - wrist.pos[0], ay = index.pos[1] - wrist.pos[1], az = index.pos[2] - wrist.pos[2];
    const bx = middle.pos[0] - wrist.pos[0], by = middle.pos[1] - wrist.pos[1], bz = middle.pos[2] - wrist.pos[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    sk.palmNormal = [nx / l, ny / l, nz / l];
  }
  sk.indexTip = index?.pos || null;
  sk.thumbTip = thumb?.pos || null;
  return sk;
}

/** Simple 2-bone IK toward a target (tool tip / sculpt point). */
export function solveTwoBoneIK(shoulder, length1, length2, target) {
  const dx = target[0] - shoulder[0];
  const dy = target[1] - shoulder[1];
  const dz = target[2] - shoulder[2];
  const dist = Math.min(length1 + length2 - 0.001, Math.hypot(dx, dy, dz));
  const dir = [dx / (dist || 1), dy / (dist || 1), dz / (dist || 1)];
  const cosE = clamp(
    (length1 * length1 + dist * dist - length2 * length2) / (2 * length1 * Math.max(1e-4, dist)),
    -1, 1
  );
  const elbowDist = length1 * cosE;
  let px = -dir[2], py = 0, pz = dir[0];
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) { px = 0; py = 1; pz = 0; pl = 1; }
  px /= pl; pz /= pl;
  const sinE = Math.sqrt(Math.max(0, 1 - cosE * cosE));
  const elbow = [
    shoulder[0] + dir[0] * elbowDist + px * length1 * sinE * 0.35,
    shoulder[1] + dir[1] * elbowDist + py * length1 * sinE * 0.35,
    shoulder[2] + dir[2] * elbowDist + pz * length1 * sinE * 0.35,
  ];
  const tip = [
    shoulder[0] + dir[0] * dist,
    shoulder[1] + dir[1] * dist,
    shoulder[2] + dir[2] * dist,
  ];
  return { elbow, tip, reach: dist / (length1 + length2) };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/** Gesture vocabulary from skeleton. */
export function gestureFromSkeleton(sk) {
  if (!sk) return 'none';
  if (sk.pinch > 0.72) return 'pinch';
  if (sk.cup > 0.65) return 'cup';
  if (sk.palmNormal && sk.palmNormal[1] > 0.55 && sk.pinch < 0.25) return 'palm';
  if (sk.palmNormal && sk.palmNormal[1] < -0.4) return 'shade';
  return 'point';
}

/**
 * Apply gesture side-effects to sim / XR state.
 * Returns { grab, loadTable, toolBoost, note } hints for main loop.
 */
export function applyHandGesture(h, ctx = {}) {
  const out = { grab: false, loadPoint: null, scaleDelta: 1, solarMod: null, aim: null };
  const sk = h.skeleton;
  if (!sk) return out;
  const gesture = h.gesture || gestureFromSkeleton(sk);

  if (sk.pinch > 0.75) out.grab = true;

  // IK tip toward index for sculpt aim
  if (sk.wrist && sk.indexTip) {
    const ik = solveTwoBoneIK(sk.wrist, 0.12, 0.1, sk.indexTip);
    out.aim = ik.tip;
    h.ikElbow = ik.elbow;
    h.ikTip = ik.tip;
  }

  if (gesture === 'shade') {
    out.solarMod = 0.78;
  }

  if (gesture === 'palm' && sk.wrist && ctx.planetPos && ctx.planetScale) {
    const d = Math.hypot(
      sk.wrist[0] - ctx.planetPos[0],
      sk.wrist[1] - ctx.planetPos[1],
      sk.wrist[2] - ctx.planetPos[2]
    );
    // Palm toward planet = observe / soft inspect (no mutation)
    if (d < ctx.planetScale * 1.6) out.note = 'observe';
  }

  if (gesture === 'cup' && sk.wrist && ctx.planetPos && ctx.planetScale) {
    const d = Math.hypot(
      sk.wrist[0] - ctx.planetPos[0],
      sk.wrist[1] - ctx.planetPos[1],
      sk.wrist[2] - ctx.planetPos[2]
    );
    if (d < ctx.planetScale * 1.5) out.scaleDelta = 0.996;
  }

  // Pinch tip used as table pick point
  if (gesture === 'pinch' && sk.indexTip && ctx.tableEnabled) {
    out.loadPoint = sk.indexTip;
  }

  return out;
}
