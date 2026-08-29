import { useMemo } from 'react';
import * as THREE from 'three';
import type { AxisName } from '../math/conventions';
import { AXIS_COLORS } from '../theme';

/** Unit direction of each axis, in engineering coordinates. */
const AXIS_DIRECTION: Record<AxisName, THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

const UP = new THREE.Vector3(0, 1, 0);

type Props = {
  axis: AxisName;
  length: number;
  /** Overrides the axis colour — used to tint a whole frame in its own colour. */
  color?: string;
  opacity?: number;
  radiusScale?: number;
};

/**
 * A single arrow: cylinder shaft plus cone tip.
 *
 * Geometry is authored along +Y (three.js's native axis for cylinders and cones) and then
 * rotated onto the requested axis, so the mesh itself stays convention-agnostic — the
 * scene's mount group handles the up-axis question.
 */
export function AxisArrow({ axis, length, color, opacity = 1, radiusScale = 1 }: Props) {
  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(UP, AXIS_DIRECTION[axis]),
    [axis],
  );

  const headLength = Math.min(0.22 * length, 0.3);
  const shaftLength = length - headLength;
  const shaftRadius = 0.012 * radiusScale * Math.max(1, length);
  const headRadius = shaftRadius * 2.6;
  const tint = color ?? AXIS_COLORS[axis];
  const transparent = opacity < 1;

  return (
    <group quaternion={quaternion}>
      <mesh position={[0, shaftLength / 2, 0]}>
        <cylinderGeometry args={[shaftRadius, shaftRadius, shaftLength, 12]} />
        <meshStandardMaterial
          color={tint}
          transparent={transparent}
          opacity={opacity}
          roughness={0.45}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[0, shaftLength + headLength / 2, 0]}>
        <coneGeometry args={[headRadius, headLength, 16]} />
        <meshStandardMaterial
          color={tint}
          transparent={transparent}
          opacity={opacity}
          roughness={0.45}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
}
