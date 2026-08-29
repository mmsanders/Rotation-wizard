import { useSceneStore, sceneSnapshot } from '../store/useSceneStore';
import type { ScenePersisted } from '../store/sceneRepair';
import { sceneFromHash } from './sceneLink';

/**
 * Import a shared scene from the URL hash, before React renders.
 *
 * Deliberately not done inside a component. Importing is a one-shot bootstrap step, and
 * driving it from an effect means either setting state during an effect — which costs an
 * extra render and trips the lint rule that exists to discourage exactly this — or
 * mutating the store during render, which is worse. Doing it here also means the very
 * first paint already shows the shared scene rather than flashing the previous one.
 *
 * zustand's persist middleware rehydrates synchronously from localStorage at store
 * creation, so the snapshot taken here really is the scene the user had.
 */

/**
 * Where the replaced scene is parked.
 *
 * Persisted, not just held in memory: loading a shared scene immediately overwrites the
 * saved scene through the persist middleware, so an in-memory Undo would evaporate on the
 * first refresh and take the user's own work with it. Keeping it in its own key means the
 * offer survives until it is either taken or dismissed.
 */
const REPLACED_KEY = 'rotation-wizard/replaced-by-import';

let replacedScene: ScenePersisted | null = null;

function readStashed(): ScenePersisted | null {
  try {
    const raw = window.localStorage.getItem(REPLACED_KEY);
    return raw ? (JSON.parse(raw) as ScenePersisted) : null;
  } catch {
    // Storage can be unavailable or hold junk; neither is worth failing a page load over.
    return null;
  }
}

export function importSceneFromHash(): void {
  const incoming = sceneFromHash(window.location.hash);
  if (!incoming) return;

  replacedScene = sceneSnapshot(useSceneStore.getState());
  try {
    window.localStorage.setItem(REPLACED_KEY, JSON.stringify(replacedScene));
  } catch {
    // Undo then lasts only for this session, which still beats refusing the import.
  }

  useSceneStore.getState().loadScene(incoming);

  // Drop the hash so a later refresh does not silently re-import over fresh edits.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** The scene an import replaced, or null if there is nothing to undo. */
export function replacedByImport(): ScenePersisted | null {
  return replacedScene ?? readStashed();
}

/** Called once the offer has been taken or waved away. */
export function clearReplacedByImport(): void {
  replacedScene = null;
  try {
    window.localStorage.removeItem(REPLACED_KEY);
  } catch {
    // Nothing to do; the offer simply persists until storage works again.
  }
}
