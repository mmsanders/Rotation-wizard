import { useState } from 'react';
import type { AngleUnit, EulerOrder, RotationMode, UpAxis } from '../types';
import { useSceneStore, sceneSnapshot } from '../store/useSceneStore';
import { sceneLink } from '../share/sceneLink';
import { EULER_ORDERS, describeSequence } from '../math/conventions';
import { Segmented } from './Segmented';

const UP_AXIS_OPTIONS = [
  { value: 'Z' as UpAxis, label: 'Z up', title: 'Aerospace / robotics: Z up, X forward' },
  { value: 'Y' as UpAxis, label: 'Y up', title: 'Graphics convention: Y up (three.js native)' },
];

const MODE_OPTIONS = [
  {
    value: 'intrinsic' as RotationMode,
    label: 'Intrinsic',
    title: 'Each rotation is about the new, already-rotated axes',
  },
  {
    value: 'extrinsic' as RotationMode,
    label: 'Extrinsic',
    title: 'Each rotation is about the original fixed world axes',
  },
];

const UNIT_OPTIONS = [
  { value: 'deg' as AngleUnit, label: 'Degrees' },
  { value: 'rad' as AngleUnit, label: 'Radians' },
];

const ORDER_OPTIONS = EULER_ORDERS.map((order) => ({
  value: order,
  label: order,
  title: `Apply ${[...order].join(', then ')}`,
}));

/**
 * Conventions.
 *
 * These change only how numbers are read and written, never the stored scene — so a frame
 * placed under one convention still means the same thing under another.
 */
export function SettingsPanel() {
  const conventions = useSceneStore((s) => s.conventions);
  const setConventions = useSceneStore((s) => s.setConventions);
  const resetScene = useSceneStore((s) => s.resetScene);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [linkState, setLinkState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyLink = () => {
    const link = sceneLink(sceneSnapshot(useSceneStore.getState()), window.location.href);
    const settle = (result: 'copied' | 'failed') => {
      setLinkState(result);
      window.setTimeout(() => setLinkState('idle'), 1800);
    };
    // Clipboard needs a secure context and can be refused; say so rather than appearing
    // to have worked.
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      settle('failed');
      return;
    }
    clipboard.writeText(link).then(
      () => settle('copied'),
      () => settle('failed'),
    );
  };

  return (
    <div className="stack">
      <section className="card">
        <Segmented
          label="World up axis"
          value={conventions.upAxis}
          options={UP_AXIS_OPTIONS}
          onChange={(upAxis) => setConventions({ upAxis })}
        />
        <p className="hint">
          Changes the viewpoint only. Stored coordinates are untouched, so switching back
          and forth never alters a single number.
        </p>
      </section>

      <section className="card">
        <Segmented
          label="Euler sequence"
          value={conventions.eulerOrder}
          options={ORDER_OPTIONS}
          onChange={(eulerOrder: EulerOrder) => setConventions({ eulerOrder })}
          wrap
        />
        <Segmented
          label="Applied about"
          value={conventions.rotationMode}
          options={MODE_OPTIONS}
          onChange={(rotationMode) => setConventions({ rotationMode })}
        />
        <p className="hint">
          Currently <strong>{describeSequence(conventions)}</strong>. The sequence reads in
          the order the rotations are applied. Intrinsic Z-Y-X is the usual aerospace
          yaw-pitch-roll.
        </p>
      </section>

      <section className="card">
        <Segmented
          label="Angle units"
          value={conventions.angleUnit}
          options={UNIT_OPTIONS}
          onChange={(angleUnit) => setConventions({ angleUnit })}
        />
      </section>

      <section className="card">
        <h4 className="card__section card__section--first">Share</h4>
        <p className="hint">
          Puts the whole scene — frames, vectors and conventions — into a link, so you can
          move a setup between your phone and desktop or send it to someone.
        </p>
        <button type="button" className="btn" onClick={copyLink}>
          {linkState === 'copied'
            ? 'Link copied'
            : linkState === 'failed'
              ? 'Could not copy — check clipboard permission'
              : 'Copy link to this scene'}
        </button>
      </section>

      <section className="card">
        <h4 className="card__section card__section--first">Scene</h4>
        <p className="hint">
          Frames are saved in this browser, so your setup survives a refresh. Conventions
          are kept when the scene is reset.
        </p>
        {confirmingReset ? (
          <div className="confirm">
            <span>Delete all frames and start over?</span>
            <div className="confirm__actions">
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  resetScene();
                  setConfirmingReset(false);
                }}
              >
                Reset scene
              </button>
              <button type="button" className="btn" onClick={() => setConfirmingReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirmingReset(true)}>
            Reset scene
          </button>
        )}
      </section>
    </div>
  );
}
