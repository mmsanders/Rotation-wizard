import {
  GLOBAL_FRAME_ID,
  type Conventions,
  type Frame,
  type Quat,
  type SceneVector,
  type Vec3,
  type VectorKind,
} from '../types';
import { DEFAULT_CONVENTIONS, EULER_ORDERS } from '../math/conventions';
import { wouldCreateCycle } from '../math/transforms';

/**
 * Repair of persisted scenes.
 *
 * localStorage is the one place untrusted data enters the store: it can be stale from an
 * older build, hand-edited, or truncated. A corrupt payload must never leave the app on a
 * blank screen with no way back, so everything here degrades to a working scene instead
 * of throwing.
 *
 * Kept separate from the store itself so it can be tested without instantiating zustand
 * or touching browser storage.
 */

export type ScenePersisted = {
  frames: Record<string, Frame>;
  order: string[];
  selectedId: string;
  compareA: string;
  compareB: string;
  conventions: Conventions;
  vectors: Record<string, SceneVector>;
  vectorOrder: string[];
  selectedVectorId: string | null;
  vectorCompareA: string | null;
  vectorCompareB: string | null;
  vectorCompareFrame: string;
};

export function globalFrame(): Frame {
  return {
    id: GLOBAL_FRAME_ID,
    name: 'Global',
    parentId: null,
    localPosition: [0, 0, 0],
    localQuaternion: [0, 0, 0, 1],
    color: '#94a3b8',
    visible: true,
  };
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const asVec3 = (v: unknown, fallback: Vec3): Vec3 => {
  if (Array.isArray(v) && v.length === 3 && v.every(isFiniteNumber)) {
    const [x, y, z] = v as [number, number, number];
    return [x, y, z];
  }
  return fallback;
};

/**
 * Coerce stored data into a *unit* quaternion.
 *
 * Normalising is not cosmetic. A non-unit quaternion is not a rotation: three.js composes
 * it into a matrix that also scales, so the frame's axes come out the wrong length and the
 * Euler, axis-angle and matrix readouts are all quietly wrong — in the one function whose
 * whole contract is that whatever it returns will render correctly. A zero-norm quaternion
 * has no direction to recover, so that falls back to identity.
 */
const asQuat = (v: unknown): Quat => {
  if (Array.isArray(v) && v.length === 4 && v.every(isFiniteNumber)) {
    const [x, y, z, w] = v as Quat;
    const norm = Math.hypot(x, y, z, w);
    if (norm > 1e-9) return [x / norm, y / norm, z / norm, w / norm];
  }
  return [0, 0, 0, 1];
};

function sanitizeFrame(id: string, raw: unknown): Frame | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Partial<Frame>;
  return {
    id,
    name: typeof f.name === 'string' && f.name.trim() ? f.name : id,
    parentId: typeof f.parentId === 'string' ? f.parentId : null,
    localPosition: asVec3(f.localPosition, [0, 0, 0]),
    localQuaternion: asQuat(f.localQuaternion),
    color: typeof f.color === 'string' && f.color ? f.color : '#94a3b8',
    visible: f.visible !== false,
  };
}

function sanitizeVector(id: string, raw: unknown, frameIds: Set<string>): SceneVector | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Partial<SceneVector>;
  const kind: VectorKind = v.kind === 'point' ? 'point' : 'direction';
  return {
    id,
    name: typeof v.name === 'string' && v.name.trim() ? v.name : id,
    // A vector whose frame has gone is meaningless where it stands, so it falls back to
    // the root rather than being dropped — losing data silently is worse than moving it.
    frameId: typeof v.frameId === 'string' && frameIds.has(v.frameId) ? v.frameId : GLOBAL_FRAME_ID,
    components: asVec3(v.components, [1, 0, 0]),
    kind,
    color: typeof v.color === 'string' && v.color ? v.color : '#fbbf24',
    visible: v.visible !== false,
  };
}

function sanitizeConventions(raw: unknown): Conventions {
  const c = (raw ?? {}) as Partial<Conventions>;
  return {
    upAxis: c.upAxis === 'Y' ? 'Y' : 'Z',
    eulerOrder:
      c.eulerOrder && EULER_ORDERS.includes(c.eulerOrder)
        ? c.eulerOrder
        : DEFAULT_CONVENTIONS.eulerOrder,
    rotationMode: c.rotationMode === 'extrinsic' ? 'extrinsic' : 'intrinsic',
    angleUnit: c.angleUnit === 'rad' ? 'rad' : 'deg',
  };
}

/**
 * Turn whatever came out of storage into a scene that is guaranteed to render.
 *
 * Returns null only when the payload has no usable frames at all, letting the caller
 * fall back to a fresh scene.
 */
export function repairPersistedScene(saved: unknown): ScenePersisted | null {
  if (!saved || typeof saved !== 'object') return null;
  const input = saved as Partial<ScenePersisted>;
  if (!input.frames || typeof input.frames !== 'object') return null;

  const frames: Record<string, Frame> = {};
  for (const [id, raw] of Object.entries(input.frames)) {
    const frame = sanitizeFrame(id, raw);
    if (frame) frames[id] = frame;
  }
  if (Object.keys(frames).length === 0) return null;

  /**
   * The root must exist, be parentless, *and* sit at the identity pose.
   *
   * Everything in the scene is ultimately measured against this frame, so a stored global
   * frame carrying an offset or rotation would silently shift every readout in the app.
   * Only its cosmetic fields are allowed through.
   */
  const storedGlobal = frames[GLOBAL_FRAME_ID];
  frames[GLOBAL_FRAME_ID] = {
    ...globalFrame(),
    ...(storedGlobal ? { name: storedGlobal.name, color: storedGlobal.color } : {}),
    parentId: null,
    localPosition: [0, 0, 0],
    localQuaternion: [0, 0, 0, 1],
  };

  // Re-home frames whose parent no longer exists.
  for (const [id, frame] of Object.entries(frames)) {
    if (id === GLOBAL_FRAME_ID) continue;
    if (!frame.parentId || !frames[frame.parentId]) {
      frames[id] = { ...frame, parentId: GLOBAL_FRAME_ID };
    }
  }

  // Break any parent cycle that made it into storage.
  for (const id of Object.keys(frames)) {
    if (id === GLOBAL_FRAME_ID) continue;
    if (wouldCreateCycle(frames, id, frames[id]!.parentId)) {
      frames[id] = { ...frames[id]!, parentId: GLOBAL_FRAME_ID };
    }
  }

  // Global first, then the saved order, then anything the saved order forgot.
  const savedOrder = Array.isArray(input.order) ? input.order : [];
  const seen = new Set<string>([GLOBAL_FRAME_ID]);
  const order = [GLOBAL_FRAME_ID];
  for (const id of savedOrder) {
    if (frames[id] && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const id of Object.keys(frames)) {
    if (!seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }

  const valid = (id: unknown): string =>
    typeof id === 'string' && frames[id] ? id : GLOBAL_FRAME_ID;

  // Vectors, sanitised against the frame set that survived repair above.
  const frameIds = new Set(Object.keys(frames));
  const vectors: Record<string, SceneVector> = {};
  for (const [id, raw] of Object.entries(input.vectors ?? {})) {
    const vector = sanitizeVector(id, raw, frameIds);
    if (vector) vectors[id] = vector;
  }

  const savedVectorOrder = Array.isArray(input.vectorOrder) ? input.vectorOrder : [];
  const seenVectors = new Set<string>();
  const vectorOrder: string[] = [];
  for (const id of [...savedVectorOrder, ...Object.keys(vectors)]) {
    if (vectors[id] && !seenVectors.has(id)) {
      vectorOrder.push(id);
      seenVectors.add(id);
    }
  }

  const validVector = (id: unknown): string | null =>
    typeof id === 'string' && vectors[id] ? id : (vectorOrder[0] ?? null);

  return {
    frames,
    order,
    selectedId: valid(input.selectedId),
    compareA: valid(input.compareA),
    compareB: valid(input.compareB),
    conventions: sanitizeConventions(input.conventions),
    vectors,
    vectorOrder,
    selectedVectorId: validVector(input.selectedVectorId),
    vectorCompareA: validVector(input.vectorCompareA),
    vectorCompareB: validVector(input.vectorCompareB),
    vectorCompareFrame: valid(input.vectorCompareFrame),
  };
}
