import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ancestorsOf,
  applyQuat,
  axisAngleOf,
  canonicalizeQuat,
  normalizeQuat,
  relativeTransform,
  resolveWorldTransforms,
  rotationMatrixOf,
  toThreeQuat,
  wouldCreateCycle,
} from './transforms';
import { DEFAULT_CONVENTIONS, quatFromEuler } from './conventions';
import { expectSameRotation } from './testUtils';
import type { Frame, Quat, Vec3 } from '../types';

const c = DEFAULT_CONVENTIONS;
const yaw = (degrees: number): Quat => quatFromEuler([0, 0, degrees], c);

const frame = (over: Partial<Frame> & { id: string }): Frame => ({
  name: over.id,
  parentId: null,
  localPosition: [0, 0, 0],
  localQuaternion: [0, 0, 0, 1],
  color: '#ffffff',
  visible: true,
  ...over,
});

const index = (frames: Frame[]): Record<string, Frame> =>
  Object.fromEntries(frames.map((f) => [f.id, f]));

const closeTo = (actual: Vec3, expected: Vec3, digits = 10) =>
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, digits));

describe('canonicalizeQuat', () => {
  it('pins the sign to the w >= 0 hemisphere without changing the rotation', () => {
    const q: Quat = [0.5, 0.5, 0.5, -0.5];
    const canonical = canonicalizeQuat(q);
    expect(canonical[3]).toBeGreaterThanOrEqual(0);
    expectSameRotation(canonical, q);
  });

  it('leaves an already-canonical quaternion alone', () => {
    expect(canonicalizeQuat([0, 0, 0, 1])).toEqual([0, 0, 0, 1]);
  });
});

describe('normalizeQuat', () => {
  it('normalises user-entered components without changing their rotation', () => {
    const normalized = normalizeQuat([0, 0, 2, 2]);
    expect(normalized).not.toBeNull();
    expect(normalized?.[2]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(normalized?.[3]).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('rejects the all-zero quaternion', () => {
    expect(normalizeQuat([0, 0, 0, 0])).toBeNull();
  });
});

describe('resolveWorldTransforms', () => {
  it('composes rotations down a chain', () => {
    const frames = index([
      frame({ id: 'global' }),
      frame({ id: 'a', parentId: 'global', localQuaternion: yaw(90) }),
      frame({ id: 'b', parentId: 'a', localQuaternion: yaw(90) }),
    ]);

    const world = resolveWorldTransforms(frames);
    // 90 + 90 about the same axis is a 180 deg turn.
    expectSameRotation(world.b!.quaternion, yaw(180));
  });

  it('carries the parent rotation into the child offset', () => {
    const frames = index([
      frame({ id: 'global' }),
      frame({ id: 'a', parentId: 'global', localQuaternion: yaw(90), localPosition: [1, 0, 0] }),
      frame({ id: 'b', parentId: 'a', localPosition: [1, 0, 0] }),
    ]);

    const world = resolveWorldTransforms(frames);
    closeTo(world.a!.position, [1, 0, 0]);
    // A's X axis points along global +Y after a 90 deg yaw, so B lands at (1, 1, 0).
    closeTo(world.b!.position, [1, 1, 0]);
  });

  it('treats a frame with a missing parent as a root instead of throwing', () => {
    const frames = index([frame({ id: 'orphan', parentId: 'ghost', localPosition: [2, 3, 4] })]);
    const world = resolveWorldTransforms(frames);
    closeTo(world.orphan!.position, [2, 3, 4]);
  });

  it('survives a corrupt parent cycle rather than recursing forever', () => {
    const frames = index([
      frame({ id: 'a', parentId: 'b' }),
      frame({ id: 'b', parentId: 'a' }),
    ]);
    expect(() => resolveWorldTransforms(frames)).not.toThrow();
    expect(Object.keys(resolveWorldTransforms(frames)).sort()).toEqual(['a', 'b']);
  });

  it('resolves deep chains consistently regardless of key order', () => {
    const deep = [frame({ id: 'global' })];
    for (let i = 0; i < 12; i++) {
      deep.push(
        frame({
          id: `f${i}`,
          parentId: i === 0 ? 'global' : `f${i - 1}`,
          localQuaternion: yaw(10),
        }),
      );
    }
    const forward = resolveWorldTransforms(index(deep));
    const reversed = resolveWorldTransforms(index([...deep].reverse()));
    expectSameRotation(forward.f11!.quaternion, yaw(120), 10);
    expectSameRotation(forward.f11!.quaternion, reversed.f11!.quaternion);
  });
});

describe('cycle guarding', () => {
  const frames = index([
    frame({ id: 'global' }),
    frame({ id: 'a', parentId: 'global' }),
    frame({ id: 'b', parentId: 'a' }),
    frame({ id: 'c', parentId: 'b' }),
  ]);

  it('lists ancestors nearest-first', () => {
    expect(ancestorsOf(frames, 'c')).toEqual(['b', 'a', 'global']);
  });

  it('rejects re-parenting a frame under itself or its own descendant', () => {
    expect(wouldCreateCycle(frames, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(frames, 'a', 'c')).toBe(true);
    expect(wouldCreateCycle(frames, 'a', 'b')).toBe(true);
  });

  it('allows re-parenting upward or to the root', () => {
    expect(wouldCreateCycle(frames, 'c', 'global')).toBe(false);
    expect(wouldCreateCycle(frames, 'c', null)).toBe(false);
    expect(wouldCreateCycle(frames, 'b', 'global')).toBe(false);
  });
});

describe('relativeTransform', () => {
  it('satisfies qA * q_AB == qB', () => {
    const a = { position: [1, 2, 3] as Vec3, quaternion: quatFromEuler([15, 25, 35], c) };
    const b = { position: [-4, 0, 2] as Vec3, quaternion: quatFromEuler([-40, 5, 80], c) };

    const rel = relativeTransform(a, b);
    const composed = toThreeQuat(a.quaternion).multiply(toThreeQuat(rel.quaternion));
    expectSameRotation(composed.toArray() as Quat, b.quaternion);
  });

  it('expresses B’s origin in A’s coordinates', () => {
    // A sits at (1,0,0) yawed 90 deg; B sits at (1,1,0) unrotated.
    const a = { position: [1, 0, 0] as Vec3, quaternion: yaw(90) };
    const b = { position: [1, 1, 0] as Vec3, quaternion: [0, 0, 0, 1] as Quat };

    const rel = relativeTransform(a, b);
    // The global offset (0,1,0) lies along A's own +X after the yaw.
    closeTo(rel.position, [1, 0, 0]);
  });

  it('maps a vector from B coordinates into A coordinates', () => {
    const a = { position: [0, 0, 0] as Vec3, quaternion: yaw(30) };
    const b = { position: [0, 0, 0] as Vec3, quaternion: yaw(90) };
    const rel = relativeTransform(a, b);

    // B's +X, seen from A, must be 60 deg round from A's +X.
    const bXinA = applyQuat([1, 0, 0], rel.quaternion);
    closeTo(bXinA, [Math.cos(THREE.MathUtils.degToRad(60)), Math.sin(THREE.MathUtils.degToRad(60)), 0]);
  });

  it('is identity between a frame and itself', () => {
    const a = { position: [3, -2, 7] as Vec3, quaternion: quatFromEuler([12, 34, 56], c) };
    const rel = relativeTransform(a, a);
    closeTo(rel.position, [0, 0, 0]);
    expectSameRotation(rel.quaternion, [0, 0, 0, 1]);
  });

  it('inverts when the two frames are swapped', () => {
    const a = { position: [1, 2, 3] as Vec3, quaternion: quatFromEuler([15, 25, 35], c) };
    const b = { position: [-4, 0, 2] as Vec3, quaternion: quatFromEuler([-40, 5, 80], c) };

    const ab = relativeTransform(a, b).quaternion;
    const ba = relativeTransform(b, a).quaternion;
    const product = toThreeQuat(ab).multiply(toThreeQuat(ba));
    expectSameRotation(product.toArray() as Quat, [0, 0, 0, 1]);
  });
});

describe('axisAngleOf', () => {
  it('reads a 90 deg yaw as 90 deg about +Z', () => {
    const { axis, angle } = axisAngleOf(yaw(90), 'deg');
    expect(angle).toBeCloseTo(90, 8);
    closeTo(axis, [0, 0, 1], 8);
  });

  it('reports zero rotation with a defined fallback axis', () => {
    const { axis, angle } = axisAngleOf([0, 0, 0, 1], 'deg');
    expect(angle).toBeCloseTo(0, 12);
    expect(axis).toEqual([1, 0, 0]);
  });

  it('always takes the short way round, past a half turn', () => {
    const { axis, angle } = axisAngleOf(yaw(270), 'deg');
    expect(angle).toBeCloseTo(90, 8);
    closeTo(axis, [0, 0, -1], 8); // ...in the opposite sense
  });

  it('reconstructs the original rotation', () => {
    const q = quatFromEuler([23, -47, 111], c);
    const { axis, angle } = axisAngleOf(q, 'rad');
    const rebuilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), angle);
    expectSameRotation(rebuilt.toArray() as Quat, q, 8);
  });

  it('honours the radian unit', () => {
    expect(axisAngleOf(yaw(180), 'rad').angle).toBeCloseTo(Math.PI, 8);
  });
});

describe('rotationMatrixOf', () => {
  it('returns rows, with columns holding the rotated basis vectors', () => {
    const m = rotationMatrixOf(yaw(90));
    // First column is where +X lands: global +Y.
    closeTo([m[0]![0]!, m[1]![0]!, m[2]![0]!], [0, 1, 0]);
    // Second column is where +Y lands: global -X.
    closeTo([m[0]![1]!, m[1]![1]!, m[2]![1]!], [-1, 0, 0]);
    closeTo([m[0]![2]!, m[1]![2]!, m[2]![2]!], [0, 0, 1]);
  });

  it('is orthonormal with determinant +1', () => {
    const m = rotationMatrixOf(quatFromEuler([31, -12, 88], c));
    const rows = m.map((r) => new THREE.Vector3(r[0]!, r[1]!, r[2]!));
    rows.forEach((r) => expect(r.length()).toBeCloseTo(1, 10));
    expect(rows[0]!.dot(rows[1]!)).toBeCloseTo(0, 10);

    const det =
      m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
      m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
      m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
    expect(det).toBeCloseTo(1, 10);
  });

  it('agrees with applying the quaternion directly', () => {
    const q = quatFromEuler([31, -12, 88], c);
    const m = rotationMatrixOf(q);
    const v: Vec3 = [0.3, -0.7, 0.2];
    const viaMatrix = m.map((row) => row[0]! * v[0] + row[1]! * v[1] + row[2]! * v[2]) as Vec3;
    closeTo(viaMatrix, applyQuat(v, q));
  });
});
