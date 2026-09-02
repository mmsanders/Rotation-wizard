import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { DESKTOP_QUERY, useMediaQuery } from '../ui/useMediaQuery';
import { GLOBAL_FRAME_ID } from '../types';
import { useSceneStore } from '../store/useSceneStore';
import { mountQuaternion } from '../math/conventions';
import { resolveWorldTransforms } from '../math/transforms';
import { FrameAxes } from './FrameAxes';
import { GroundGrid } from './GroundGrid';
import { SceneVectors } from './SceneVectors';

/**
 * Redraw whenever scene state changes.
 *
 * The canvas runs `frameloop="demand"` so a phone is not burning battery re-rendering a
 * static scene at 60fps. That means anything which changes the scene has to ask for a
 * frame; React-driven changes do this via the reconciler, and this subscription covers
 * the rest.
 */
function InvalidateOnChange() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => useSceneStore.subscribe(() => invalidate()), [invalidate]);
  return null;
}

function Frames() {
  const frames = useSceneStore((s) => s.frames);
  const order = useSceneStore((s) => s.order);
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectFrame = useSceneStore((s) => s.selectFrame);

  // Derived, never stored: one source of truth per frame.
  const world = useMemo(() => resolveWorldTransforms(frames), [frames]);

  return (
    <>
      {order.map((id) => {
        const frame = frames[id];
        const transform = world[id];
        if (!frame || !transform || !frame.visible) return null;
        return (
          <FrameAxes
            key={id}
            name={frame.name}
            color={frame.color}
            transform={transform}
            selected={id === selectedId}
            isGlobal={id === GLOBAL_FRAME_ID}
            onSelect={() => selectFrame(id)}
          />
        );
      })}
    </>
  );
}

/**
 * Keep the scene clear of the control panel.
 *
 * On desktop the canvas is inset from the sidebar (see ui.css) and needs no help. On a
 * phone the sheet slides over the scene, so the orbit target is dropped below the origin
 * and the frames ride up into the visible strip above it.
 *
 * Applied through the ref rather than as a prop, so a re-render never yanks the target
 * back from wherever the user has panned it.
 */
function FrameForPanel({ targetY }: { targetY: number }) {
  const controls = useThree((state) => state.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;

  useEffect(() => {
    if (!controls) return;
    controls.target.set(0, targetY, 0);
    controls.update();
  }, [controls, targetY]);

  return null;
}

/** Return OrbitControls and the camera to the layout's deliberately framed starting pose. */
function ResetView({
  resetViewKey,
  cameraPosition,
  targetY,
}: {
  resetViewKey: number;
  cameraPosition: [number, number, number];
  targetY: number;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    // Zero is the initial render, not a reset request. FrameForPanel establishes the
    // initial target separately once OrbitControls is ready.
    if (resetViewKey === 0 || !controls) return;
    camera.position.set(...cameraPosition);
    controls.target.set(0, targetY, 0);
    controls.update();
    invalidate();
  }, [camera, cameraPosition, controls, invalidate, resetViewKey, targetY]);

  return null;
}

export function SceneCanvas({ resetViewKey = 0 }: { resetViewKey?: number }) {
  const upAxis = useSceneStore((s) => s.conventions.upAxis);
  const mount = useMemo(() => mountQuaternion(upAxis), [upAxis]);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // The sheet covers the lower half of a phone, so start further back and aim below the
  // origin, putting the frames in the strip that stays visible.
  const targetY = isDesktop ? 0 : -1.6;
  const cameraPosition = useMemo<[number, number, number]>(
    () => (isDesktop ? [6.2, 4.4, 7.5] : [7.8, 5.6, 9.6]),
    [isDesktop],
  );

  return (
    <Canvas
      // Capped device pixel ratio: 3x on a modern phone triples the fragment cost for
      // no visible gain on this kind of geometry.
      dpr={[1, 2]}
      frameloop="demand"
      // Read once, at canvas creation; useMediaQuery resolves synchronously so the very
      // first render already knows which layout it is in.
      camera={{ position: cameraPosition, fov: 45, near: 0.1, far: 300 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#0b0e14']} />
      <fog attach="fog" args={['#0b0e14', 26, 70]} />

      <ambientLight intensity={1.1} />
      <directionalLight position={[6, 10, 8]} intensity={1.5} />
      <directionalLight position={[-8, -4, -6]} intensity={0.5} />

      {/* Horizontal reference plane, in three.js space — see GroundGrid. */}
      <GroundGrid />

      {/* Everything with real coordinates lives under the mount, which is the single
          place the up-axis convention is applied. */}
      <group quaternion={mount}>
        <Frames />
        <SceneVectors />
      </group>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={1.2}
        maxDistance={60}
        // Keep the camera above the floor so the grid stays a floor, not a ceiling.
        maxPolarAngle={Math.PI * 0.495}
      />

      <FrameForPanel targetY={targetY} />
      <ResetView
        resetViewKey={resetViewKey}
        cameraPosition={cameraPosition}
        targetY={targetY}
      />
      <InvalidateOnChange />
    </Canvas>
  );
}
