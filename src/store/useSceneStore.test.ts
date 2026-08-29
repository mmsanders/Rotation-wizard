import { beforeEach, describe, expect, it } from 'vitest';
import { useSceneStore } from './useSceneStore';
import { GLOBAL_FRAME_ID } from '../types';
import { IDENTITY_TRANSFORM, resolveWorldTransforms } from '../math/transforms';
import { vectorInFrame } from '../math/vectors';

const store = () => useSceneStore.getState();

describe('useSceneStore', () => {
  beforeEach(() => {
    store().resetScene();
  });

  it('starts with a global frame and one child selected', () => {
    const s = store();
    expect(s.frames[GLOBAL_FRAME_ID]).toBeDefined();
    expect(s.order[0]).toBe(GLOBAL_FRAME_ID);
    expect(s.selectedId).toBe('body');
    expect(s.compareA).toBe(GLOBAL_FRAME_ID);
    expect(s.compareB).toBe('body');
  });

  it('parents a new frame to the current selection', () => {
    store().selectFrame('body');
    const id = store().addFrame();
    expect(store().frames[id]!.parentId).toBe('body');
    expect(store().selectedId).toBe(id);
    // A new frame is most often compared against the frame it hangs off.
    expect(store().compareA).toBe('body');
    expect(store().compareB).toBe(id);
  });

  it('gives new frames distinct names and colours', () => {
    const a = store().addFrame(GLOBAL_FRAME_ID);
    const b = store().addFrame(GLOBAL_FRAME_ID);
    expect(store().frames[a]!.name).not.toBe(store().frames[b]!.name);
    expect(store().frames[a]!.color).not.toBe(store().frames[b]!.color);
  });

  it('refuses to delete the global frame', () => {
    store().removeFrame(GLOBAL_FRAME_ID);
    expect(store().frames[GLOBAL_FRAME_ID]).toBeDefined();
  });

  it('re-homes children onto the deleted frame’s parent instead of losing them', () => {
    const parent = store().addFrame(GLOBAL_FRAME_ID);
    const child = store().addFrame(parent);
    const grandchild = store().addFrame(child);

    store().removeFrame(child);

    expect(store().frames[child]).toBeUndefined();
    expect(store().frames[grandchild]).toBeDefined();
    expect(store().frames[grandchild]!.parentId).toBe(parent);
    expect(store().order).not.toContain(child);
  });

  it('moves selection and comparison off a deleted frame', () => {
    const id = store().addFrame(GLOBAL_FRAME_ID);
    store().setCompare('A', id);
    store().removeFrame(id);

    expect(store().selectedId).not.toBe(id);
    expect(store().frames[store().selectedId]).toBeDefined();
    expect(store().compareA).toBe(GLOBAL_FRAME_ID);
    expect(store().frames[store().compareB]).toBeDefined();
  });

  it('rejects a re-parent that would create a cycle', () => {
    const a = store().addFrame(GLOBAL_FRAME_ID);
    const b = store().addFrame(a);

    store().setParent(a, b); // a under its own child
    expect(store().frames[a]!.parentId).toBe(GLOBAL_FRAME_ID);

    store().setParent(a, a); // a under itself
    expect(store().frames[a]!.parentId).toBe(GLOBAL_FRAME_ID);
  });

  it('allows a legitimate re-parent', () => {
    const a = store().addFrame(GLOBAL_FRAME_ID);
    const b = store().addFrame(GLOBAL_FRAME_ID);
    store().setParent(b, a);
    expect(store().frames[b]!.parentId).toBe(a);
  });

  it('never re-parents the global frame', () => {
    const a = store().addFrame(GLOBAL_FRAME_ID);
    store().setParent(GLOBAL_FRAME_ID, a);
    expect(store().frames[GLOBAL_FRAME_ID]!.parentId).toBeNull();
  });

  it('swaps the comparison pair', () => {
    store().setCompare('A', GLOBAL_FRAME_ID);
    store().setCompare('B', 'body');
    store().swapCompare();
    expect(store().compareA).toBe('body');
    expect(store().compareB).toBe(GLOBAL_FRAME_ID);
  });

  it('resets a frame to its parent’s origin and orientation', () => {
    store().setLocalPosition('body', [5, 5, 5]);
    store().resetFrame('body');
    expect(store().frames.body!.localPosition).toEqual([0, 0, 0]);
    expect(store().frames.body!.localQuaternion).toEqual([0, 0, 0, 1]);
  });

  it('keeps conventions across a scene reset, since they are a preference not scene data', () => {
    store().setConventions({ upAxis: 'Y', angleUnit: 'rad' });
    store().addFrame(GLOBAL_FRAME_ID);
    store().resetScene();

    expect(store().conventions.upAxis).toBe('Y');
    expect(store().conventions.angleUnit).toBe('rad');
    expect(store().order).toEqual([GLOBAL_FRAME_ID, 'body']);
  });
});

describe('useSceneStore — vectors', () => {
  beforeEach(() => {
    store().resetScene();
  });

  it('seeds a direction and a point so the distinction is visible immediately', () => {
    const s = store();
    expect(s.vectorOrder).toEqual(['nose', 'target']);
    expect(s.vectors.nose!.kind).toBe('direction');
    expect(s.vectors.target!.kind).toBe('point');
    expect(s.selectedVectorId).toBe('nose');
  });

  it('adds a vector in the selected frame', () => {
    store().selectFrame('body');
    const id = store().addVector();
    expect(store().vectors[id]!.frameId).toBe('body');
    expect(store().selectedVectorId).toBe(id);
  });

  it('gives new vectors distinct names and colours', () => {
    const a = store().addVector(GLOBAL_FRAME_ID);
    const b = store().addVector(GLOBAL_FRAME_ID);
    expect(store().vectors[a]!.name).not.toBe(store().vectors[b]!.name);
    expect(store().vectors[a]!.color).not.toBe(store().vectors[b]!.color);
  });

  it('re-expresses components when a vector is moved to another frame', () => {
    // Body is yawed 35 deg from Global, so moving 'nose' to Global must keep it pointing
    // the same way in space — which means the numbers have to change.
    const before = store().vectors.nose!.components;
    store().setVectorFrame('nose', GLOBAL_FRAME_ID);
    const after = store().vectors.nose!.components;

    expect(store().vectors.nose!.frameId).toBe(GLOBAL_FRAME_ID);
    expect(after).not.toEqual(before);
    // A direction keeps its length through the change of frame.
    expect(Math.hypot(...after)).toBeCloseTo(Math.hypot(...before), 10);
    // A yaw about Z leaves the Z component alone and rotates X/Y by 35 deg.
    const rad = (35 * Math.PI) / 180;
    expect(after[0]).toBeCloseTo(before[0]! * Math.cos(rad) - before[1]! * Math.sin(rad), 8);
    expect(after[1]).toBeCloseTo(before[0]! * Math.sin(rad) + before[1]! * Math.cos(rad), 8);
    expect(after[2]).toBeCloseTo(before[2]!, 10);
  });

  it('keeps a vector where it is when its frame is deleted', () => {
    // Re-pointing the vector without converting would teleport it. Capture where it sits
    // in Global before the delete and require it to be unchanged after.
    const worldBefore = vectorInFrame(
      store().vectors.nose!.components,
      'direction',
      resolveWorldTransforms(store().frames).body!,
      IDENTITY_TRANSFORM,
    );

    store().removeFrame('body');

    const nose = store().vectors.nose!;
    expect(nose.frameId).toBe(GLOBAL_FRAME_ID);
    const worldAfter = vectorInFrame(
      nose.components,
      'direction',
      resolveWorldTransforms(store().frames)[GLOBAL_FRAME_ID]!,
      IDENTITY_TRANSFORM,
    );
    worldAfter.forEach((v, i) => expect(v).toBeCloseTo(worldBefore[i]!, 10));
  });

  it('switching kind keeps the typed components and changes what they mean', () => {
    store().setVectorKind('nose', 'point');
    expect(store().vectors.nose!.kind).toBe('point');
    expect(store().vectors.nose!.components).toEqual([1.5, 0.55, 0.45]);
  });

  it('moves selection and comparison off a deleted vector', () => {
    store().setVectorCompare('A', 'nose');
    store().removeVector('nose');
    expect(store().vectors.nose).toBeUndefined();
    expect(store().selectedVectorId).not.toBe('nose');
    expect(store().vectorCompareA).not.toBe('nose');
  });

  it('swaps the vector comparison pair', () => {
    store().setVectorCompare('A', 'nose');
    store().setVectorCompare('B', 'target');
    store().swapVectorCompare();
    expect(store().vectorCompareA).toBe('target');
    expect(store().vectorCompareB).toBe('nose');
  });

  it('refuses a comparison frame that does not exist', () => {
    store().setVectorCompareFrame('ghost');
    expect(store().vectorCompareFrame).toBe(GLOBAL_FRAME_ID);
    store().setVectorCompareFrame('body');
    expect(store().vectorCompareFrame).toBe('body');
  });
});
