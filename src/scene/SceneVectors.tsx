import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { useSceneStore } from '../store/useSceneStore';
import { IDENTITY_TRANSFORM, applyQuat, resolveWorldTransforms } from '../math/transforms';
import { magnitudeOf } from '../math/vectors';
import { Arrow } from './Arrow';
import { Label } from './Label';

/**
 * Scene vectors, drawn so the two kinds are distinguishable at a glance.
 *
 *  - A **direction** is an arrow from its frame's origin. A free vector has no location,
 *    so drawing it at the origin is a convention — but a convention that reads correctly,
 *    since rotating the frame visibly swings the arrow.
 *  - A **point** is a marker at its location, with a faint leader line back to the frame
 *    it is defined in, so what its numbers are relative to stays visible.
 */
function VectorGizmo({ id }: { id: string }) {
  const vector = useSceneStore((s) => s.vectors[id]);
  const frames = useSceneStore((s) => s.frames);
  const selectedVectorId = useSceneStore((s) => s.selectedVectorId);
  const selectVector = useSceneStore((s) => s.selectVector);

  const upAxis = useSceneStore((s) => s.conventions.upAxis);
  const world = useMemo(() => resolveWorldTransforms(frames), [frames]);

  const geometry = useMemo(() => {
    if (!vector) return null;
    const frame = world[vector.frameId] ?? IDENTITY_TRANSFORM;
    const origin = new THREE.Vector3(...frame.position);
    // Both kinds rotate by the frame; only a point also carries the frame's origin, which
    // is already what `origin` is here.
    const offset = new THREE.Vector3(...applyQuat(vector.components, frame.quaternion));
    return { origin, offset, tip: origin.clone().add(offset) };
  }, [vector, world]);

  if (!vector || !geometry || !vector.visible) return null;

  const selected = id === selectedVectorId;
  const length = magnitudeOf(vector.components);
  const opacity = selected ? 1 : 0.6;

  const onSelect = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    selectVector(id);
  };

  return (
    <group>
      {vector.kind === 'direction' ? (
        <group position={geometry.origin}>
          <Arrow
            direction={geometry.offset}
            length={length}
            color={vector.color}
            opacity={opacity}
            radiusScale={selected ? 1.7 : 1.2}
          />
        </group>
      ) : (
        <>
          {/* Leader line back to the defining frame, so the point's reference stays visible.
              drei's Line owns its geometry and material across renders; building a
              THREE.Line inline would allocate a fresh pair on every frame. */}
          <Line
            points={[geometry.origin, geometry.tip]}
            color={vector.color}
            lineWidth={1.5}
            dashed
            dashSize={0.12}
            gapSize={0.09}
            transparent
            opacity={selected ? 0.55 : 0.3}
          />
          <mesh position={geometry.tip}>
            <sphereGeometry args={[selected ? 0.11 : 0.085, 20, 20]} />
            <meshStandardMaterial
              color={vector.color}
              emissive={vector.color}
              emissiveIntensity={selected ? 0.75 : 0.3}
              roughness={0.35}
            />
          </mesh>
        </>
      )}

      {/* Lift the label clear of the arrow tip along whichever axis is currently up.
          These are engineering coordinates — inside the mount group — so a hardcoded +Y
          would push the label into the screen rather than up it in Z-up mode. */}
      <Label
        text={vector.name}
        color={vector.color}
        position={
          upAxis === 'Z'
            ? [geometry.tip.x, geometry.tip.y, geometry.tip.z + 0.26]
            : [geometry.tip.x, geometry.tip.y + 0.26, geometry.tip.z]
        }
        scale={0.24}
        opacity={selected ? 0.95 : 0.62}
      />

      {/* Generous invisible hit target, same reasoning as frames: 8px is not tappable. */}
      <mesh position={geometry.tip} onClick={onSelect} visible={false}>
        <sphereGeometry args={[0.34, 12, 12]} />
      </mesh>
    </group>
  );
}

export function SceneVectors() {
  const vectorOrder = useSceneStore((s) => s.vectorOrder);
  return (
    <>
      {vectorOrder.map((id) => (
        <VectorGizmo key={id} id={id} />
      ))}
    </>
  );
}
