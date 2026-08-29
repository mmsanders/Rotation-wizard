import { GLOBAL_FRAME_ID, type Frame, type SceneVector } from '../types';
import { repairPersistedScene, type ScenePersisted } from '../store/sceneRepair';

/**
 * Encoding a scene into a URL hash, so a setup moves between phone and desktop.
 *
 * The wire format is deliberately terse — records as positional arrays, frame ids remapped
 * to indices, floats rounded — because a link that wraps across three lines in a chat app
 * is a link people stop using. A typical scene lands in a few hundred characters, which is
 * comfortably inside every practical URL limit without needing compression.
 *
 * Decoding leans on `repairPersistedScene` rather than trusting the payload. A URL is even
 * less trustworthy than localStorage: it can be truncated by a chat client, hand-edited, or
 * simply produced by an older version of this app. Anything malformed degrades to a scene
 * that renders instead of a blank screen.
 */

/** Bumped only for changes the decoder cannot absorb; unknown versions are rejected. */
const FORMAT_VERSION = 1;

export const SCENE_HASH_PREFIX = '#s=';

/** Six decimals is well past what any readout shows, and keeps the link short. */
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

type EncodedFrame = [
  name: string,
  parentIndex: number,
  px: number,
  py: number,
  pz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  color: string,
  visible: 0 | 1,
];

type EncodedVector = [
  name: string,
  frameIndex: number,
  cx: number,
  cy: number,
  cz: number,
  kind: 0 | 1,
  color: string,
  visible: 0 | 1,
];

type EncodedScene = {
  v: number;
  c: [upAxis: string, eulerOrder: string, rotationMode: string, angleUnit: string];
  f: EncodedFrame[];
  vec: EncodedVector[];
  sel: number;
  cmp: [a: number, b: number];
};

// --- base64url over UTF-8, so names in any language survive the trip ---------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// --- encode -----------------------------------------------------------------------

export function encodeScene(scene: ScenePersisted): string {
  // Frames go out in `order`, which always starts with the global frame, so index 0 is
  // the root and parent pointers become small integers.
  const ids = scene.order.filter((id) => scene.frames[id]);
  const indexOf = new Map(ids.map((id, i) => [id, i]));

  const frames: EncodedFrame[] = ids.map((id) => {
    const frame = scene.frames[id] as Frame;
    return [
      frame.name,
      frame.parentId ? (indexOf.get(frame.parentId) ?? 0) : -1,
      round(frame.localPosition[0]),
      round(frame.localPosition[1]),
      round(frame.localPosition[2]),
      round(frame.localQuaternion[0]),
      round(frame.localQuaternion[1]),
      round(frame.localQuaternion[2]),
      round(frame.localQuaternion[3]),
      frame.color,
      frame.visible ? 1 : 0,
    ];
  });

  const vectorIds = scene.vectorOrder.filter((id) => scene.vectors[id]);
  const vectors: EncodedVector[] = vectorIds.map((id) => {
    const vector = scene.vectors[id] as SceneVector;
    return [
      vector.name,
      indexOf.get(vector.frameId) ?? 0,
      round(vector.components[0]),
      round(vector.components[1]),
      round(vector.components[2]),
      vector.kind === 'point' ? 1 : 0,
      vector.color,
      vector.visible ? 1 : 0,
    ];
  });

  const payload: EncodedScene = {
    v: FORMAT_VERSION,
    c: [
      scene.conventions.upAxis,
      scene.conventions.eulerOrder,
      scene.conventions.rotationMode,
      scene.conventions.angleUnit,
    ],
    f: frames,
    vec: vectors,
    sel: indexOf.get(scene.selectedId) ?? 0,
    cmp: [indexOf.get(scene.compareA) ?? 0, indexOf.get(scene.compareB) ?? 0],
  };

  return toBase64Url(JSON.stringify(payload));
}

/** Full shareable URL for a scene, based on the page's current location. */
export function sceneLink(scene: ScenePersisted, href: string): string {
  const base = href.split('#')[0] ?? href;
  return `${base}${SCENE_HASH_PREFIX}${encodeScene(scene)}`;
}

// --- decode -----------------------------------------------------------------------

/**
 * Decode an encoded scene, or null if it is unusable.
 *
 * Every failure mode ends up here: malformed base64, invalid JSON, a version this build
 * does not know, or a payload with no frames. The caller keeps its current scene.
 */
export function decodeScene(encoded: string): ScenePersisted | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const payload = parsed as Partial<EncodedScene>;
  if (payload.v !== FORMAT_VERSION) return null;
  if (!Array.isArray(payload.f) || payload.f.length === 0) return null;

  // Index 0 is the root by construction; give it the id the rest of the app expects.
  const idFor = (index: number) => (index === 0 ? GLOBAL_FRAME_ID : `frame-${index}`);

  const frames: Record<string, unknown> = {};
  const order: string[] = [];
  payload.f.forEach((entry, index) => {
    if (!Array.isArray(entry)) return;
    const [name, parentIndex, px, py, pz, qx, qy, qz, qw, color, visible] = entry;
    const id = idFor(index);
    order.push(id);
    frames[id] = {
      id,
      name,
      parentId:
        index === 0 || typeof parentIndex !== 'number' || parentIndex < 0
          ? null
          : idFor(parentIndex),
      localPosition: [px, py, pz],
      localQuaternion: [qx, qy, qz, qw],
      color,
      visible: visible !== 0,
    };
  });

  const vectors: Record<string, unknown> = {};
  const vectorOrder: string[] = [];
  (Array.isArray(payload.vec) ? payload.vec : []).forEach((entry, index) => {
    if (!Array.isArray(entry)) return;
    const [name, frameIndex, cx, cy, cz, kind, color, visible] = entry;
    const id = `vector-${index}`;
    vectorOrder.push(id);
    vectors[id] = {
      id,
      name,
      frameId: idFor(typeof frameIndex === 'number' ? frameIndex : 0),
      components: [cx, cy, cz],
      kind: kind === 1 ? 'point' : 'direction',
      color,
      visible: visible !== 0,
    };
  });

  const conventions = Array.isArray(payload.c) ? payload.c : [];
  const compare = Array.isArray(payload.cmp) ? payload.cmp : [];

  // Hand the reconstructed shape to the same repair the store uses on rehydrate, so a
  // hostile or truncated link cannot produce a scene that fails to render.
  return repairPersistedScene({
    frames,
    order,
    vectors,
    vectorOrder,
    selectedId: idFor(typeof payload.sel === 'number' ? payload.sel : 0),
    compareA: idFor(typeof compare[0] === 'number' ? compare[0] : 0),
    compareB: idFor(typeof compare[1] === 'number' ? compare[1] : 0),
    vectorCompareA: vectorOrder[0] ?? null,
    vectorCompareB: vectorOrder[1] ?? vectorOrder[0] ?? null,
    vectorCompareFrame: GLOBAL_FRAME_ID,
    selectedVectorId: vectorOrder[0] ?? null,
    conventions: {
      upAxis: conventions[0],
      eulerOrder: conventions[1],
      rotationMode: conventions[2],
      angleUnit: conventions[3],
    },
  });
}

/** Pull an encoded scene out of a location hash, if there is one. */
export function sceneFromHash(hash: string): ScenePersisted | null {
  if (!hash.startsWith(SCENE_HASH_PREFIX)) return null;
  return decodeScene(hash.slice(SCENE_HASH_PREFIX.length));
}
