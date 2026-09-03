import { useMemo, useState } from 'react';
import { GLOBAL_FRAME_ID, type Quat, type Vec3 } from '../types';
import { useSceneStore } from '../store/useSceneStore';
import {
  angleRange,
  eulerFromQuat,
  eulerSequence,
  quatFromEuler,
} from '../math/conventions';
import {
  quatsApproxEqual,
  relativeTransform,
  resolveWorldTransforms,
  wouldCreateCycle,
  IDENTITY_TRANSFORM,
  normalizeQuat,
} from '../math/transforms';
import { AXIS_COLORS } from '../theme';
import { NumberField } from './NumberField';
import { Readout } from './Readout';
import { Segmented } from './Segmented';

const POSITION_AXES = ['X', 'Y', 'Z'] as const;
const QUATERNION_COMPONENTS = [
  { label: 'w', index: 3, color: undefined },
  { label: 'x', index: 0, color: AXIS_COLORS.X },
  { label: 'y', index: 1, color: AXIS_COLORS.Y },
  { label: 'z', index: 2, color: AXIS_COLORS.Z },
] as const;
const ORIENTATION_OPTIONS = [
  { value: 'euler', label: 'Euler sequence' },
  { value: 'quaternion', label: 'Quaternion' },
] as const;

/** Controls for the selected frame, plus what it currently reads as. */
export function FrameControls() {
  const frames = useSceneStore((s) => s.frames);
  const selectedId = useSceneStore((s) => s.selectedId);
  const conventions = useSceneStore((s) => s.conventions);
  const setLocalPosition = useSceneStore((s) => s.setLocalPosition);
  const setLocalQuaternion = useSceneStore((s) => s.setLocalQuaternion);
  const renameFrame = useSceneStore((s) => s.renameFrame);
  const setParent = useSceneStore((s) => s.setParent);
  const resetFrame = useSceneStore((s) => s.resetFrame);

  /**
   * The Euler triple the user is currently editing.
   *
   * Not derived straight from the stored quaternion on every render, because at gimbal
   * lock the quaternion maps back to a *different* triple — so a slider would jump out
   * from under your finger mid-drag. Instead the draft is kept as long as it still
   * produces the stored rotation, and abandoned the moment something else changes it.
   */
  const [draft, setDraft] = useState<Vec3 | null>(null);
  const [quaternionDraft, setQuaternionDraft] = useState<Quat | null>(null);
  const [orientationDefinition, setOrientationDefinition] = useState<'euler' | 'quaternion'>('euler');

  const frame = frames[selectedId];
  const world = useMemo(() => resolveWorldTransforms(frames), [frames]);

  if (!frame) {
    return <p className="empty">No frame selected.</p>;
  }

  const isGlobal = frame.id === GLOBAL_FRAME_ID;
  const stored = frame.localQuaternion;
  const draftMatchesStore =
    draft !== null && quatsApproxEqual(quatFromEuler(draft, conventions), stored, 1e-9);
  const euler = draftMatchesStore ? draft : eulerFromQuat(stored, conventions);

  const slots = eulerSequence(conventions);
  const range = angleRange(conventions.angleUnit);
  const unit = conventions.angleUnit === 'deg' ? '°' : 'rad';

  const setEuler = (index: 0 | 1 | 2, value: number) => {
    const next: Vec3 = [...euler] as Vec3;
    next[index] = value;
    setDraft(next);
    setLocalQuaternion(frame.id, quatFromEuler(next, conventions));
  };

  const setPosition = (index: number, value: number) => {
    const next: Vec3 = [...frame.localPosition] as Vec3;
    next[index] = value;
    setLocalPosition(frame.id, next);
  };

  const normalizedQuaternionDraft = quaternionDraft && normalizeQuat(quaternionDraft);
  const quaternionDraftMatchesStore =
    normalizedQuaternionDraft !== null &&
    quatsApproxEqual(normalizedQuaternionDraft, stored, 1e-9);
  const quaternion: Quat =
    quaternionDraftMatchesStore && quaternionDraft ? quaternionDraft : stored;

  const setQuaternionComponent = (index: number, value: number) => {
    const next: Quat = [...quaternion] as Quat;
    next[index] = value;
    const normalized = normalizeQuat(next);
    setQuaternionDraft(next);
    if (normalized) setLocalQuaternion(frame.id, normalized);
  };

  const parentTransform = frame.parentId ? world[frame.parentId] : undefined;
  const selfTransform = world[frame.id] ?? IDENTITY_TRANSFORM;
  const globalTransform = world[GLOBAL_FRAME_ID] ?? IDENTITY_TRANSFORM;
  const parentName = frame.parentId ? (frames[frame.parentId]?.name ?? 'Global') : 'Global';

  const localTransform = {
    position: frame.localPosition,
    quaternion: frame.localQuaternion,
  };
  const vsGlobal = relativeTransform(globalTransform, selfTransform);

  return (
    <div className="stack">
      <section className="card">
        <div className="card__head">
          <span className="card__dot" style={{ background: frame.color }} />
          <input
            className="card__name"
            value={frame.name}
            aria-label="Frame name"
            onChange={(e) => renameFrame(frame.id, e.target.value)}
            disabled={isGlobal}
          />
        </div>

        {isGlobal ? (
          <p className="hint">
            The global frame is the root of the tree — it defines the reference everything
            else is measured against, so it cannot be moved or re-parented.
          </p>
        ) : (
          <>
            <label className="select">
              <span className="select__label">Defined relative to</span>
              <select
                value={frame.parentId ?? GLOBAL_FRAME_ID}
                onChange={(e) => setParent(frame.id, e.target.value)}
              >
                {Object.values(frames).map((candidate) => {
                  const invalid =
                    candidate.id === frame.id ||
                    wouldCreateCycle(frames, frame.id, candidate.id);
                  return (
                    <option key={candidate.id} value={candidate.id} disabled={invalid}>
                      {candidate.name}
                      {invalid && candidate.id !== frame.id ? ' — would loop' : ''}
                    </option>
                  );
                })}
              </select>
            </label>

            <h4 className="card__section">Position in {parentName}</h4>
            {POSITION_AXES.map((axis, i) => (
              <NumberField
                key={axis}
                label={axis}
                value={frame.localPosition[i] ?? 0}
                onChange={(v) => setPosition(i, v)}
                min={-10}
                max={10}
                step={0.1}
                color={AXIS_COLORS[axis]}
              />
            ))}

            <h4 className="card__section">Orientation relative to {parentName}</h4>
            <Segmented
              label="Rotation definition"
              value={orientationDefinition}
              options={ORIENTATION_OPTIONS}
              onChange={setOrientationDefinition}
            />
            {orientationDefinition === 'euler' ? (
              slots.map((slot) => (
                <NumberField
                  key={slot.axis}
                  label={slot.alias ? slot.alias : `Rotate ${slot.axis}`}
                  hint={slot.alias ? `${slot.step}. about ${slot.axis}` : `step ${slot.step}`}
                  value={euler[slot.index]}
                  onChange={(v) => setEuler(slot.index, v)}
                  min={range.min}
                  max={range.max}
                  step={conventions.angleUnit === 'deg' ? 1 : 0.01}
                  unit={unit}
                  color={AXIS_COLORS[slot.axis]}
                />
              ))
            ) : (
              <>
                {QUATERNION_COMPONENTS.map((component) => (
                  <NumberField
                    key={component.label}
                    label={component.label}
                    value={quaternion[component.index]}
                    onChange={(value) => setQuaternionComponent(component.index, value)}
                    min={-1}
                    max={1}
                    step={0.01}
                    {...(component.color ? { color: component.color } : {})}
                  />
                ))}
                <p className="hint">
                  Enter components as w, x, y, z. They are normalised automatically; an
                  all-zero quaternion is ignored because it cannot describe a rotation.
                </p>
              </>
            )}

            <button
              type="button"
              className="btn"
              onClick={() => {
                setDraft(null);
                setQuaternionDraft(null);
                resetFrame(frame.id);
              }}
            >
              Reset to {parentName}
            </button>
          </>
        )}
      </section>

      {!isGlobal && parentTransform && (
        <section className="card">
          <h4 className="card__section card__section--first">
            {frame.name} relative to {parentName}
          </h4>
          <Readout
            transform={localTransform}
            conventions={conventions}
            positionLabel={`Offset in ${parentName}`}
            caption={
              <>
                What the controls above are setting: the orientation of{' '}
                <strong>{frame.name}</strong>&rsquo;s axes expressed in{' '}
                <strong>{parentName}</strong>&rsquo;s axes.
              </>
            }
          />
        </section>
      )}

      {!isGlobal && frame.parentId !== GLOBAL_FRAME_ID && (
        <section className="card">
          <h4 className="card__section card__section--first">{frame.name} relative to Global</h4>
          <Readout
            transform={vsGlobal}
            conventions={conventions}
            positionLabel="Offset in Global"
            caption={
              <>
                The same frame measured against the root, with every intermediate parent
                composed in.
              </>
            }
          />
        </section>
      )}
    </div>
  );
}
