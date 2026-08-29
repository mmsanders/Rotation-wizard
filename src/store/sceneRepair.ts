import {
  GLOBAL_FRAME_ID,
  type Conventions,
  type Frame,
  type Quat,
  type Vec3,
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

/** A zero-norm quaternion would render as a degenerate frame, so fall back to identity. */
const asQuat = (v: unknown): Quat => {
  if (Array.isArray(v) && v.length === 4 && v.every(isFiniteNumber)) {
    const [x, y, z, w] = v as Quat;
    if (Math.hypot(x, y, z, w) > 1e-9) return [x, y, z, w];
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

  // The root must exist, and must be a root.
  frames[GLOBAL_FRAME_ID] = { ...globalFrame(), ...frames[GLOBAL_FRAME_ID], parentId: null };

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

  return {
    frames,
    order,
    selectedId: valid(input.selectedId),
    compareA: valid(input.compareA),
    compareB: valid(input.compareB),
    conventions: sanitizeConventions(input.conventions),
  };
}
