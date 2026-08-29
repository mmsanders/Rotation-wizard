import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  GLOBAL_FRAME_ID,
  type Conventions,
  type Frame,
  type Quat,
  type SceneVector,
  type Vec3,
  type VectorKind,
} from '../types';
import { DEFAULT_CONVENTIONS, quatFromEuler } from '../math/conventions';
import { resolveWorldTransforms, wouldCreateCycle } from '../math/transforms';
import { vectorInFrame } from '../math/vectors';
import { globalFrame, repairPersistedScene, type ScenePersisted } from './sceneRepair';

/**
 * Scene state.
 *
 * Frames are stored flat and keyed by id, with parenting expressed as a `parentId`
 * pointer. World transforms are derived (see math/transforms.resolveWorldTransforms)
 * rather than stored, so there is exactly one source of truth per frame.
 *
 * Vectors hang off a frame the same way: components are stored in that frame's axes, and
 * everything else is derived.
 */

const VECTOR_COLORS = ['#fbbf24', '#22d3ee', '#f472b6', '#a3e635', '#c084fc', '#fb923c'];

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

  vectors: Record<string, SceneVector>;
  vectorOrder: string[];
  /** null when the scene has no vectors at all. */
  selectedVectorId: string | null;
  /** The two vectors being compared in the angle readout. */
  vectorCompareA: string | null;
  vectorCompareB: string | null;
  /** Frame the angle comparison is evaluated in. */
  vectorCompareFrame: string;

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
  /** Replace the whole scene — used by the shareable-link importer. */
  loadScene: (scene: ScenePersisted) => void;

  selectVector: (id: string) => void;
  addVector: (frameId?: string) => string;
  removeVector: (id: string) => void;
  renameVector: (id: string, name: string) => void;
  setVectorFrame: (id: string, frameId: string) => void;
  setVectorComponents: (id: string, components: Vec3) => void;
  setVectorKind: (id: string, kind: VectorKind) => void;
  toggleVectorVisible: (id: string) => void;
  setVectorCompare: (slot: 'A' | 'B', id: string) => void;
  swapVectorCompare: () => void;
  setVectorCompareFrame: (frameId: string) => void;
};

let idCounter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

type SceneSlice = Pick<
  SceneState,
  | 'frames'
  | 'order'
  | 'selectedId'
  | 'compareA'
  | 'compareB'
  | 'vectors'
  | 'vectorOrder'
  | 'selectedVectorId'
  | 'vectorCompareA'
  | 'vectorCompareB'
  | 'vectorCompareFrame'
>;

/**
 * A fresh scene: the global frame plus one child yawed so the axes are legible at a
 * glance, and one vector in each frame so the direction/point distinction is visible
 * without having to build a scene first.
 */
function initialScene(): SceneSlice {
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

  const nose: SceneVector = {
    id: 'nose',
    name: 'Nose',
    frameId: body.id,
    components: [1.5, 0.55, 0.45],
    kind: 'direction',
    color: VECTOR_COLORS[0]!,
    visible: true,
  };
  const target: SceneVector = {
    id: 'target',
    name: 'Target',
    frameId: GLOBAL_FRAME_ID,
    components: [-1.4, 2.3, 1.3],
    kind: 'point',
    color: VECTOR_COLORS[1]!,
    visible: true,
  };

  return {
    frames: { [root.id]: root, [body.id]: body },
    order: [root.id, body.id],
    selectedId: body.id,
    compareA: root.id,
    compareB: body.id,
    vectors: { [nose.id]: nose, [target.id]: target },
    vectorOrder: [nose.id, target.id],
    selectedVectorId: nose.id,
    vectorCompareA: nose.id,
    vectorCompareB: target.id,
    vectorCompareFrame: GLOBAL_FRAME_ID,
  };
}

/** Pick the least-used colour, so new items stay visually distinct. */
function pickColor(existing: { color: string }[], palette: string[]): string {
  const used = new Set(existing.map((item) => item.color));
  return palette.find((c) => !used.has(c)) ?? palette[0]!;
}

/** Names must be unique enough to tell apart in the compare pickers. */
function uniqueName(existing: { name: string }[], base: string): string {
  const taken = new Set(existing.map((item) => item.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The persistable part of the current state.
 *
 * Shared by the persist middleware and the link encoder so the two can never disagree
 * about what a scene consists of.
 */
export function sceneSnapshot(state: SceneState): ScenePersisted {
  return {
    frames: state.frames,
    order: state.order,
    selectedId: state.selectedId,
    compareA: state.compareA,
    compareB: state.compareB,
    conventions: state.conventions,
    vectors: state.vectors,
    vectorOrder: state.vectorOrder,
    selectedVectorId: state.selectedVectorId,
    vectorCompareA: state.vectorCompareA,
    vectorCompareB: state.vectorCompareB,
    vectorCompareFrame: state.vectorCompareFrame,
  };
}

export const useSceneStore = create<SceneState>()(
  persist(
    (set, get) => ({
      ...initialScene(),
      conventions: DEFAULT_CONVENTIONS,

      selectFrame: (id) => set({ selectedId: id }),

      addFrame: (parentId) => {
        const id = nextId('frame');
        set((state) => {
          const parent =
            parentId && state.frames[parentId] ? parentId : (state.selectedId ?? GLOBAL_FRAME_ID);
          const frame: Frame = {
            id,
            name: uniqueName(Object.values(state.frames), `Frame ${state.order.length}`),
            parentId: state.frames[parent] ? parent : GLOBAL_FRAME_ID,
            localPosition: [1, 0, 0],
            localQuaternion: [0, 0, 0, 1],
            color: pickColor(Object.values(state.frames), FRAME_COLORS),
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

          /**
           * Re-express vectors defined in the deleted frame, rather than just re-pointing
           * them. Their components only mean something relative to a frame, so moving them
           * to the inherited parent unchanged would silently teleport them; converting the
           * components leaves each vector exactly where it was in space.
           */
          const worldBefore = resolveWorldTransforms(state.frames);
          const worldAfter = resolveWorldTransforms(frames);
          const vectors: Record<string, SceneVector> = {};
          for (const [key, vector] of Object.entries(state.vectors)) {
            if (vector.frameId !== id) {
              vectors[key] = vector;
              continue;
            }
            const from = worldBefore[id];
            const to = worldAfter[inheritedParent] ?? worldAfter[GLOBAL_FRAME_ID];
            vectors[key] =
              from && to
                ? {
                    ...vector,
                    frameId: inheritedParent,
                    components: vectorInFrame(vector.components, vector.kind, from, to),
                  }
                : { ...vector, frameId: inheritedParent };
          }

          return {
            frames,
            order,
            vectors,
            selectedId: state.selectedId === id ? fallback : state.selectedId,
            compareA: state.compareA === id ? GLOBAL_FRAME_ID : state.compareA,
            compareB: state.compareB === id ? fallback : state.compareB,
            vectorCompareFrame:
              state.vectorCompareFrame === id ? GLOBAL_FRAME_ID : state.vectorCompareFrame,
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

      loadScene: (scene) => set({ ...scene }),

      // --- vectors ------------------------------------------------------------------

      selectVector: (id) => set({ selectedVectorId: id }),

      addVector: (frameId) => {
        const id = nextId('vector');
        set((state) => {
          const frame =
            frameId && state.frames[frameId] ? frameId : (state.selectedId ?? GLOBAL_FRAME_ID);
          const vector: SceneVector = {
            id,
            name: uniqueName(Object.values(state.vectors), `Vector ${state.vectorOrder.length + 1}`),
            frameId: state.frames[frame] ? frame : GLOBAL_FRAME_ID,
            components: [1, 0, 0],
            kind: 'direction',
            color: pickColor(Object.values(state.vectors), VECTOR_COLORS),
            visible: true,
          };
          return {
            vectors: { ...state.vectors, [id]: vector },
            vectorOrder: [...state.vectorOrder, id],
            selectedVectorId: id,
            // Comparing the new vector against the previous one is the usual next question.
            vectorCompareA: state.vectorCompareA ?? state.vectorOrder[0] ?? id,
            vectorCompareB: id,
          };
        });
        return id;
      },

      removeVector: (id) =>
        set((state) => {
          if (!state.vectors[id]) return state;
          const vectors = { ...state.vectors };
          delete vectors[id];
          const vectorOrder = state.vectorOrder.filter((v) => v !== id);
          const fallback = vectorOrder[vectorOrder.length - 1] ?? null;
          return {
            vectors,
            vectorOrder,
            selectedVectorId: state.selectedVectorId === id ? fallback : state.selectedVectorId,
            vectorCompareA: state.vectorCompareA === id ? fallback : state.vectorCompareA,
            vectorCompareB: state.vectorCompareB === id ? fallback : state.vectorCompareB,
          };
        }),

      renameVector: (id, name) =>
        set((state) => {
          const vector = state.vectors[id];
          if (!vector) return state;
          return { vectors: { ...state.vectors, [id]: { ...vector, name } } };
        }),

      /**
       * Re-home a vector, keeping it where it is in space.
       *
       * Components mean nothing without a frame, so the components are converted into the
       * new frame rather than carried over verbatim — otherwise picking a different frame
       * from the dropdown would move the vector, which is not what "expressed in" means.
       */
      setVectorFrame: (id, frameId) =>
        set((state) => {
          const vector = state.vectors[id];
          if (!vector || !state.frames[frameId]) return state;

          const world = resolveWorldTransforms(state.frames);
          const from = world[vector.frameId];
          const to = world[frameId];
          const components =
            from && to ? vectorInFrame(vector.components, vector.kind, from, to) : vector.components;

          return { vectors: { ...state.vectors, [id]: { ...vector, frameId, components } } };
        }),

      setVectorComponents: (id, components) =>
        set((state) => {
          const vector = state.vectors[id];
          if (!vector) return state;
          return { vectors: { ...state.vectors, [id]: { ...vector, components } } };
        }),

      /**
       * Switching kind keeps the components and changes their meaning.
       *
       * The alternative — preserving the world position across the switch — would rewrite
       * the numbers the user typed. Here the numbers stay put and what they denote changes,
       * which is the point of the toggle: you can watch the same triple read differently in
       * another frame.
       */
      setVectorKind: (id, kind) =>
        set((state) => {
          const vector = state.vectors[id];
          if (!vector) return state;
          return { vectors: { ...state.vectors, [id]: { ...vector, kind } } };
        }),

      toggleVectorVisible: (id) =>
        set((state) => {
          const vector = state.vectors[id];
          if (!vector) return state;
          return { vectors: { ...state.vectors, [id]: { ...vector, visible: !vector.visible } } };
        }),

      setVectorCompare: (slot, id) =>
        set(slot === 'A' ? { vectorCompareA: id } : { vectorCompareB: id }),

      swapVectorCompare: () =>
        set((state) => ({
          vectorCompareA: state.vectorCompareB,
          vectorCompareB: state.vectorCompareA,
        })),

      setVectorCompareFrame: (frameId) =>
        set((state) => (state.frames[frameId] ? { vectorCompareFrame: frameId } : state)),
    }),
    {
      name: 'rotation-wizard/scene',
      version: 2,
      partialize: sceneSnapshot,
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
