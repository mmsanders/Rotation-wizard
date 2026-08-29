import { useState } from 'react';
import { useSceneStore } from '../store/useSceneStore';
import { clearReplacedByImport, replacedByImport } from '../share/importOnBoot';

/**
 * Offers an Undo after a scene arrived from a shared link.
 *
 * The import itself happens before React renders (see share/importOnBoot); this only
 * reports it. A link is imported without a confirmation prompt — clicking one *is* the
 * request, and a dialog on every open would be friction for the main use case of moving a
 * setup between your own devices — so the safety net is the Undo rather than a gate.
 *
 * The offer is stored rather than held in memory, so it survives a refresh: the import has
 * already overwritten the saved scene by the time this renders.
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
          clearReplacedByImport();
          setDismissed(true);
        }}
      >
        Undo
      </button>
      <button
        type="button"
        className="toast__close"
        aria-label="Dismiss"
        onClick={() => {
          clearReplacedByImport();
          setDismissed(true);
        }}
      >
        ×
      </button>
    </div>
  );
}
