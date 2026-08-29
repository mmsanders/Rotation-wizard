import { useMemo, useState } from 'react';
import { useSceneStore } from '../store/useSceneStore';
import { IDENTITY_TRANSFORM, relativeTransform, resolveWorldTransforms } from '../math/transforms';
import { Readout } from './Readout';
import { Segmented } from './Segmented';
import { VectorCompare } from './VectorCompare';

type CompareMode = 'frames' | 'vectors';

const MODE_OPTIONS = [
  { value: 'frames' as CompareMode, label: 'Frames', title: 'Rotation between two frames' },
  { value: 'vectors' as CompareMode, label: 'Vectors', title: 'Angle between two vectors' },
];

/** Comparison, in either of the two things there are to compare. */
export function ComparePanel() {
  const [mode, setMode] = useState<CompareMode>('frames');

  return (
    <div className="stack">
      <section className="card">
        <Segmented label="Compare" value={mode} options={MODE_OPTIONS} onChange={setMode} />
      </section>

      {mode === 'vectors' ? <VectorCompare /> : <ComparedFrames />}
    </div>
  );
}

/**
 * Any frame against any other frame.
 *
 * The single quaternion below has two equivalent readings, and both are named on purpose:
 * confusing "the orientation of B seen from A" with "the operator that maps B-coordinates
 * into A" is the classic way to end up with an inverted rotation and no idea why.
 */
function ComparedFrames() {
  const frames = useSceneStore((s) => s.frames);
  const order = useSceneStore((s) => s.order);
  const compareA = useSceneStore((s) => s.compareA);
  const compareB = useSceneStore((s) => s.compareB);
  const setCompare = useSceneStore((s) => s.setCompare);
  const swapCompare = useSceneStore((s) => s.swapCompare);
  const conventions = useSceneStore((s) => s.conventions);

  const world = useMemo(() => resolveWorldTransforms(frames), [frames]);

  const nameA = frames[compareA]?.name ?? 'Global';
  const nameB = frames[compareB]?.name ?? 'Global';
  const relative = relativeTransform(
    world[compareA] ?? IDENTITY_TRANSFORM,
    world[compareB] ?? IDENTITY_TRANSFORM,
  );

  const picker = (slot: 'A' | 'B', value: string) => (
    <label className="select">
      <span className="select__label">{slot === 'A' ? 'Reference frame' : 'Target frame'}</span>
      <select value={value} onChange={(e) => setCompare(slot, e.target.value)}>
        {order.map((id) => (
          <option key={id} value={id}>
            {frames[id]?.name ?? id}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="stack">
      <section className="card">
        <div className="compare__pickers">
          {picker('A', compareA)}
          <button
            type="button"
            className="compare__swap"
            onClick={swapCompare}
            title="Swap reference and target"
            aria-label="Swap reference and target"
          >
            ⇅
          </button>
          {picker('B', compareB)}
        </div>

        {compareA === compareB && (
          <p className="hint">
            Both slots are the same frame, so the result is the identity rotation. Pick two
            different frames to compare.
          </p>
        )}
      </section>

      <section className="card">
        <h4 className="card__section card__section--first">
          {nameB} relative to {nameA}
        </h4>
        <Readout
          transform={relative}
          conventions={conventions}
          positionLabel={`${nameB} origin, in ${nameA} coordinates`}
          caption={
            <>
              <div className="reading">
                <span className="reading__tag">Reads as</span> the orientation of{' '}
                <strong>{nameB}</strong>&rsquo;s axes expressed in <strong>{nameA}</strong>
                &rsquo;s axes.
              </div>
              <div className="reading">
                <span className="reading__tag">Equivalently</span> the rotation that takes a
                vector&rsquo;s <strong>{nameB}</strong> components to its{' '}
                <strong>{nameA}</strong> components:{' '}
                <code>
                  v<sub>{nameA}</sub> = q ⊗ v<sub>{nameB}</sub>
                </code>
                .
              </div>
            </>
          }
        />
      </section>
    </div>
  );
}
