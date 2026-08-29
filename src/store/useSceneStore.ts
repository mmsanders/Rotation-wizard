import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GLOBAL_FRAME_ID, type Conventions, type Frame, type Quat, type Vec3 } from '../types';
import { DEFAULT_CONVENTIONS, quatFromEuler } from '../math/conventions';
import { wouldCreateCycle } from '../math/transforms';
import { globalFrame, repairPersistedScene } from './sceneRepair';

/**
 * Scene state.
 *
 * Frames are stored flat and keyed by id, with parenting expressed as a `parentId`
 * pointer. World transforms are derived (see math/transforms.resolveWorldTransforms)
 * rather than stored, so there is exactly one source of truth per frame.
 */

const FRAME_COLORS = [
  '#f5a524',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#14b8a6',
  '#8b5cf6',
];

export type SceneState = {
  frames: Record<string, Frame>;
  /** Display order in the frame list; the global frame is always first. */
  order: string[];
  selectedId: string;
  /** The two frames being compared in the relative readout. */
  compareA: string;
  compareB: string;
  conventions: Conventions;

  selectFrame: (id: string) => void;
  addFrame: (parentId?: string) => string;
  removeFrame: (id: string) => void;
  renameFrame: (id: string, name: string) => void;
  setParent: (id: string, parentId: string) => void;
  setLocalPosition: (id: string, position: Vec3) => void;
  setLocalQuaternion: (id: string, quaternion: Quat) => void;
  toggleVisible: (id: string) => void;
  resetFrame: (id: string) => void;
  setCompare: (slot: 'A' | 'B', id: string) => void;
  swapCompare: () => void;
  setConventions: (patch: Partial<Conventions>) => void;
  resetScene: () => void;
};

let frameCounter = 0;
const nextId = () => `frame-${Date.now().toString(36)}-${(frameCounter++).toString(36)}`;

/** A fresh scene: the global frame plus one child, yawed so the axes are legible at a glance. */
function initialScene(): Pick<SceneState, 'frames' | 'order' | 'selectedId' | 'compareA' | 'compareB'> {
  const body: Frame = {
    id: 'body',
    name: 'Body',
    parentId: GLOBAL_FRAME_ID,
    localPosition: [1.8, 0.9, 0.9],
    localQuaternion: quatFromEuler([0, 0, 35], DEFAULT_CONVENTIONS),
    color: FRAME_COLORS[0]!,
    visible: true,
  };
  const root = globalFrame();
  return {
    frames: { [root.id]: root, [body.id]: body },
    order: [root.id, body.id],
    selectedId: body.id,
    compareA: root.id,
    compareB: body.id,
  };
}

/** Pick the least-used colour, so new frames stay visually distinct. */
function pickColor(frames: Record<string, Frame>): string {
  const used = new Set(Object.values(frames).map((f) => f.color));
  return FRAME_COLORS.find((c) => !used.has(c)) ?? FRAME_COLORS[0]!;
}

/** Names must be unique enough to tell apart in the compare pickers. */
function uniqueName(frames: Record<string, Frame>, base: string): string {
  const taken = new Set(Object.values(frames).map((f) => f.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const useSceneStore = create<SceneState>()(
  persist(
    (set, get) => ({
      ...initialScene(),
      conventions: DEFAULT_CONVENTIONS,

      selectFrame: (id) => set({ selectedId: id }),

      addFrame: (parentId) => {
        const id = nextId();
        set((state) => {
          const parent =
            parentId && state.frames[parentId] ? parentId : (state.selectedId ?? GLOBAL_FRAME_ID);
          const frame: Frame = {
            id,
            name: uniqueName(state.frames, `Frame ${state.order.length}`),
            parentId: state.frames[parent] ? parent : GLOBAL_FRAME_ID,
            localPosition: [1, 0, 0],
            localQuaternion: [0, 0, 0, 1],
            color: pickColor(state.frames),
            visible: true,
          };
          return {
            frames: { ...state.frames, [id]: frame },
            order: [...state.order, id],
            selectedId: id,
            // Comparing a brand new frame against its own parent is the usual next question.
            compareA: frame.parentId ?? GLOBAL_FRAME_ID,
            compareB: id,
          };
        });
        return id;
      },

      removeFrame: (id) =>
        set((state) => {
          if (id === GLOBAL_FRAME_ID || !state.frames[id]) return state;

          // Re-home orphans onto the deleted frame's parent so the tree stays connected
          // and nothing silently disappears from the scene.
          const inheritedParent = state.frames[id]?.parentId ?? GLOBAL_FRAME_ID;
          const frames: Record<string, Frame> = {};
          for (const [key, frame] of Object.entries(state.frames)) {
            if (key === id) continue;
            frames[key] =
              frame.parentId === id ? { ...frame, parentId: inheritedParent } : frame;
          }

          const order = state.order.filter((f) => f !== id);
          const fallback = order[order.length - 1] ?? GLOBAL_FRAME_ID;
          return {
            frames,
            order,
            selectedId: state.selectedId === id ? fallback : state.selectedId,
            compareA: state.compareA === id ? GLOBAL_FRAME_ID : state.compareA,
            compareB: state.compareB === id ? fallback : state.compareB,
          };
        }),

      renameFrame: (id, name) =>
        set((state) => {
          const frame = state.frames[id];
          if (!frame) return state;
          return { frames: { ...state.frames, [id]: { ...frame, name } } };
        }),

      setParent: (id, parentId) =>
        set((state) => {
          const frame = state.frames[id];
          // Refuse anything that would make the tree cyclic. The UI disables these
          // options too; this is the backstop.
          if (!frame || id === GLOBAL_FRAME_ID) return state;
          if (!state.frames[parentId]) return state;
          if (wouldCreateCycle(state.frames, id, parentId)) return state;
          return { frames: { ...state.frames, [id]: { ...frame, parentId } } };
        }),

      setLocalPosition: (id, localPosition) =>
        set((state) => {
          const frame = state.frames[id];
          if (!frame) return state;
          return { frames: { ...state.frames, [id]: { ...frame, localPosition } } };
        }),

      setLocalQuaternion: (id, localQuaternion) =>
        set((state) => {
          const frame = state.frames[id];
          if (!frame) return state;
          return { frames: { ...state.frames, [id]: { ...frame, localQuaternion } } };
        }),

      toggleVisible: (id) =>
        set((state) => {
          const frame = state.frames[id];
          if (!frame) return state;
          return { frames: { ...state.frames, [id]: { ...frame, visible: !frame.visible } } };
        }),

      resetFrame: (id) =>
        set((state) => {
          const frame = state.frames[id];
          if (!frame) return state;
          return {
            frames: {
              ...state.frames,
              [id]: { ...frame, localPosition: [0, 0, 0], localQuaternion: [0, 0, 0, 1] },
            },
          };
        }),

      setCompare: (slot, id) => set(slot === 'A' ? { compareA: id } : { compareB: id }),

      swapCompare: () => set((state) => ({ compareA: state.compareB, compareB: state.compareA })),

      setConventions: (patch) =>
        set((state) => ({ conventions: { ...state.conventions, ...patch } })),

      resetScene: () => set({ ...initialScene(), conventions: get().conventions }),
    }),
    {
      name: 'rotation-wizard/scene',
      version: 1,
      partialize: (state) => ({
        frames: state.frames,
        order: state.order,
        selectedId: state.selectedId,
        compareA: state.compareA,
        compareB: state.compareB,
        conventions: state.conventions,
      }),
      /**
       * Rehydration is the one place untrusted data enters the store. `repairPersistedScene`
       * degrades a corrupt payload into a working scene rather than throwing; if there is
       * nothing salvageable we keep the fresh scene we started with.
       */
      merge: (persisted, current) => {
        const repaired = repairPersistedScene(persisted);
        return repaired ? { ...current, ...repaired } : current;
      },
    },
  ),
);
