import { useMemo } from 'react';
import { GLOBAL_FRAME_ID } from '../types';
import { useSceneStore } from '../store/useSceneStore';
import { ancestorsOf } from '../math/transforms';

/**
 * The frame tree.
 *
 * Indentation shows parenting, which is the thing that makes "define an axis from
 * another axis" legible at a glance.
 */
export function FrameList() {
  const frames = useSceneStore((s) => s.frames);
  const order = useSceneStore((s) => s.order);
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectFrame = useSceneStore((s) => s.selectFrame);
  const addFrame = useSceneStore((s) => s.addFrame);
  const removeFrame = useSceneStore((s) => s.removeFrame);
  const toggleVisible = useSceneStore((s) => s.toggleVisible);

  // Depth-first, so a child always renders directly under its parent.
  const rows = useMemo(() => {
    const childrenOf = new Map<string | null, string[]>();
    for (const id of order) {
      const parent = frames[id]?.parentId ?? null;
      const list = childrenOf.get(parent) ?? [];
      list.push(id);
      childrenOf.set(parent, list);
    }

    const out: { id: string; depth: number }[] = [];
    const walk = (id: string, depth: number) => {
      out.push({ id, depth });
      for (const child of childrenOf.get(id) ?? []) walk(child, depth + 1);
    };
    walk(GLOBAL_FRAME_ID, 0);

    // Anything the walk missed (shouldn't happen, but never hide a frame from the user).
    for (const id of order) {
      if (!out.some((row) => row.id === id)) {
        out.push({ id, depth: ancestorsOf(frames, id).length });
      }
    }
    return out;
  }, [frames, order]);

  return (
    <div className="framelist">
      <div className="framelist__rows">
        {rows.map(({ id, depth }) => {
          const frame = frames[id];
          if (!frame) return null;
          const isGlobal = id === GLOBAL_FRAME_ID;
          return (
            <div
              key={id}
              className={`framerow${id === selectedId ? ' is-selected' : ''}`}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
            >
              <button
                type="button"
                className="framerow__main"
                onClick={() => selectFrame(id)}
                aria-current={id === selectedId}
              >
                <span className="framerow__dot" style={{ background: frame.color }} />
                <span className="framerow__name">{frame.name}</span>
                {isGlobal && <span className="framerow__badge">root</span>}
              </button>

              <button
                type="button"
                className="framerow__icon"
                title={frame.visible ? 'Hide' : 'Show'}
                aria-label={`${frame.visible ? 'Hide' : 'Show'} ${frame.name}`}
                onClick={() => toggleVisible(id)}
              >
                {frame.visible ? '◉' : '○'}
              </button>

              <button
                type="button"
                className="framerow__icon framerow__icon--danger"
                title={isGlobal ? 'The global frame cannot be deleted' : 'Delete'}
                aria-label={`Delete ${frame.name}`}
                disabled={isGlobal}
                onClick={() => removeFrame(id)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn btn--primary" onClick={() => addFrame()}>
        + Add frame under {frames[selectedId]?.name ?? 'Global'}
      </button>
    </div>
  );
}
