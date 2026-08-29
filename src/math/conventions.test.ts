import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_CONVENTIONS,
  EULER_ORDERS,
  describeSequence,
  eulerFromQuat,
  eulerSequence,
  gimbalAxisOf,
  isNearGimbalLock,
  mountQuaternion,
  quatFromEuler,
  threeOrderFor,
} from './conventions';
import { canonicalizeQuat } from './transforms';
import { expectSameRotation } from './testUtils';
import type { Conventions, EulerOrder, Quat, RotationMode, Vec3 } from '../types';

const deg = (d: number) => THREE.MathUtils.degToRad(d);

const conventions = (over: Partial<Conventions> = {}): Conventions => ({
  ...DEFAULT_CONVENTIONS,
  ...over,
});

const MODES: RotationMode[] = ['intrinsic', 'extrinsic'];

describe('mountQuaternion', () => {
  it('is identity for Y-up, leaving three.js native coordinates alone', () => {
    const q = mountQuaternion('Y');
    expect(q.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 12);
  });

  it('maps engineering Z-up onto three.js Y-up, preserving handedness', () => {
    const q = mountQuaternion('Z');
    const map = (v: Vec3) =>
      new THREE.Vector3(...v)
        .applyQuaternion(q)
        .toArray()
        .map((n) => Number(n.toFixed(10)));

    expect(map([1, 0, 0])).toEqual([1, 0, 0]); // eng X stays put
    expect(map([0, 1, 0])).toEqual([0, 0, -1]); // eng Y goes into the screen
    expect(map([0, 0, 1])).toEqual([0, 1, 0]); // eng Z becomes screen-up

    // Right-handedness survives: X cross Y must still be Z, after mapping.
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(x.cross(y).distanceTo(z)).toBeCloseTo(0, 12);
  });
});

describe('threeOrderFor', () => {
  it('passes intrinsic orders through unchanged', () => {
    for (const order of EULER_ORDERS) {
      expect(threeOrderFor(order, 'intrinsic')).toBe(order);
    }
  });

  it.each(EULER_ORDERS)(
    'realises extrinsic %s as the equivalent fixed-axis composition',
    (order) => {
      // Extrinsic order ABC means: rotate about world A, then world B, then world C,
      // which composes as R = Rc * Rb * Ra.
      const angles: Record<string, number> = { X: deg(13), Y: deg(-27), Z: deg(61) };
      const rot = (axis: string) => {
        const m = new THREE.Matrix4();
        if (axis === 'X') return m.makeRotationX(angles[axis]!);
        if (axis === 'Y') return m.makeRotationY(angles[axis]!);
        return m.makeRotationZ(angles[axis]!);
      };
      const [a, b, c] = [...order] as [string, string, string];
      const expected = new THREE.Matrix4().multiplyMatrices(
        rot(c),
        new THREE.Matrix4().multiplyMatrices(rot(b), rot(a)),
      );

      const actual = new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(angles.X!, angles.Y!, angles.Z!, threeOrderFor(order, 'extrinsic')),
      );

      actual.elements.forEach((v, i) => expect(v).toBeCloseTo(expected.elements[i]!, 12));
    },
  );
});

describe('aerospace convention', () => {
  it('intrinsic ZYX composes as Rz(yaw) * Ry(pitch) * Rx(roll)', () => {
    const [roll, pitch, yaw] = [deg(10), deg(20), deg(30)];
    const actual = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(roll, pitch, yaw, threeOrderFor('ZYX', 'intrinsic')),
    );
    const expected = new THREE.Matrix4().multiplyMatrices(
      new THREE.Matrix4().makeRotationZ(yaw),
      new THREE.Matrix4().multiplyMatrices(
        new THREE.Matrix4().makeRotationY(pitch),
        new THREE.Matrix4().makeRotationX(roll),
      ),
    );
    actual.elements.forEach((v, i) => expect(v).toBeCloseTo(expected.elements[i]!, 12));
  });

  it('gives the textbook quaternion for a 90 deg yaw', () => {
    const q = canonicalizeQuat(quatFromEuler([0, 0, 90], conventions()));
    // (w, x, y, z) = (0.7071, 0, 0, 0.7071)
    expect(q[0]).toBeCloseTo(0, 10);
    expect(q[1]).toBeCloseTo(0, 10);
    expect(q[2]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('labels the intrinsic ZYX sequence as yaw-pitch-roll, in application order', () => {
    const slots = eulerSequence(conventions({ eulerOrder: 'ZYX', rotationMode: 'intrinsic' }));
    expect(slots.map((s) => s.axis)).toEqual(['Z', 'Y', 'X']);
    expect(slots.map((s) => s.alias)).toEqual(['yaw', 'pitch', 'roll']);
    expect(slots.map((s) => s.index)).toEqual([2, 1, 0]);
    expect(describeSequence(conventions())).toBe('intrinsic Z-Y-X (yaw-pitch-roll)');
  });

  it('does not claim aerospace names for other sequences', () => {
    const slots = eulerSequence(conventions({ eulerOrder: 'XYZ' }));
    expect(slots.every((s) => s.alias === undefined)).toBe(true);
    expect(describeSequence(conventions({ eulerOrder: 'XYZ' }))).toBe('intrinsic X-Y-Z');
  });
});

describe('quaternion <-> Euler round trips', () => {
  const samples: Vec3[] = [
    [0, 0, 0],
    [10, 20, 30],
    [-45, 15, 170],
    [179, -89, -179],
    [0.5, -0.25, 0.75],
  ];

  for (const order of EULER_ORDERS) {
    for (const mode of MODES) {
      it(`round-trips through ${mode} ${order}`, () => {
        const c = conventions({ eulerOrder: order, rotationMode: mode });
        for (const angles of samples) {
          const q = quatFromEuler(angles, c);
          const back = eulerFromQuat(q, c);
          // Compare rotations, not angle triples: away from gimbal lock these agree,
          // but the rotation is what actually has to survive the trip.
          expectSameRotation(quatFromEuler(back, c), q);
        }
      });
    }
  }

  it('respects the radian unit', () => {
    const c = conventions({ angleUnit: 'rad' });
    const q = quatFromEuler([0, 0, Math.PI / 2], c);
    expectSameRotation(q, quatFromEuler([0, 0, 90], conventions()));
    expect(eulerFromQuat(q, c)[2]).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe('gimbal lock', () => {
  it('locks on the middle axis of the sequence, in either mode', () => {
    for (const order of EULER_ORDERS) {
      expect(gimbalAxisOf(order)).toBe(order[1]);
      // Reversing for extrinsic mode leaves the middle character alone.
      expect(gimbalAxisOf(threeOrderFor(order, 'extrinsic') as EulerOrder)).toBe(order[1]);
    }
  });

  it('flags pitch = 90 for the aerospace sequence', () => {
    const c = conventions();
    expect(isNearGimbalLock(quatFromEuler([10, 90, 30], c), c)).toBe(true);
    expect(isNearGimbalLock(quatFromEuler([10, -90, 30], c), c)).toBe(true);
    expect(isNearGimbalLock(quatFromEuler([10, 40, 30], c), c)).toBe(false);
  });

  it('keeps the rotation exact even where the angle triple is not unique', () => {
    const c = conventions();
    const q = quatFromEuler([10, 90, 30], c);
    const back = eulerFromQuat(q, c);

    // The triple genuinely changes: (10, 90, 30) re-projects to (0, 90, 20).
    // Loose tolerance on purpose: extracting angles at lock is ill-conditioned, which
    // is the whole point of the warning.
    expect(back[0]).toBeCloseTo(0, 4);
    expect(back[1]).toBeCloseTo(90, 4);
    expect(back[2]).toBeCloseTo(20, 4);

    // But it is the same rotation, which is exactly why the quaternion readout matters.
    // Only to 7 digits: the extraction at lock is ill-conditioned, so the trip out and
    // back costs real precision (~5e-9 here, against ~1e-16 away from lock). The
    // quaternion itself never had that problem.
    expectSameRotation(quatFromEuler(back, c), q, 7);
  });
});

describe('convention independence', () => {
  it('reads one stored rotation differently without changing it', () => {
    const stored: Quat = quatFromEuler([10, 20, 30], conventions());

    const asZyx = eulerFromQuat(stored, conventions({ eulerOrder: 'ZYX' }));
    const asXyz = eulerFromQuat(stored, conventions({ eulerOrder: 'XYZ' }));
    expect(asZyx).not.toEqual(asXyz);

    // Each reading reconstructs the identical rotation under its own convention.
    for (const order of EULER_ORDERS) {
      for (const mode of MODES) {
        const c = conventions({ eulerOrder: order, rotationMode: mode });
        expectSameRotation(quatFromEuler(eulerFromQuat(stored, c), c), stored);
      }
    }
  });
});
