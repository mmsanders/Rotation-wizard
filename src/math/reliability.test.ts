import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Conventions, Quat, Vec3 } from '../types';
import { DEFAULT_CONVENTIONS, EULER_ORDERS, eulerFromQuat, quatFromEuler } from './conventions';
import { relativeTransform, rotationMatrixOf, toThreeQuat, type Transform } from './transforms';
import { vectorInFrame } from './vectors';

/**
 * A deterministic stress suite for the calculator's numerical invariants.
 *
 * The focused unit tests document individual examples. These seeded cases cover a much
 * wider part of the input space while remaining exactly reproducible when one fails.
 */
function random(seed = 0x5eed1234): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const rng = random();
const between = (min: number, max: number) => min + (max - min) * rng();
const randomVec = (): Vec3 => [between(-100, 100), between(-100, 100), between(-100, 100)];
const randomQuat = (): Quat => {
  // Shoemake's uniform sampling of unit quaternions, driven by the seeded generator.
  const u1 = rng();
  const u2 = rng();
  const u3 = rng();
  return [
    Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2),
    Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2),
    Math.sqrt(u1) * Math.sin(2 * Math.PI * u3),
    Math.sqrt(u1) * Math.cos(2 * Math.PI * u3),
  ];
};

const randomTransform = (): Transform => ({ position: randomVec(), quaternion: randomQuat() });

function expectVecClose(actual: Vec3, expected: Vec3, tolerance = 1e-9): void {
  for (let axis = 0; axis < 3; axis++) {
    expect(Math.abs(actual[axis]! - expected[axis]!)).toBeLessThan(tolerance);
  }
}

function expectSameRotation(actual: Quat, expected: Quat, tolerance = 1e-10): void {
  const a = toThreeQuat(actual).normalize().toArray();
  const b = toThreeQuat(expected).normalize().toArray();
  const sign = a.reduce((dot, value, index) => dot + value * b[index]!, 0) < 0 ? -1 : 1;
  a.forEach((value, index) => expect(Math.abs(value - sign * b[index]!)).toBeLessThan(tolerance));
}

describe('seeded numerical reliability battery', () => {
  it('round-trips 2,400 rotations through every Euler convention', () => {
    for (const order of EULER_ORDERS) {
      for (const rotationMode of ['intrinsic', 'extrinsic'] as const) {
        for (const angleUnit of ['deg', 'rad'] as const) {
          const conventions: Conventions = {
            ...DEFAULT_CONVENTIONS,
            eulerOrder: order,
            rotationMode,
            angleUnit,
          };
          for (let sample = 0; sample < 100; sample++) {
            const original = randomQuat();
            const rebuilt = quatFromEuler(eulerFromQuat(original, conventions), conventions);
            expectSameRotation(rebuilt, original, 5e-8);
          }
        }
      }
    }
  });

  it('keeps relative transforms invertible over 1,000 arbitrary poses', () => {
    for (let sample = 0; sample < 1_000; sample++) {
      const a = randomTransform();
      const b = randomTransform();
      const ab = relativeTransform(a, b);
      const ba = relativeTransform(b, a);

      expectSameRotation(
        toThreeQuat(ab.quaternion).multiply(toThreeQuat(ba.quaternion)).toArray() as Quat,
        [0, 0, 0, 1],
      );
      expectVecClose(vectorInFrame([0, 0, 0], 'point', b, a), ab.position, 1e-8);
    }
  });

  it('round-trips points and directions across 1,000 arbitrary frame pairs', () => {
    for (let sample = 0; sample < 1_000; sample++) {
      const defining = randomTransform();
      const target = randomTransform();
      const components = randomVec();

      for (const kind of ['direction', 'point'] as const) {
        const converted = vectorInFrame(components, kind, defining, target);
        const restored = vectorInFrame(converted, kind, target, defining);
        expectVecClose(restored, components, 1e-8);
      }
    }
  });

  it('produces orthonormal, right-handed matrices for 1,000 rotations', () => {
    for (let sample = 0; sample < 1_000; sample++) {
      const values = rotationMatrixOf(randomQuat()).flat();
      const matrix = new THREE.Matrix3().set(
        values[0]!, values[1]!, values[2]!,
        values[3]!, values[4]!, values[5]!,
        values[6]!, values[7]!, values[8]!,
      );
      const product = matrix.clone().transpose().multiply(matrix);
      product.elements.forEach((value, index) => {
        expect(value).toBeCloseTo(index % 4 === 0 ? 1 : 0, 10);
      });
      expect(matrix.determinant()).toBeCloseTo(1, 10);
    }
  });
});
