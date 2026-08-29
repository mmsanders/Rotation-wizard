import { useMemo, useState } from 'react';
import { GLOBAL_FRAME_ID, type Vec3, type VectorKind } from '../types';
import { useSceneStore } from '../store/useSceneStore';
import { IDENTITY_TRANSFORM, resolveWorldTransforms } from '../math/transforms';
import { directionCosines, magnitudeOf, unitOf, vectorInFrame } from '../math/vectors';
import { AXIS_COLORS } from '../theme';
import { NumberField } from './NumberField';
import { Segmented } from './Segmented';
import { CopyableRow } from './CopyableRow';

const AXES = ['X', 'Y', 'Z'] as const;

const KIND_OPTIONS = [
  {
    value: 'direction' as VectorKind,
    label: 'Direction',
    title: 'Rotates between frames; magnitude is the same in every frame',
  },
  {
    value: 'point' as VectorKind,
    label: 'Point',
    title: 'Rotates and translates between frames; magnitude changes',
  },
];

/** Controls for the selected vector, plus what it reads as in any other frame. */
export function VectorControls() {
  const vectors = useSceneStore((s) => s.vectors);
  const frames = useSceneStore((s) => s.frames);
  const order = useSceneStore((s) => s.order);
  const selectedVectorId = useSceneStore((s) => s.selectedVectorId);
  const conventions = useSceneStore((s) => s.conventions);
  const renameVector = useSceneStore((s) => s.renameVector);
  const setVectorFrame = useSceneStore((s) => s.setVectorFrame);
  const setVectorComponents = useSceneStore((s) => s.setVectorComponents);
  const setVectorKind = useSceneStore((s) => s.setVectorKind);

  // Which frame the readout below is expressed in. Defaults to Global — the most common
  // question is "what is this in world coordinates?".
  const [readFrameId, setReadFrameId] = useState<string>(GLOBAL_FRAME_ID);

  const world = useMemo(() => resolveWorldTransforms(frames), [frames]);
  const vector = selectedVectorId ? vectors[selectedVectorId] : undefined;

  if (!vector) {
    return <p className="empty">No vector selected.</p>;
  }

  const ownFrame = frames[vector.frameId];
  const ownFrameName = ownFrame?.name ?? 'Global';
  const readFrame = frames[readFrameId] ? readFrameId : GLOBAL_FRAME_ID;
  const readFrameName = frames[readFrame]?.name ?? 'Global';

  const converted = vectorInFrame(
    vector.components,
    vector.kind,
    world[vector.frameId] ?? IDENTITY_TRANSFORM,
    world[readFrame] ?? IDENTITY_TRANSFORM,
  );

  const ownMagnitude = magnitudeOf(vector.components);
  const readMagnitude = magnitudeOf(converted);
  const unit = unitOf(converted);
  const cosines = directionCosines(converted, conventions.angleUnit);
  const angleUnit = conventions.angleUnit === 'deg' ? '°' : ' rad';
  const sameFrame = readFrame === vector.frameId;

  const setComponent = (index: number, value: number) => {
    const next: Vec3 = [...vector.components] as Vec3;
    next[index] = value;
    setVectorComponents(vector.id, next);
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card__head">
          <span className="card__dot" style={{ background: vector.color }} />
          <input
            className="card__name"
            value={vector.name}
            aria-label="Vector name"
            onChange={(e) => renameVector(vector.id, e.target.value)}
          />
        </div>

        <Segmented
          label="This vector is a"
          value={vector.kind}
          options={KIND_OPTIONS}
          onChange={(kind) => setVectorKind(vector.id, kind)}
        />
        <p className="hint">
          {vector.kind === 'direction' ? (
            <>
              A <strong>direction</strong> only rotates between frames, so its magnitude is
              the same everywhere. Drawn from {ownFrameName}&rsquo;s origin — a free vector
              has no location, so that placement is just a convention.
            </>
          ) : (
            <>
              A <strong>point</strong> rotates <em>and</em> translates between frames, so its
              components — and its distance from the origin — differ from frame to frame.
            </>
          )}
        </p>

        <label className="select">
          <span className="select__label">Components expressed in</span>
          <select
            value={vector.frameId}
            onChange={(e) => setVectorFrame(vector.id, e.target.value)}
          >
            {order.map((id) => (
              <option key={id} value={id}>
                {frames[id]?.name ?? id}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          Changing this keeps the vector where it is and rewrites the numbers to suit the new
          frame.
        </p>

        <h4 className="card__section">Components in {ownFrameName}</h4>
        {AXES.map((axis, i) => (
          <NumberField
            key={axis}
            label={axis}
            value={vector.components[i] ?? 0}
            onChange={(v) => setComponent(i, v)}
            min={-10}
            max={10}
            step={0.1}
            color={AXIS_COLORS[axis]}
          />
        ))}
        <p className="hint">
          Magnitude in {ownFrameName}: <strong>{ownMagnitude.toFixed(4)}</strong>
        </p>
      </section>

      <section className="card">
        <label className="select">
          <span className="select__label">Read this vector in</span>
          <select value={readFrame} onChange={(e) => setReadFrameId(e.target.value)}>
            {order.map((id) => (
              <option key={id} value={id}>
                {frames[id]?.name ?? id}
              </option>
            ))}
          </select>
        </label>

        <div className="readout__caption">
          {sameFrame ? (
            <>
              Same frame the components are stored in, so nothing is converted.
            </>
          ) : vector.kind === 'direction' ? (
            <>
              <span className="reading__tag">Rotation only</span> a direction carries no
              position, so only the rotation from <strong>{ownFrameName}</strong> to{' '}
              <strong>{readFrameName}</strong> is applied.
            </>
          ) : (
            <>
              <span className="reading__tag">Rotation + translation</span> a point is
              located, so the offset between <strong>{ownFrameName}</strong> and{' '}
              <strong>{readFrameName}</strong> is applied as well as the rotation.
            </>
          )}
        </div>

        <CopyableRow
          heading={`Components in ${readFrameName}`}
          values={AXES.map((axis, i) => ({
            name: axis,
            value: (converted[i] ?? 0).toFixed(4),
            color: AXIS_COLORS[axis],
          }))}
        />

        <CopyableRow
          heading="Magnitude and unit direction"
          values={[
            { name: '|v|', value: readMagnitude.toFixed(4) },
            ...AXES.map((axis, i) => ({
              name: `û${axis.toLowerCase()}`,
              value: unit ? (unit[i] ?? 0).toFixed(4) : '—',
              color: AXIS_COLORS[axis],
            })),
          ]}
        />
        <p className="readout__note">
          {vector.kind === 'direction'
            ? 'A direction’s magnitude is the same in every frame.'
            : 'For a point this is the distance from this frame’s origin, so it changes between frames.'}
        </p>

        {cosines && (
          <CopyableRow
            heading={`Angle to each ${readFrameName} axis`}
            values={AXES.map((axis, i) => ({
              name: axis,
              value: `${(cosines[i] ?? 0).toFixed(2)}${angleUnit}`,
              color: AXIS_COLORS[axis],
            }))}
          />
        )}
      </section>
    </div>
  );
}
