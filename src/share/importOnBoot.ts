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

let replacedScene: ScenePersisted | null = null;

export function importSceneFromHash(): void {
  const incoming = sceneFromHash(window.location.hash);
  if (!incoming) return;

  // Keep what was replaced so the banner can offer an Undo — a link must never destroy
  // an in-progress scene with no way back.
  replacedScene = sceneSnapshot(useSceneStore.getState());
  useSceneStore.getState().loadScene(incoming);

  // Drop the hash so a later refresh does not silently re-import over fresh edits.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** The scene an import replaced, or null if no import happened. */
export function replacedByImport(): ScenePersisted | null {
  return replacedScene;
}
