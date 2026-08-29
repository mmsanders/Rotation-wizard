# Rotation Wizard

A 3D calculator for coordinate frames, quaternions and Euler angles. Build a tree of
frames, each defined relative to another, and read the rotation between any two of them —
as a quaternion, Euler angles, axis-angle, or a rotation matrix.

Works on desktop and on a phone: the 3D view fills the screen, and the controls are a
drag-up sheet on mobile or a docked sidebar on a wide screen.

## Why the conventions are in the UI

Most rotation bugs are not arithmetic errors — they are convention errors. Two people can
compute different numbers from the same rotation and both be right, because they disagree
about which axis is up, what order Euler angles apply in, or which direction "the rotation
from A to B" points.

So none of that is hardcoded here:

- **Up axis** — Z-up (aerospace/robotics) or Y-up (graphics). Viewing only.
- **Euler sequence** — all six Tait-Bryan orders, applied **intrinsically** (about the
  new, already-rotated axes) or **extrinsically** (about the fixed world axes). Intrinsic
  Z-Y-X is labelled as the aerospace yaw-pitch-roll it is.
- **Angle units** — degrees or radians.

Two guarantees follow from how this is built:

1. **Changing a convention never changes the scene.** Frame data is stored
   convention-free, and conventions are applied only when reading and writing numbers.
   Switching up-axis or Euler order re-reads the same rotation; it never rewrites it.
2. **Direction is never ambiguous.** The comparison view names both readings of its
   quaternion — "the orientation of B's axes in A's axes" *and* "the operator mapping
   v<sub>B</sub> to v<sub>A</sub>" — because these are the same quaternion and confusing
   them is the classic source of inverted rotations.

The app also warns at gimbal lock, where the Euler triple stops being unique and the
quaternion is the only trustworthy readout.

All rotation maths is delegated to three.js's `Quaternion`, `Euler` and `Matrix4`. Nothing
is hand-rolled.

## Development

```bash
npm install
npm run dev          # dev server
npm run typecheck    # tsc
npm run lint         # eslint
npm test             # vitest — the maths and store layers
npm run test:e2e     # playwright smoke tests, desktop + phone viewports
npm run build        # production build
```

## Layout

```
src/
  math/       conventions (up axis, Euler order/mode) and transforms (frame tree,
              relative rotation, axis-angle, matrix) — pure functions, unit-tested
  store/      zustand scene state, persisted to localStorage, with repair on rehydrate
  scene/      react-three-fiber: canvas, mount group, axis arrows, sprite labels
  ui/         responsive panel: bottom sheet / sidebar, controls, readouts
```

The one structural idea worth knowing: a frame's position and orientation are stored in
plain "engineering" coordinates, and the up-axis convention is applied as a single **mount
quaternion** on the group wrapping the whole scene. The camera stays in three.js's native
Y-up space, which avoids the orbit-control breakage that comes from re-pointing
`camera.up`.

## Deployment

Pushes to `main` build and publish to GitHub Pages via `.github/workflows/deploy.yml`.

Enable it once, under **Settings → Pages → Source: GitHub Actions**.
