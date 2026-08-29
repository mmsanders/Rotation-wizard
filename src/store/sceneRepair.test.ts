import { describe, expect, it } from 'vitest';
import { globalFrame, repairPersistedScene } from './sceneRepair';
import { resolveWorldTransforms, rotationMatrixOf } from '../math/transforms';
import { GLOBAL_FRAME_ID, type Frame } from '../types';

const frame = (over: Partial<Frame> & { id: string }): Frame => ({
  name: over.id,
  parentId: GLOBAL_FRAME_ID,
  localPosition: [0, 0, 0],
  localQuaternion: [0, 0, 0, 1],
  color: '#ffffff',
  visible: true,
  ...over,
});

const scene = (frames: Frame[]) => ({
  frames: Object.fromEntries(frames.map((f) => [f.id, f])),
  order: frames.map((f) => f.id),
  selectedId: frames[1]?.id ?? GLOBAL_FRAME_ID,
  compareA: GLOBAL_FRAME_ID,
  compareB: frames[1]?.id ?? GLOBAL_FRAME_ID,
});

describe('repairPersistedScene', () => {
  it('rejects payloads with nothing usable in them', () => {
    expect(repairPersistedScene(null)).toBeNull();
    expect(repairPersistedScene(undefined)).toBeNull();
    expect(repairPersistedScene('not a scene')).toBeNull();
    expect(repairPersistedScene({})).toBeNull();
    expect(repairPersistedScene({ frames: {} })).toBeNull();
  });

  it('passes a healthy scene through intact', () => {
    const input = scene([globalFrame(), frame({ id: 'body', localPosition: [1, 2, 3] })]);
    const out = repairPersistedScene(input)!;
    expect(out.order).toEqual([GLOBAL_FRAME_ID, 'body']);
    expect(out.frames.body!.localPosition).toEqual([1, 2, 3]);
    expect(out.selectedId).toBe('body');
  });

  it('recreates a missing global frame', () => {
    const out = repairPersistedScene({ frames: { body: frame({ id: 'body' }) } })!;
    expect(out.frames[GLOBAL_FRAME_ID]).toBeDefined();
    expect(out.frames[GLOBAL_FRAME_ID]!.parentId).toBeNull();
    expect(out.order[0]).toBe(GLOBAL_FRAME_ID);
  });

  it('forces the global frame back to being a root', () => {
    const out = repairPersistedScene({
      frames: {
        [GLOBAL_FRAME_ID]: { ...globalFrame(), parentId: 'body' },
        body: frame({ id: 'body' }),
      },
    })!;
    expect(out.frames[GLOBAL_FRAME_ID]!.parentId).toBeNull();
  });

  it('re-homes frames whose parent has vanished', () => {
    const out = repairPersistedScene({
      frames: { orphan: frame({ id: 'orphan', parentId: 'ghost' }) },
    })!;
    expect(out.frames.orphan!.parentId).toBe(GLOBAL_FRAME_ID);
  });

  it('breaks a parent cycle so the scene can still resolve', () => {
    const out = repairPersistedScene({
      frames: {
        [GLOBAL_FRAME_ID]: globalFrame(),
        a: frame({ id: 'a', parentId: 'b' }),
        b: frame({ id: 'b', parentId: 'a' }),
      },
    })!;
    expect(() => resolveWorldTransforms(out.frames)).not.toThrow();
    // At least one of the pair must have been cut loose for the tree to be acyclic.
    const parents = [out.frames.a!.parentId, out.frames.b!.parentId];
    expect(parents).toContain(GLOBAL_FRAME_ID);
  });

  it('replaces corrupt numeric fields rather than rendering NaN', () => {
    const out = repairPersistedScene({
      frames: {
        bad: {
          id: 'bad',
          name: 'bad',
          parentId: GLOBAL_FRAME_ID,
          localPosition: [1, 'x', null],
          localQuaternion: [0, 0, 0, 0], // zero norm: degenerate
          color: '#fff',
          visible: true,
        },
      },
    })!;
    expect(out.frames.bad!.localPosition).toEqual([0, 0, 0]);
    expect(out.frames.bad!.localQuaternion).toEqual([0, 0, 0, 1]);
  });

  it('normalises a non-unit quaternion instead of passing it through', () => {
    // [0, 0, 0.6, 0.6] has norm 0.8485 — a real direction, but not a rotation. Left as-is
    // it would scale the frame's axes and quietly corrupt every readout derived from it.
    const out = repairPersistedScene({
      frames: { bad: { ...frame({ id: 'bad' }), localQuaternion: [0, 0, 0.6, 0.6] } },
    })!;

    const q = out.frames.bad!.localQuaternion;
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
    // Direction preserved: still a 90 deg turn about +Z.
    expect(q[2]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 12);

    // And the resolved transform is a true rotation: orthonormal, determinant +1.
    const m = rotationMatrixOf(resolveWorldTransforms(out.frames).bad!.quaternion);
    for (const row of m) {
      expect(Math.hypot(row[0]!, row[1]!, row[2]!)).toBeCloseTo(1, 12);
    }
  });

  it('leaves an already-unit quaternion untouched', () => {
    const out = repairPersistedScene({
      frames: { ok: { ...frame({ id: 'ok' }), localQuaternion: [0, 0, 0, 1] } },
    })!;
    expect(out.frames.ok!.localQuaternion).toEqual([0, 0, 0, 1]);
  });

  it('drops NaN and Infinity out of positions', () => {
    const out = repairPersistedScene({
      frames: { bad: { ...frame({ id: 'bad' }), localPosition: [1, Number.NaN, Infinity] } },
    })!;
    expect(out.frames.bad!.localPosition).toEqual([0, 0, 0]);
  });

  it('rebuilds an order that is missing, duplicated, or stale', () => {
    const out = repairPersistedScene({
      frames: {
        [GLOBAL_FRAME_ID]: globalFrame(),
        a: frame({ id: 'a' }),
        b: frame({ id: 'b' }),
      },
      order: ['a', 'a', 'deleted-frame'],
    })!;
    expect(out.order[0]).toBe(GLOBAL_FRAME_ID);
    expect(out.order).toEqual([GLOBAL_FRAME_ID, 'a', 'b']);
    expect(new Set(out.order).size).toBe(out.order.length);
  });

  it('points dangling selection and comparison ids back at the global frame', () => {
    const out = repairPersistedScene({
      frames: { [GLOBAL_FRAME_ID]: globalFrame(), a: frame({ id: 'a' }) },
      selectedId: 'deleted',
      compareA: 'deleted',
      compareB: 'a',
    })!;
    expect(out.selectedId).toBe(GLOBAL_FRAME_ID);
    expect(out.compareA).toBe(GLOBAL_FRAME_ID);
    expect(out.compareB).toBe('a');
  });

  it('falls back to defaults for unrecognised conventions', () => {
    const out = repairPersistedScene({
      frames: { [GLOBAL_FRAME_ID]: globalFrame() },
      conventions: { upAxis: 'Q', eulerOrder: 'ABC', rotationMode: 'sideways', angleUnit: 'furlongs' },
    })!;
    expect(out.conventions).toEqual({
      upAxis: 'Z',
      eulerOrder: 'ZYX',
      rotationMode: 'intrinsic',
      angleUnit: 'deg',
    });
  });

  it('keeps valid non-default conventions', () => {
    const out = repairPersistedScene({
      frames: { [GLOBAL_FRAME_ID]: globalFrame() },
      conventions: { upAxis: 'Y', eulerOrder: 'XYZ', rotationMode: 'extrinsic', angleUnit: 'rad' },
    })!;
    expect(out.conventions).toEqual({
      upAxis: 'Y',
      eulerOrder: 'XYZ',
      rotationMode: 'extrinsic',
      angleUnit: 'rad',
    });
  });

  it('always yields a scene that resolves cleanly', () => {
    const nasty = {
      frames: {
        a: { id: 'a', parentId: 'b' },
        b: { id: 'b', parentId: 'c' },
        c: { id: 'c', parentId: 'a' },
        d: 'not an object',
      },
      order: null,
      selectedId: 42,
    };
    const out = repairPersistedScene(nasty)!;
    expect(out).not.toBeNull();
    const world = resolveWorldTransforms(out.frames);
    for (const t of Object.values(world)) {
      expect(t.position.every(Number.isFinite)).toBe(true);
      expect(t.quaternion.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('repairPersistedScene — vectors', () => {
  const withVectors = (vectors: unknown, extra: Record<string, unknown> = {}) =>
    repairPersistedScene({
      frames: { [GLOBAL_FRAME_ID]: globalFrame(), body: frame({ id: 'body' }) },
      vectors,
      ...extra,
    })!;

  it('keeps a healthy vector intact', () => {
    const out = withVectors({
      v1: {
        id: 'v1',
        name: 'Nose',
        frameId: 'body',
        components: [1, 2, 3],
        kind: 'point',
        color: '#fff',
        visible: true,
      },
    });
    expect(out.vectors.v1).toMatchObject({
      name: 'Nose',
      frameId: 'body',
      components: [1, 2, 3],
      kind: 'point',
    });
    expect(out.vectorOrder).toEqual(['v1']);
  });

  it('re-homes a vector whose frame has vanished rather than dropping it', () => {
    const out = withVectors({ v1: { id: 'v1', frameId: 'ghost', components: [1, 0, 0] } });
    expect(out.vectors.v1!.frameId).toBe(GLOBAL_FRAME_ID);
  });

  it('defaults an unrecognised kind to direction', () => {
    const out = withVectors({ v1: { id: 'v1', frameId: 'body', kind: 'sideways' } });
    expect(out.vectors.v1!.kind).toBe('direction');
  });

  it('replaces corrupt components', () => {
    const out = withVectors({ v1: { id: 'v1', frameId: 'body', components: [1, 'x', NaN] } });
    expect(out.vectors.v1!.components).toEqual([1, 0, 0]);
  });

  it('tolerates a scene saved before vectors existed', () => {
    const out = repairPersistedScene({ frames: { [GLOBAL_FRAME_ID]: globalFrame() } })!;
    expect(out.vectors).toEqual({});
    expect(out.vectorOrder).toEqual([]);
    expect(out.selectedVectorId).toBeNull();
  });

  it('points dangling vector selections at a surviving vector', () => {
    const out = withVectors(
      { v1: { id: 'v1', frameId: 'body' } },
      { selectedVectorId: 'gone', vectorCompareA: 'gone', vectorCompareB: 'v1' },
    );
    expect(out.selectedVectorId).toBe('v1');
    expect(out.vectorCompareA).toBe('v1');
    expect(out.vectorCompareB).toBe('v1');
  });
});

describe('repairPersistedScene — the global frame is always the identity', () => {
  it('strips a stored offset or rotation from the root', () => {
    // Everything is measured against this frame, so an offset root would shift every
    // readout in the app while looking perfectly valid.
    const out = repairPersistedScene({
      frames: {
        [GLOBAL_FRAME_ID]: {
          ...globalFrame(),
          localPosition: [5, -2, 9],
          localQuaternion: [0, 0, 0.7071, 0.7071],
        },
      },
    })!;
    expect(out.frames[GLOBAL_FRAME_ID]!.localPosition).toEqual([0, 0, 0]);
    expect(out.frames[GLOBAL_FRAME_ID]!.localQuaternion).toEqual([0, 0, 0, 1]);
  });

  it('keeps the root’s cosmetic fields', () => {
    const out = repairPersistedScene({
      frames: { [GLOBAL_FRAME_ID]: { ...globalFrame(), name: 'World', color: '#123456' } },
    })!;
    expect(out.frames[GLOBAL_FRAME_ID]!.name).toBe('World');
    expect(out.frames[GLOBAL_FRAME_ID]!.color).toBe('#123456');
  });
});
