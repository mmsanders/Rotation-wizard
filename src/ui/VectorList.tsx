import { useSceneStore } from '../store/useSceneStore';

/** The vector list: what exists, which frame each lives in, and which kind it is. */
export function VectorList() {
  const vectors = useSceneStore((s) => s.vectors);
  const vectorOrder = useSceneStore((s) => s.vectorOrder);
  const frames = useSceneStore((s) => s.frames);
  const selectedVectorId = useSceneStore((s) => s.selectedVectorId);
  const selectedFrameId = useSceneStore((s) => s.selectedId);
  const selectVector = useSceneStore((s) => s.selectVector);
  const addVector = useSceneStore((s) => s.addVector);
  const removeVector = useSceneStore((s) => s.removeVector);
  const toggleVectorVisible = useSceneStore((s) => s.toggleVectorVisible);

  return (
    <div className="framelist">
      {vectorOrder.length > 0 ? (
        <div className="framelist__rows">
          {vectorOrder.map((id) => {
            const vector = vectors[id];
            if (!vector) return null;
            return (
              <div
                key={id}
                className={`framerow${id === selectedVectorId ? ' is-selected' : ''}`}
                style={{ paddingLeft: '8px' }}
              >
                <button
                  type="button"
                  className="framerow__main"
                  onClick={() => selectVector(id)}
                  aria-current={id === selectedVectorId}
                >
                  <span className="framerow__dot" style={{ background: vector.color }} />
                  <span className="framerow__name">{vector.name}</span>
                  <span className="framerow__badge">
                    {vector.kind === 'point' ? 'point' : 'dir'}
                  </span>
                  <span className="framerow__meta">
                    in {frames[vector.frameId]?.name ?? '—'}
                  </span>
                </button>

                <button
                  type="button"
                  className="framerow__icon"
                  title={vector.visible ? 'Hide' : 'Show'}
                  aria-label={`${vector.visible ? 'Hide' : 'Show'} ${vector.name}`}
                  onClick={() => toggleVectorVisible(id)}
                >
                  {vector.visible ? '◉' : '○'}
                </button>

                <button
                  type="button"
                  className="framerow__icon framerow__icon--danger"
                  title="Delete"
                  aria-label={`Delete ${vector.name}`}
                  onClick={() => removeVector(id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty">No vectors yet.</p>
      )}

      <button type="button" className="btn btn--primary" onClick={() => addVector()}>
        + Add vector in {frames[selectedFrameId]?.name ?? 'Global'}
      </button>
    </div>
  );
}
