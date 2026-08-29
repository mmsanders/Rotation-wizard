import * as THREE from 'three';
import type { AngleUnit, Frame, Quat, Vec3 } from '../types';
import { toDisplayAngle } from './conventions';

/**
 * Frame-tree resolution and frame-to-frame comparison.
 *
 * All rotation math delegates to THREE.Quaternion / THREE.Vector3 / THREE.Matrix4.
 */

export type Transform = {
  /** Origin of the frame, in global coordinates. */
  position: Vec3;
  /** Rotation from global axes to this frame's axes. */
  quaternion: Quat;
};

export const IDENTITY_TRANSFORM: Transform = {
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
};

export function toThreeQuat(q: Quat): THREE.Quaternion {
  return new THREE.Quaternion(q[0], q[1], q[2], q[3]);
}

export function toThreeVec(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

/**
 * Flip a quaternion to the w >= 0 hemisphere.
 *
 * q and -q are the same rotation (the double cover). Pinning the sign keeps the
 * readout from flipping signs as you drag a slider through a half turn.
 */
export function canonicalizeQuat(q: Quat): Quat {
  return q[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : [q[0], q[1], q[2], q[3]];
}

// ---------------------------------------------------------------------------
// Frame tree
// ---------------------------------------------------------------------------

/**
 * Resolve every frame's global transform by walking up to the root, memoising as it
 * goes so a deep tree still costs one pass.
 *
 * Defensive on two counts, because frames can be rehydrated from localStorage: a frame
 * whose parent has vanished is treated as a root, and a frame caught in a parent cycle
 * resolves to identity rather than recursing forever.
 */
export function resolveWorldTransforms(frames: Record<string, Frame>): Record<string, Transform> {
  const resolved: Record<string, Transform> = {};
  const inProgress = new Set<string>();

  const resolve = (id: string): Transform => {
    const cached = resolved[id];
    if (cached) return cached;

    const frame = frames[id];
    if (!frame) return IDENTITY_TRANSFORM;

    // Cycle guard: bail to identity instead of blowing the stack.
    if (inProgress.has(id)) return IDENTITY_TRANSFORM;
    inProgress.add(id);

    const localQ = toThreeQuat(frame.localQuaternion);
    const localP = toThreeVec(frame.localPosition);

    let out: Transform;
    if (frame.parentId === null || !frames[frame.parentId]) {
      out = {
        position: localP.toArray() as Vec3,
        quaternion: localQ.toArray() as Quat,
      };
    } else {
      const parent = resolve(frame.parentId);
      const parentQ = toThreeQuat(parent.quaternion);
      // Child origin: parent origin + parent rotation applied to the local offset.
      const position = localP.clone().applyQuaternion(parentQ).add(toThreeVec(parent.position));
      // Rotations compose parent-first.
      const quaternion = parentQ.clone().multiply(localQ);
      out = {
        position: position.toArray() as Vec3,
        quaternion: quaternion.toArray() as Quat,
      };
    }

    inProgress.delete(id);
    resolved[id] = out;
    return out;
  };

  for (const id of Object.keys(frames)) resolve(id);
  return resolved;
}

/** The chain of ancestor ids for a frame, nearest parent first. */
export function ancestorsOf(frames: Record<string, Frame>, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let current = frames[id]?.parentId ?? null;
  while (current && frames[current] && !seen.has(current)) {
    out.push(current);
    seen.add(current);
    current = frames[current]?.parentId ?? null;
  }
  return out;
}

/**
 * Whether re-parenting `id` under `newParentId` would create a loop.
 *
 * Used to disable ineligible options in the parent picker, rather than letting the user
 * pick one and then failing.
 */
export function wouldCreateCycle(
  frames: Record<string, Frame>,
  id: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === id) return true;
  return ancestorsOf(frames, newParentId).includes(id);
}

// ---------------------------------------------------------------------------
// Frame-to-frame comparison
// ---------------------------------------------------------------------------

/**
 * The transform of frame B as seen from frame A.
 *
 * The returned quaternion has two equivalent readings, and the UI names both because
 * mixing them up is the classic source of inverted-rotation bugs:
 *   - the orientation of B's axes expressed in A's axes;
 *   - the operator that maps a vector's B-coordinates to its A-coordinates
 *     (v_A = q_AB * v_B).
 *
 * The position is B's origin expressed in A's coordinates.
 */
export function relativeTransform(a: Transform, b: Transform): Transform {
  const qA = toThreeQuat(a.quaternion);
  const qB = toThreeQuat(b.quaternion);
  const qAinv = qA.clone().invert();

  const quaternion = qAinv.clone().multiply(qB);
  const position = toThreeVec(b.position).sub(toThreeVec(a.position)).applyQuaternion(qAinv);

  return {
    position: position.toArray() as Vec3,
    quaternion: quaternion.toArray() as Quat,
  };
}

// ---------------------------------------------------------------------------
// Alternative representations
// ---------------------------------------------------------------------------

export type AxisAngle = {
  /** Unit rotation axis. Defaults to +X for the identity rotation, where it is undefined. */
  axis: Vec3;
  /** Rotation about that axis, in the display unit, always in [0, 180deg]. */
  angle: number;
};

/**
 * Axis-angle form.
 *
 * The angle comes from THREE.Quaternion.angleTo against the identity, which is clamped
 * and returns the short way round; that pairs correctly with the w >= 0 canonical form.
 */
export function axisAngleOf(q: Quat, unit: AngleUnit): AxisAngle {
  const canonical = canonicalizeQuat(q);
  const quat = toThreeQuat(canonical);
  const angle = new THREE.Quaternion().angleTo(quat);

  const vector = new THREE.Vector3(canonical[0], canonical[1], canonical[2]);
  const axis: Vec3 =
    vector.lengthSq() < 1e-20 ? [1, 0, 0] : (vector.normalize().toArray() as Vec3);

  return { axis, angle: toDisplayAngle(angle, unit) };
}

/**
 * The 3x3 rotation matrix (direction cosine matrix) as rows.
 *
 * THREE.Matrix4 stores column-major, so element [row][col] is elements[col * 4 + row].
 */
export function rotationMatrixOf(q: Quat): number[][] {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(toThreeQuat(q));
  const e = m.elements;
  return [0, 1, 2].map((row) => [0, 1, 2].map((col) => e[col * 4 + row] ?? 0));
}

/**
 * Whether two quaternions represent the same rotation, within a tolerance.
 *
 * Compares components with the sign aligned by the dot product rather than going through
 * an angle: acos is ill-conditioned near zero, which is exactly the regime this is used
 * in. q and -q are the same rotation, hence the sign alignment.
 */
export function quatsApproxEqual(a: Quat, b: Quat, epsilon = 1e-9): boolean {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = dot < 0 ? -1 : 1;
  return a.every((component, i) => Math.abs(component - sign * b[i]!) <= epsilon);
}

/** Rotate a vector by a quaternion: v' = q * v. */
export function applyQuat(v: Vec3, q: Quat): Vec3 {
  return toThreeVec(v).applyQuaternion(toThreeQuat(q)).toArray() as Vec3;
}
