import { useMemo } from 'react';
import { useSceneStore } from '../store/useSceneStore';
import { IDENTITY_TRANSFORM, resolveWorldTransforms } from '../math/transforms';
import { angleBetween, degeneracyNote, vectorInFrame } from '../math/vectors';
import { AXIS_COLORS } from '../theme';
import { CopyableRow } from './CopyableRow';

/**
 * The angle between two vectors, and the rotation carrying one onto the other.
 *
 * Both vectors are converted into one chosen frame first, because that is the only way the
 * question is well posed. For two directions the answer is the same in every frame; the
 * moment a point is involved it is not, and the panel says which case you are in rather
 * than quietly picking one.
 */
export function VectorCompare() {
  const vectors = useSceneStore((s) => s.vectors);
  const vectorOrder = useSceneStore((s) => s.vectorOrder);
  const frames = useSceneStore((s) => s.frames);
  const order = useSceneStore((s) => s.order);
  const compareA = useSceneStore((s) => s.vectorCompareA);
  const compareB = useSceneStore((s) => s.vectorCompareB);
  const compareFrame = useSceneStore((s) => s.vectorCompareFrame);
  const setVectorCompare = useSceneStore((s) => s.setVectorCompare);
  const swapVectorCompare = useSceneStore((s) => s.swapVectorCompare);
  const setVectorCompareFrame = useSceneStore((s) => s.setVectorCompareFrame);
  const conventions = useSceneStore((s) => s.conventions);

  const world = useMemo(() => resolveWorldTransforms(frames), [frames]);

  if (vectorOrder.length < 2) {
    return (
      <section className="card">
        <p className="hint">
          Add at least two vectors to compare them. The Vectors tab has an add button.
        </p>
      </section>
    );
  }

  const a = compareA ? vectors[compareA] : undefined;
  const b = compareB ? vectors[compareB] : undefined;
  if (!a || !b) {
    return (
      <section className="card">
        <p className="hint">Pick two vectors to compare.</p>
      </section>
    );
  }

  const targetFrame = world[compareFrame] ?? IDENTITY_TRANSFORM;
  const frameName = frames[compareFrame]?.name ?? 'Global';

  const inFrameA = vectorInFrame(
    a.components,
    a.kind,
    world[a.frameId] ?? IDENTITY_TRANSFORM,
    targetFrame,
  );
  const inFrameB = vectorInFrame(
    b.components,
    b.kind,
    world[b.frameId] ?? IDENTITY_TRANSFORM,
    targetFrame,
  );

  const { angle, axis, degeneracy } = angleBetween(inFrameA, inFrameB, conventions.angleUnit);
  const note = degeneracyNote(degeneracy);
  const angleUnit = conventions.angleUnit === 'deg' ? '°' : ' rad';
  const bothDirections = a.kind === 'direction' && b.kind === 'direction';

  const picker = (slot: 'A' | 'B', value: string) => (
    <label className="select">
      <span className="select__label">{slot === 'A' ? 'From' : 'To'}</span>
      <select value={value} onChange={(e) => setVectorCompare(slot, e.target.value)}>
        {vectorOrder.map((id) => (
          <option key={id} value={id}>
            {vectors[id]?.name ?? id}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="stack">
      <section className="card">
        <div className="compare__pickers">
          {picker('A', a.id)}
          <button
            type="button"
            className="compare__swap"
            onClick={swapVectorCompare}
            title="Swap the two vectors"
            aria-label="Swap the two vectors"
          >
            ⇅
          </button>
          {picker('B', b.id)}
        </div>

        <label className="select">
          <span className="select__label">Evaluated in</span>
          <select value={compareFrame} onChange={(e) => setVectorCompareFrame(e.target.value)}>
            {order.map((id) => (
              <option key={id} value={id}>
                {frames[id]?.name ?? id}
              </option>
            ))}
          </select>
        </label>

        <p className={bothDirections ? 'hint' : 'readout__warn'}>
          {bothDirections ? (
            <>
              Both are directions, so this angle is the <strong>same in every frame</strong> —
              rotation preserves angles. The frame above only affects the axis components
              shown below.
            </>
          ) : (
            <>
              At least one of these is a <strong>point</strong>, whose components depend on
              the frame. This angle is therefore specific to <strong>{frameName}</strong> and
              would differ elsewhere.
            </>
          )}
        </p>
      </section>

      <section className="card">
        <h4 className="card__section card__section--first">
          {a.name} to {b.name}
        </h4>

        <CopyableRow
          heading="Angle between them"
          values={[{ name: 'angle', value: `${angle.toFixed(4)}${angleUnit}` }]}
        />

        <CopyableRow
          heading={`Axis carrying ${a.name} onto ${b.name}`}
          values={(['X', 'Y', 'Z'] as const).map((axisName, i) => ({
            name: axisName,
            value: (axis[i] ?? 0).toFixed(5),
            color: AXIS_COLORS[axisName],
          }))}
        />

        {note && <p className="readout__warn">{note}</p>}

        <CopyableRow
          heading={`${a.name} in ${frameName}`}
          values={(['X', 'Y', 'Z'] as const).map((axisName, i) => ({
            name: axisName,
            value: (inFrameA[i] ?? 0).toFixed(4),
            color: AXIS_COLORS[axisName],
          }))}
        />
        <CopyableRow
          heading={`${b.name} in ${frameName}`}
          values={(['X', 'Y', 'Z'] as const).map((axisName, i) => ({
            name: axisName,
            value: (inFrameB[i] ?? 0).toFixed(4),
            color: AXIS_COLORS[axisName],
          }))}
        />
      </section>
    </div>
  );
}
