/** Canonical storage types. Everything here is convention-free: plain numbers in
 *  "engineering" coordinates. Up-axis and Euler conventions are applied only at the
 *  presentation boundary (see src/math/conventions.ts). */

export type Vec3 = [number, number, number];

/** Quaternion stored as [x, y, z, w] to match THREE.Quaternion.toArray(). */
export type Quat = [number, number, number, number];

export const GLOBAL_FRAME_ID = 'global';

export type Frame = {
  id: string;
  name: string;
  /** null only for the global frame, which is the root of the tree. */
  parentId: string | null;
  /** Translation from the parent's origin, expressed in the parent's axes. */
  localPosition: Vec3;
  /** Rotation from the parent's axes to this frame's axes. */
  localQuaternion: Quat;
  color: string;
  visible: boolean;
};

/** Which world axis points "up" on screen. Purely a viewing/labelling choice. */
export type UpAxis = 'Z' | 'Y';

/** The six Tait-Bryan sequences three.js supports. */
export type EulerOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';

/**
 * Intrinsic: each rotation is about the *new* (already-rotated) axes.
 * Extrinsic: each rotation is about the original *fixed* world axes.
 */
export type RotationMode = 'intrinsic' | 'extrinsic';

export type AngleUnit = 'deg' | 'rad';

export type Conventions = {
  upAxis: UpAxis;
  eulerOrder: EulerOrder;
  rotationMode: RotationMode;
  angleUnit: AngleUnit;
};

/**
 * What a vector's components represent, which decides how they transform between frames.
 *
 * A direction only rotates; a point rotates *and* translates. Between frames with
 * different origins the two rules give different answers, so this is never inferred — it
 * is stated per vector and named in every readout.
 */
export type VectorKind = 'direction' | 'point';

export type SceneVector = {
  id: string;
  name: string;
  /** The frame whose axes `components` are expressed in. */
  frameId: string;
  components: Vec3;
  kind: VectorKind;
  color: string;
  visible: boolean;
};
