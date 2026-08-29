import { describe, expect, it } from 'vitest';
import { SCENE_HASH_PREFIX, decodeScene, encodeScene, sceneFromHash, sceneLink } from './sceneLink';
import { globalFrame, type ScenePersisted } from '../store/sceneRepair';
import { DEFAULT_CONVENTIONS, quatFromEuler } from '../math/conventions';
import { resolveWorldTransforms } from '../math/transforms';
import { GLOBAL_FRAME_ID, type Frame, type SceneVector } from '../types';

const frame = (over: Partial<Frame> & { id: string }): Frame => ({
  name: over.id,
  parentId: GLOBAL_FRAME_ID,
  localPosition: [0, 0, 0],
  localQuaternion: [0, 0, 0, 1],
  color: '#ffffff',
  visible: true,
  ...over,
});

const vector = (over: Partial<SceneVector> & { id: string }): SceneVector => ({
  name: over.id,
  frameId: GLOBAL_FRAME_ID,
  components: [1, 0, 0],
  kind: 'direction',
  color: '#fbbf24',
  visible: true,
  ...over,
});

const scene = (): ScenePersisted => {
  const body = frame({
    id: 'body',
    name: 'Body',
    localPosition: [1.8, 0.9, 0.9],
    localQuaternion: quatFromEuler([0, 0, 35], DEFAULT_CONVENTIONS),
    color: '#f5a524',
  });
  const nose = vector({
    id: 'nose',
    name: 'Nose',
    frameId: 'body',
    components: [1.5, 0.55, 0.45],
  });
  const target = vector({
    id: 'target',
    name: 'Target',
    components: [-1.4, 2.3, 1.3],
    kind: 'point',
    color: '#22d3ee',
  });

  return {
    frames: { [GLOBAL_FRAME_ID]: globalFrame(), body },
    order: [GLOBAL_FRAME_ID, 'body'],
    selectedId: 'body',
    compareA: GLOBAL_FRAME_ID,
    compareB: 'body',
    conventions: DEFAULT_CONVENTIONS,
    vectors: { nose, target },
    vectorOrder: ['nose', 'target'],
    selectedVectorId: 'nose',
    vectorCompareA: 'nose',
    vectorCompareB: 'target',
    vectorCompareFrame: GLOBAL_FRAME_ID,
  };
};

describe('encodeScene / decodeScene', () => {
  it('round-trips a scene', () => {
    const out = decodeScene(encodeScene(scene()))!;
    expect(out).not.toBeNull();

    expect(out.order).toHaveLength(2);
    const body = Object.values(out.frames).find((f) => f.name === 'Body')!;
    expect(body.localPosition).toEqual([1.8, 0.9, 0.9]);
    expect(body.color).toBe('#f5a524');

    const names = out.vectorOrder.map((id) => out.vectors[id]!.name);
    expect(names).toEqual(['Nose', 'Target']);
    expect(out.vectors[out.vectorOrder[1]!]!.kind).toBe('point');
  });

  it('preserves the geometry, not just the fields', () => {
    // The real test of the codec: the frame tree has to resolve to the same world poses.
    const before = resolveWorldTransforms(scene().frames);
    const out = decodeScene(encodeScene(scene()))!;
    const after = resolveWorldTransforms(out.frames);

    const bodyBefore = before.body!;
    const bodyId = Object.keys(out.frames).find((id) => out.frames[id]!.name === 'Body')!;
    const bodyAfter = after[bodyId]!;

    bodyAfter.position.forEach((v, i) => expect(v).toBeCloseTo(bodyBefore.position[i]!, 6));
    bodyAfter.quaternion.forEach((v, i) => expect(v).toBeCloseTo(bodyBefore.quaternion[i]!, 6));
  });

  it('carries the vector selections, not just the vectors', () => {
    // The Setup panel calls this "the whole scene", so the comparison the sender set up
    // has to arrive intact rather than resetting to the first two vectors.
    const base = scene();
    base.selectedVectorId = 'target';
    base.vectorCompareA = 'target';
    base.vectorCompareB = 'nose';
    base.vectorCompareFrame = 'body';

    const out = decodeScene(encodeScene(base))!;
    const nameOf = (id: string | null) => (id ? out.vectors[id]?.name : null);

    expect(nameOf(out.selectedVectorId)).toBe('Target');
    expect(nameOf(out.vectorCompareA)).toBe('Target');
    expect(nameOf(out.vectorCompareB)).toBe('Nose');
    expect(out.frames[out.vectorCompareFrame]!.name).toBe('Body');
  });

  it('carries a hidden global frame', () => {
    const base = scene();
    base.frames[GLOBAL_FRAME_ID] = { ...base.frames[GLOBAL_FRAME_ID]!, visible: false };
    expect(decodeScene(encodeScene(base))!.frames[GLOBAL_FRAME_ID]!.visible).toBe(false);
  });

  it('preserves conventions', () => {
    const custom = {
      ...scene(),
      conventions: {
        upAxis: 'Y' as const,
        eulerOrder: 'XYZ' as const,
        rotationMode: 'extrinsic' as const,
        angleUnit: 'rad' as const,
      },
    };
    expect(decodeScene(encodeScene(custom))!.conventions).toEqual(custom.conventions);
  });

  it('survives non-ASCII names', () => {
    const named = scene();
    named.frames.body!.name = 'Körper — 機体 🛰';
    const out = decodeScene(encodeScene(named))!;
    expect(Object.values(out.frames).some((f) => f.name === 'Körper — 機体 🛰')).toBe(true);
  });

  it('keeps deep parent chains intact', () => {
    const base = scene();
    base.frames.arm = frame({ id: 'arm', name: 'Arm', parentId: 'body', localPosition: [1, 0, 0] });
    base.frames.hand = frame({ id: 'hand', name: 'Hand', parentId: 'arm', localPosition: [0, 1, 0] });
    base.order = [GLOBAL_FRAME_ID, 'body', 'arm', 'hand'];

    const out = decodeScene(encodeScene(base))!;
    const byName = Object.fromEntries(Object.values(out.frames).map((f) => [f.name, f]));
    expect(out.frames[byName.Arm!.parentId!]!.name).toBe('Body');
    expect(out.frames[byName.Hand!.parentId!]!.name).toBe('Arm');
  });

  it('produces a link that is short enough to actually share', () => {
    const link = sceneLink(scene(), 'https://example.com/Rotation-wizard/');
    expect(link.startsWith('https://example.com/Rotation-wizard/' + SCENE_HASH_PREFIX)).toBe(true);
    expect(link.length).toBeLessThan(700);
  });

  it('replaces an existing hash rather than appending to it', () => {
    const link = sceneLink(scene(), 'https://example.com/app/#s=stale');
    expect(link.split('#')).toHaveLength(2);
    expect(link.startsWith('https://example.com/app/#s=')).toBe(true);
  });
});

describe('decodeScene — bad input', () => {
  it('rejects junk instead of throwing', () => {
    expect(decodeScene('')).toBeNull();
    expect(decodeScene('not-base64!!')).toBeNull();
    expect(decodeScene(btoa('{"not":"a scene"}'))).toBeNull();
    expect(decodeScene(btoa('plain text'))).toBeNull();
  });

  it('rejects a payload from an unknown format version', () => {
    const bumped = JSON.parse(atob(encodeScene(scene()).replace(/-/g, '+').replace(/_/g, '/')));
    bumped.v = 999;
    expect(decodeScene(btoa(JSON.stringify(bumped)))).toBeNull();
  });

  it('rejects a truncated link rather than rendering a broken scene', () => {
    const encoded = encodeScene(scene());
    // Chat clients love to clip long URLs; every prefix must fail cleanly.
    for (const cut of [0.25, 0.5, 0.75, 0.9]) {
      expect(() => decodeScene(encoded.slice(0, Math.floor(encoded.length * cut)))).not.toThrow();
    }
  });

  it('repairs a structurally valid but nonsensical payload', () => {
    // Frames present but every field wrong: repair should still yield a usable scene.
    const hostile = btoa(
      JSON.stringify({
        v: 1,
        c: ['nonsense', 'nonsense', 'nonsense', 'nonsense'],
        f: [['Root', 5, 'x', null, NaN, 0, 0, 0, 0, '', 1]],
        vec: [['V', 99, 'a', 'b', 'c', 7, '', 1]],
        sel: 42,
        cmp: [9, 9],
      }),
    );
    const out = decodeScene(hostile);
    expect(out).not.toBeNull();
    const world = resolveWorldTransforms(out!.frames);
    for (const t of Object.values(world)) {
      expect(t.position.every(Number.isFinite)).toBe(true);
      expect(t.quaternion.every(Number.isFinite)).toBe(true);
    }
    expect(out!.conventions).toEqual(DEFAULT_CONVENTIONS);
  });
});

describe('sceneFromHash', () => {
  it('reads a scene out of a hash', () => {
    const hash = SCENE_HASH_PREFIX + encodeScene(scene());
    expect(sceneFromHash(hash)).not.toBeNull();
  });

  it('ignores hashes that are not scenes', () => {
    expect(sceneFromHash('')).toBeNull();
    expect(sceneFromHash('#section-2')).toBeNull();
    expect(sceneFromHash('#s=')).toBeNull();
  });
});
