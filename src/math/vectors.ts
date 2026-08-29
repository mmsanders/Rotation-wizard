import * as THREE from 'three';
import type { AngleUnit, Vec3, VectorKind } from '../types';
import { toDisplayAngle } from './conventions';
import { applyQuat, axisAngleOf, relativeTransform, type Transform } from './transforms';

/**
 * Vectors, and the distinction that makes them worth modelling explicitly.
 *
 * A vector's components transform between frames by one of two rules, and which one is
 * correct depends entirely on what the vector *represents*:
 *
 *   - a **direction** (velocity, a thrust axis, a body axis) only rotates. Its magnitude
 *     is the same in every frame.
 *   - a **point** (a located position) rotates *and* translates. Its magnitude — the
 *     distance from the frame's origin — generally differs between frames.
 *
 * Between frames that share an origin the two rules agree, which is exactly why the
 * mistake is easy to make and hard to notice: it only shows up once a translation is
 * involved. Nothing here infers the kind; it is carried on the vector and named in the UI.
 *
 * All the rotation work is delegated to `relativeTransform` and `applyQuat` from
 * ./transforms, which are already unit-tested.
 */

const EPSILON = 1e-12;

/**
 * A vector's components re-expressed in another frame.
 *
 * `relativeTransform(target, defining)` gives the pose of the defining frame as seen from
 * the target, so the whole conversion is: rotate by that relative rotation, then — for a
 * point only — add the relative offset. The point/direction distinction really is just
 * "is the translation included", which is what makes it safe to reason about.
 */
export function vectorInFrame(
  components: Vec3,
  kind: VectorKind,
  definingFrame: Transform,
  targetFrame: Transform,
): Vec3 {
  const relative = relativeTransform(targetFrame, definingFrame);
  const rotated = applyQuat(components, relative.quaternion);
  if (kind === 'direction') return rotated;
  return [
    rotated[0] + relative.position[0],
    rotated[1] + relative.position[1],
    rotated[2] + relative.position[2],
  ];
}

/** Length of a vector. For a point this is its distance from its frame's origin. */
export function magnitudeOf(components: Vec3): number {
  return Math.hypot(components[0], components[1], components[2]);
}

/** Unit vector, or null when there is no direction to recover. */
export function unitOf(components: Vec3): Vec3 | null {
  const length = magnitudeOf(components);
  if (length < EPSILON) return null;
  return [components[0] / length, components[1] / length, components[2] / length];
}

/**
 * Why a pair of vectors does not determine a unique rotation between them.
 *
 * Surfaced rather than swallowed, because in each of these cases some part of the answer
 * is arbitrary and presenting it as *the* answer would be a lie.
 */
export type AnglePairDegeneracy = 'none' | 'zero-length' | 'parallel' | 'antiparallel';

export type VectorPairAngle = {
  /** Angle between the two vectors, in the display unit, always within [0, 180deg]. */
  angle: number;
  /** Unit axis of the rotation carrying the first vector onto the second. */
  axis: Vec3;
  degeneracy: AnglePairDegeneracy;
};

/**
 * The angle between two vectors, and the rotation that carries the first onto the second.
 *
 * Built on `THREE.Quaternion.setFromUnitVectors` plus the existing `axisAngleOf`, so the
 * angle and the axis always describe the same rotation rather than being computed by two
 * independent routes that could disagree.
 *
 * Note for callers: this is a pure function of the two component triples, so they must
 * already be expressed in a *common* frame. For two directions the answer is the same
 * whichever frame that is; once a point is involved it is not, which is the caller's job
 * to make clear.
 */
export function angleBetween(a: Vec3, b: Vec3, unit: AngleUnit): VectorPairAngle {
  const unitA = unitOf(a);
  const unitB = unitOf(b);

  // A zero-length vector points nowhere, so there is no angle to report.
  if (!unitA || !unitB) {
    return { angle: 0, axis: [1, 0, 0], degeneracy: 'zero-length' };
  }

  const vectorA = new THREE.Vector3(...unitA);
  const vectorB = new THREE.Vector3(...unitB);
  const dot = THREE.MathUtils.clamp(vectorA.dot(vectorB), -1, 1);

  const quaternion = new THREE.Quaternion().setFromUnitVectors(vectorA, vectorB);
  const { axis, angle } = axisAngleOf(quaternion.toArray() as [number, number, number, number], unit);

  let degeneracy: AnglePairDegeneracy = 'none';
  if (dot >= 1 - 1e-12) {
    // Already aligned: the rotation is the identity and its axis is undefined.
    degeneracy = 'parallel';
  } else if (dot <= -1 + 1e-12) {
    // Opposed: every axis perpendicular to the pair is an equally valid half turn, and
    // setFromUnitVectors just picks one. Flag it rather than presenting it as canonical.
    degeneracy = 'antiparallel';
  }

  return { angle, axis, degeneracy };
}

/** Human-readable note for a degenerate pair, or null when the answer is unambiguous. */
export function degeneracyNote(degeneracy: AnglePairDegeneracy): string | null {
  switch (degeneracy) {
    case 'zero-length':
      return 'One of these vectors has zero length, so there is no angle between them.';
    case 'parallel':
      return 'These vectors already point the same way — the rotation is the identity and its axis is undefined.';
    case 'antiparallel':
      return 'These vectors are exactly opposed. Every axis perpendicular to them is an equally valid half turn; the one shown is an arbitrary choice.';
    case 'none':
      return null;
  }
}

/** Convenience for readouts that want the angle a vector makes with each frame axis. */
export function directionCosines(components: Vec3, unit: AngleUnit): Vec3 | null {
  const direction = unitOf(components);
  if (!direction) return null;
  return [
    toDisplayAngle(Math.acos(THREE.MathUtils.clamp(direction[0], -1, 1)), unit),
    toDisplayAngle(Math.acos(THREE.MathUtils.clamp(direction[1], -1, 1)), unit),
    toDisplayAngle(Math.acos(THREE.MathUtils.clamp(direction[2], -1, 1)), unit),
  ];
}
