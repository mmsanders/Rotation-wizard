import { useState, type ReactNode } from 'react';
import type { Conventions, Quat, Vec3 } from '../types';
import {
  axisAngleOf,
  canonicalizeQuat,
  rotationMatrixOf,
  type Transform,
} from '../math/transforms';
import { describeSequence, eulerFromQuat, eulerSequence, isNearGimbalLock } from '../math/conventions';
import { AXIS_COLORS } from '../theme';
import { CopyValue } from './CopyableRow';
import { useCopy } from './useCopy';

/** Fixed-width formatting, with negative zero normalised away. */
function fmt(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(digits);
  return fixed === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : fixed;
}

type Props = {
  transform: Transform;
  conventions: Conventions;
  /** Shown above the numbers to say exactly what this rotation means. */
  caption?: ReactNode;
  showPosition?: boolean;
  positionLabel?: string;
};

/**
 * The numeric readout: one rotation shown four ways.
 *
 * Everything is derived from the same quaternion, so the representations cannot drift
 * apart. Values are tap-to-copy, which is the whole point of a calculator.
 */
export function Readout({
  transform,
  conventions,
  caption,
  showPosition = true,
  positionLabel = 'Position',
}: Props) {
  const [copyStatus, copy] = useCopy();
  const [showMatrix, setShowMatrix] = useState(false);

  const q: Quat = canonicalizeQuat(transform.quaternion);
  const euler = eulerFromQuat(q, conventions);
  const slots = eulerSequence(conventions);
  const { axis, angle } = axisAngleOf(q, conventions.angleUnit);
  const matrix = rotationMatrixOf(q);
  const locked = isNearGimbalLock(q, conventions);
  const unit = conventions.angleUnit === 'deg' ? '°' : ' rad';
  const angleDigits = conventions.angleUnit === 'deg' ? 3 : 5;
  const position: Vec3 = transform.position;

  const quatText = `w=${fmt(q[3], 6)} x=${fmt(q[0], 6)} y=${fmt(q[1], 6)} z=${fmt(q[2], 6)}`;

  return (
    <div className="readout">
      {caption && <div className="readout__caption">{caption}</div>}

      <section className="readout__block">
        <header className="readout__head">
          <h4>Quaternion</h4>
          <button
            type="button"
            className="readout__copyall"
            onClick={() => copy('quat-all', quatText)}
          >
            {copyStatus?.key === 'quat-all'
              ? copyStatus.ok
                ? 'copied'
                : 'no clipboard'
              : 'copy all'}
          </button>
        </header>
        <div className="readout__grid readout__grid--4">
          <CopyValue name="w" value={fmt(q[3], 6)} copyKey="qw" status={copyStatus} onCopy={copy} />
          <CopyValue
            name="x"
            value={fmt(q[0], 6)}
            color={AXIS_COLORS.X}
            copyKey="qx"
            status={copyStatus}
            onCopy={copy}
          />
          <CopyValue
            name="y"
            value={fmt(q[1], 6)}
            color={AXIS_COLORS.Y}
            copyKey="qy"
            status={copyStatus}
            onCopy={copy}
          />
          <CopyValue
            name="z"
            value={fmt(q[2], 6)}
            color={AXIS_COLORS.Z}
            copyKey="qz"
            status={copyStatus}
            onCopy={copy}
          />
        </div>
        <p className="readout__note">Normalised to w ≥ 0 — q and −q are the same rotation.</p>
      </section>

      <section className="readout__block">
        <header className="readout__head">
          <h4>Euler</h4>
          <span className="readout__tag">{describeSequence(conventions)}</span>
        </header>
        <div className="readout__grid readout__grid--3">
          {slots.map((slot) => (
            <CopyValue
              key={slot.axis}
              name={slot.alias ? `${slot.alias} (${slot.axis})` : slot.axis}
              value={`${fmt(euler[slot.index], angleDigits)}${unit}`}
              color={AXIS_COLORS[slot.axis]}
              copyKey={`e${slot.axis}`}
              status={copyStatus}
              onCopy={copy}
            />
          ))}
        </div>
        {locked && (
          <p className="readout__warn">
            Near gimbal lock — the {slots[1]?.axis} angle is at ±90°, so this triple is not
            unique. The quaternion above is unaffected.
          </p>
        )}
      </section>

      <section className="readout__block">
        <header className="readout__head">
          <h4>Axis &amp; angle</h4>
        </header>
        <div className="readout__grid readout__grid--4">
          <CopyValue
            name="angle"
            value={`${fmt(angle, angleDigits)}${unit}`}
            copyKey="aa-angle"
            status={copyStatus}
            onCopy={copy}
          />
          <CopyValue
            name="x"
            value={fmt(axis[0], 5)}
            color={AXIS_COLORS.X}
            copyKey="aa-x"
            status={copyStatus}
            onCopy={copy}
          />
          <CopyValue
            name="y"
            value={fmt(axis[1], 5)}
            color={AXIS_COLORS.Y}
            copyKey="aa-y"
            status={copyStatus}
            onCopy={copy}
          />
          <CopyValue
            name="z"
            value={fmt(axis[2], 5)}
            color={AXIS_COLORS.Z}
            copyKey="aa-z"
            status={copyStatus}
            onCopy={copy}
          />
        </div>
      </section>

      {showPosition && (
        <section className="readout__block">
          <header className="readout__head">
            <h4>{positionLabel}</h4>
          </header>
          <div className="readout__grid readout__grid--3">
            {(['X', 'Y', 'Z'] as const).map((axisName, i) => (
              <CopyValue
                key={axisName}
                name={axisName}
                value={fmt(position[i] ?? 0, 4)}
                color={AXIS_COLORS[axisName]}
                copyKey={`p${axisName}`}
                status={copyStatus}
                onCopy={copy}
              />
            ))}
          </div>
        </section>
      )}

      <section className="readout__block">
        <button
          type="button"
          className="readout__toggle"
          onClick={() => setShowMatrix((v) => !v)}
          aria-expanded={showMatrix}
        >
          {showMatrix ? '▾' : '▸'} Rotation matrix
        </button>
        {showMatrix && (
          <>
            <div className="matrix">
              {matrix.map((row, r) =>
                row.map((cell, c) => (
                  <span key={`${r}-${c}`} className="matrix__cell">
                    {fmt(cell, 4)}
                  </span>
                )),
              )}
            </div>
            <p className="readout__note">
              Columns are where each axis lands. Row-major; multiply as v′ = R·v.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
