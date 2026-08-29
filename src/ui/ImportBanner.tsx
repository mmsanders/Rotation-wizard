import { useState } from 'react';
import { useSceneStore } from '../store/useSceneStore';
import { replacedByImport } from '../share/importOnBoot';

/**
 * Offers an Undo after a scene arrived from a shared link.
 *
 * The import itself happens before React renders (see share/importOnBoot); this only
 * reports it. A link is imported without a confirmation prompt — clicking one *is* the
 * request, and a dialog on every open would be friction for the main use case of moving a
 * setup between your own devices — so the safety net is the Undo rather than a gate.
 */
export function ImportBanner() {
  const loadScene = useSceneStore((s) => s.loadScene);
  // Read once at mount; a pure read, so no state is set from an effect.
  const [replaced] = useState(() => replacedByImport());
  const [dismissed, setDismissed] = useState(false);

  if (!replaced || dismissed) return null;

  return (
    <div className="toast" role="status">
      <span className="toast__text">Scene loaded from link.</span>
      <button
        type="button"
        className="toast__action"
        onClick={() => {
          loadScene(replaced);
          setDismissed(true);
        }}
      >
        Undo
      </button>
      <button
        type="button"
        className="toast__close"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  );
}
