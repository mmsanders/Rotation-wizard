import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  angleBetween,
  degeneracyNote,
  directionCosines,
  magnitudeOf,
  unitOf,
  vectorInFrame,
} from './vectors';
import { DEFAULT_CONVENTIONS, quatFromEuler } from './conventions';
import { IDENTITY_TRANSFORM, type Transform } from './transforms';
import type { Quat, Vec3 } from '../types';

const c = DEFAULT_CONVENTIONS;
const yaw = (degrees: number): Quat => quatFromEuler([0, 0, degrees], c);

const at = (position: Vec3, quaternion: Quat = [0, 0, 0, 1]): Transform => ({
  position,
  quaternion,
});

const closeTo = (actual: Vec3, expected: Vec3, digits = 10) =>
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, digits));

describe('vectorInFrame', () => {
  /**
   * The property the whole direction/point distinction exists for. If these two ever
   * agree for an offset frame, the distinction has been lost somewhere.
   */
  it('treats a direction and a point differently when the frames are offset', () => {
    // A frame yawed 90 deg and moved to (2, 0, 0).
    const frame = at([2, 0, 0], yaw(90));
    const components: Vec3 = [1, 0, 0];

    const asPoint = vectorInFrame(components, 'point', frame, IDENTITY_TRANSFORM);
    const asDirection = vectorInFrame(components, 'direction', frame, IDENTITY_TRANSFORM);

    // The frame's +X points along global +Y after the yaw.
    closeTo(asDirection, [0, 1, 0]);
    // The point additionally carries the frame's origin.
    closeTo(asPoint, [2, 1, 0]);
    expect(asPoint).not.toEqual(asDirection);
  });

  it('agrees for both kinds when the frames share an origin', () => {
    // No translation to disagree about — which is exactly why the mistake hides.
    const frame = at([0, 0, 0], yaw(37));
    const components: Vec3 = [0.3, -1.2, 2];

    const asPoint = vectorInFrame(components, 'point', frame, IDENTITY_TRANSFORM);
    const asDirection = vectorInFrame(components, 'direction', frame, IDENTITY_TRANSFORM);
    closeTo(asPoint, asDirection);
  });

  it('keeps a direction’s magnitude invariant across frames', () => {
    const components: Vec3 = [1, -2, 0.5];
    const frames: Transform[] = [
      IDENTITY_TRANSFORM,
      at([5, -3, 2]),
      at([0, 0, 0], quatFromEuler([20, -45, 80], c)),
      at([-7, 1, 4], quatFromEuler([12, 33, -100], c)),
    ];

    for (const target of frames) {
      const converted = vectorInFrame(components, 'direction', frames[2]!, target);
      expect(magnitudeOf(converted)).toBeCloseTo(magnitudeOf(components), 10);
    }
  });

  it('does not keep a point’s magnitude invariant when origins differ', () => {
    const components: Vec3 = [1, 0, 0];
    const defining = at([10, 0, 0]);
    const converted = vectorInFrame(components, 'point', defining, IDENTITY_TRANSFORM);

    // Distance from the *global* origin, not from the defining frame's.
    expect(magnitudeOf(converted)).toBeCloseTo(11, 10);
    expect(magnitudeOf(converted)).not.toBeCloseTo(magnitudeOf(components), 3);
  });

  it('round-trips through another frame and back', () => {
    const a = at([1, 2, 3], quatFromEuler([15, 25, 35], c));
    const b = at([-4, 0, 2], quatFromEuler([-40, 5, 80], c));
    const components: Vec3 = [0.7, -1.4, 2.2];

    for (const kind of ['direction', 'point'] as const) {
      const inB = vectorInFrame(components, kind, a, b);
      const backInA = vectorInFrame(inB, kind, b, a);
      closeTo(backInA, components);
    }
  });

  it('is the identity when the defining and target frames are the same', () => {
    const frame = at([3, -2, 7], quatFromEuler([12, 34, 56], c));
    const components: Vec3 = [1, 2, 3];
    closeTo(vectorInFrame(components, 'point', frame, frame), components);
    closeTo(vectorInFrame(components, 'direction', frame, frame), components);
  });

  it('matches the textbook rigid transform for a point', () => {
    // p_target = q_target^-1 * (p_world - t_target), computed independently.
    const defining = at([2, 1, -1], quatFromEuler([10, 20, 30], c));
    const target = at([-3, 4, 0.5], quatFromEuler([-15, 60, 5], c));
    const components: Vec3 = [0.5, -2, 1.25];

    const world = new THREE.Vector3(...components)
      .applyQuaternion(new THREE.Quaternion(...defining.quaternion))
      .add(new THREE.Vector3(...defining.position));
    const expected = world
      .sub(new THREE.Vector3(...target.position))
      .applyQuaternion(new THREE.Quaternion(...target.quaternion).invert());

    closeTo(vectorInFrame(components, 'point', defining, target), expected.toArray() as Vec3);
  });
});

describe('magnitudeOf / unitOf', () => {
  it('measures length and normalises', () => {
    expect(magnitudeOf([3, 4, 0])).toBeCloseTo(5, 12);
    closeTo(unitOf([3, 4, 0])!, [0.6, 0.8, 0]);
  });

  it('returns null rather than NaN for a zero vector', () => {
    expect(unitOf([0, 0, 0])).toBeNull();
    expect(magnitudeOf([0, 0, 0])).toBe(0);
  });
});

describe('angleBetween', () => {
  it('reads perpendicular axes as 90 degrees about the third', () => {
    const { angle, axis, degeneracy } = angleBetween([1, 0, 0], [0, 1, 0], 'deg');
    expect(angle).toBeCloseTo(90, 8);
    closeTo(axis, [0, 0, 1], 8);
    expect(degeneracy).toBe('none');
  });

  it('ignores magnitude — only direction matters', () => {
    const short = angleBetween([1, 0, 0], [0, 1, 0], 'deg');
    const long = angleBetween([100, 0, 0], [0, 0.001, 0], 'deg');
    expect(long.angle).toBeCloseTo(short.angle, 8);
  });

  it('produces a rotation that actually carries the first vector onto the second', () => {
    const a: Vec3 = [0.3, -1.1, 2];
    const b: Vec3 = [-2, 0.4, 0.7];
    const { angle, axis } = angleBetween(a, b, 'rad');

    const rotated = new THREE.Vector3(...a)
      .normalize()
      .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), angle));
    closeTo(rotated.toArray() as Vec3, unitOf(b)!, 8);
  });

  it('gives the same answer for two directions whichever frame they are evaluated in', () => {
    const a: Vec3 = [1, 0.5, -0.25];
    const b: Vec3 = [-0.3, 2, 1];
    const source = at([4, -2, 6], quatFromEuler([25, -10, 70], c));
    const reference = angleBetween(a, b, 'deg').angle;

    // Rotation preserves angles, so re-expressing both in any other frame must not move it.
    for (const target of [IDENTITY_TRANSFORM, at([-8, 3, 1], quatFromEuler([5, 65, -20], c))]) {
      const aIn = vectorInFrame(a, 'direction', source, target);
      const bIn = vectorInFrame(b, 'direction', source, target);
      expect(angleBetween(aIn, bIn, 'deg').angle).toBeCloseTo(reference, 8);
    }
  });

  it('flags a zero-length vector instead of returning NaN', () => {
    const result = angleBetween([0, 0, 0], [1, 0, 0], 'deg');
    expect(result.degeneracy).toBe('zero-length');
    expect(Number.isFinite(result.angle)).toBe(true);
    expect(result.axis.every(Number.isFinite)).toBe(true);
    expect(degeneracyNote(result.degeneracy)).toMatch(/zero length/i);
  });

  it('flags parallel vectors, where the axis is undefined', () => {
    const result = angleBetween([1, 2, 3], [2, 4, 6], 'deg');
    expect(result.angle).toBeCloseTo(0, 6);
    expect(result.degeneracy).toBe('parallel');
    expect(result.axis.every(Number.isFinite)).toBe(true);
  });

  it('flags antiparallel vectors, where the axis is an arbitrary choice', () => {
    const result = angleBetween([1, 0, 0], [-1, 0, 0], 'deg');
    expect(result.angle).toBeCloseTo(180, 6);
    expect(result.degeneracy).toBe('antiparallel');
    // Whatever axis was picked must at least be a unit vector perpendicular to the pair.
    expect(magnitudeOf(result.axis)).toBeCloseTo(1, 8);
    expect(result.axis[0]).toBeCloseTo(0, 8);
    expect(degeneracyNote(result.degeneracy)).toMatch(/arbitrary/i);
  });

  it('says nothing when the answer is unambiguous', () => {
    expect(degeneracyNote('none')).toBeNull();
  });

  it('honours the radian unit', () => {
    expect(angleBetween([1, 0, 0], [0, 1, 0], 'rad').angle).toBeCloseTo(Math.PI / 2, 8);
  });
});

describe('directionCosines', () => {
  it('reads the angle to each axis', () => {
    const angles = directionCosines([1, 0, 0], 'deg')!;
    expect(angles[0]).toBeCloseTo(0, 8);
    expect(angles[1]).toBeCloseTo(90, 8);
    expect(angles[2]).toBeCloseTo(90, 8);
  });

  it('returns null for a zero vector', () => {
    expect(directionCosines([0, 0, 0], 'deg')).toBeNull();
  });
});
