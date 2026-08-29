import { useMemo } from 'react';
import * as THREE from 'three';
import type { AxisName } from '../math/conventions';
import { AXIS_COLORS } from '../theme';
import { Arrow } from './Arrow';

/** Unit direction of each axis, in engineering coordinates. */
const AXIS_DIRECTION: Record<AxisName, THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

type Props = {
  axis: AxisName;
  length: number;
  /** Overrides the axis colour — used to tint a whole frame in its own colour. */
  color?: string;
  opacity?: number;
  radiusScale?: number;
};

/**
 * One coordinate axis, drawn with the same arrow as scene vectors.
 *
 * The direction is expressed in engineering coordinates; the scene's mount group handles
 * the up-axis convention, so nothing here needs to know about it.
 */
export function AxisArrow({ axis, length, color, opacity = 1, radiusScale = 1 }: Props) {
  const direction = useMemo(() => AXIS_DIRECTION[axis].clone(), [axis]);

  return (
    <Arrow
      direction={direction}
      length={length}
      color={color ?? AXIS_COLORS[axis]}
      opacity={opacity}
      radiusScale={radiusScale}
    />
  );
}
