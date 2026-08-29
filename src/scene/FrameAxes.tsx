import { useMemo, useState, type JSX } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { AxisArrow } from './AxisArrow';
import { AXIS_COLORS } from '../theme';
import { Label } from './Label';
import type { AxisName } from '../math/conventions';
import type { Transform } from '../math/transforms';

const AXES: AxisName[] = ['X', 'Y', 'Z'];

const AXIS_TIP: Record<AxisName, (d: number) => [number, number, number]> = {
  X: (d) => [d, 0, 0],
  Y: (d) => [0, d, 0],
  Z: (d) => [0, 0, d],
};

type Props = {
  name: string;
  color: string;
  transform: Transform;
  selected: boolean;
  /** The global frame renders slightly larger and unhighlighted — it is the backdrop. */
  isGlobal?: boolean;
  onSelect: () => void;
};

/**
 * One coordinate frame: three labelled arrows at its world pose.
 *
 * The whole frame sits under the scene's mount group, so the transform here is in plain
 * engineering coordinates and needs no up-axis handling.
 */
export function FrameAxes({ name, color, transform, selected, isGlobal, onSelect }: Props): JSX.Element {
  const [hovered, setHovered] = useState(false);

  const position = useMemo(
    () => new THREE.Vector3(...transform.position),
    [transform.position],
  );
  const quaternion = useMemo(
    () =>
      new THREE.Quaternion(
        transform.quaternion[0],
        transform.quaternion[1],
        transform.quaternion[2],
        transform.quaternion[3],
      ),
    [transform.quaternion],
  );

  const length = isGlobal ? 1.5 : 1.1;
  const labelDistance = length + 0.18;
  // Unselected frames recede so the one you are editing reads clearly.
  const opacity = isGlobal ? 0.75 : selected ? 1 : 0.55;
  const radiusScale = selected && !isGlobal ? 1.5 : 1;

  const handleSelect = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  return (
    <group position={position} quaternion={quaternion}>
      {AXES.map((axis) => (
        <AxisArrow
          key={axis}
          axis={axis}
          length={length}
          opacity={opacity}
          radiusScale={radiusScale}
        />
      ))}

      {AXES.map((axis) => (
        <Label
          key={`label-${axis}`}
          text={axis}
          color={AXIS_COLORS[axis]}
          position={AXIS_TIP[axis](labelDistance)}
          scale={0.32}
          opacity={opacity}
        />
      ))}

      {/* Frame name, offset off-origin so it does not sit on top of the axis junction. */}
      <Label
        text={name}
        color={color}
        position={[-0.3, -0.3, 0.38]}
        scale={0.26}
        opacity={selected || isGlobal ? 0.95 : 0.6}
      />

      {/* Origin marker. */}
      <mesh>
        <sphereGeometry args={[selected ? 0.085 : 0.06, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.7 : 0.25}
          roughness={0.35}
        />
      </mesh>

      {/* A generous invisible hit target: tapping a 6px sphere on a phone is hopeless. */}
      <mesh
        onClick={handleSelect}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        visible={false}
      >
        <sphereGeometry args={[0.42, 12, 12]} />
      </mesh>

      {hovered && !selected && (
        <mesh>
          <sphereGeometry args={[0.16, 20, 20]} />
          <meshBasicMaterial color={color} transparent opacity={0.28} />
        </mesh>
      )}
    </group>
  );
}
