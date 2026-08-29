import { beforeEach, describe, expect, it } from 'vitest';
import { useSceneStore } from './useSceneStore';
import { GLOBAL_FRAME_ID } from '../types';

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
