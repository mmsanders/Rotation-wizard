import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Text in the 3D scene, drawn as a canvas-texture sprite.
 *
 * Deliberately not drei's <Text>: that pulls a font over the network at runtime, which
 * means labels can silently fail to appear on a slow or offline connection. A canvas
 * texture is self-contained, uses the same system font stack as the rest of the UI, and
 * sprites billboard toward the camera for free.
 *
 * The canvas is sized from the *measured* text rather than fixed — a fixed square clips
 * anything longer than a character or two — and the measured aspect ratio is handed back
 * so the sprite can be scaled without stretching the glyphs.
 *
 * Textures are cached by content, so a scene full of frames still only builds a handful.
 */

type LabelTexture = { texture: THREE.Texture; aspect: number };

const cache = new Map<string, LabelTexture>();

const FONT_PX = 64;
const FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function labelTexture(text: string, color: string): LabelTexture {
  const key = `${text}|${color}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `bold ${FONT_PX}px ${FONT_STACK}`;

  // Measure first, then size the canvas to fit, with room for the outline stroke.
  let width = FONT_PX;
  if (ctx) {
    ctx.font = font;
    width = Math.ceil(ctx.measureText(text).width);
  }
  const padding = Math.round(FONT_PX * 0.28);
  canvas.width = Math.max(FONT_PX, width + padding * 2);
  canvas.height = Math.round(FONT_PX * 1.5);

  if (ctx) {
    // Resizing the canvas resets the context, so restate everything after.
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // Dark outline first, so labels stay readable over the grid and over each other.
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(4, 6, 12, 0.92)';
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const entry = { texture, aspect: canvas.width / canvas.height };
  cache.set(key, entry);
  return entry;
}

type Props = {
  text: string;
  color: string;
  position: [number, number, number];
  /** Cap height of the label in world units; width follows from the text. */
  scale?: number;
  opacity?: number;
};

export function Label({ text, color, position, scale = 0.34, opacity = 1 }: Props) {
  // Textures are shared through the cache and never disposed here: unmounting one label
  // must not blank every other label using the same glyph.
  const { texture, aspect } = useMemo(() => labelTexture(text, color), [text, color]);

  return (
    <sprite position={position} scale={[scale * aspect, scale, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthTest={false}
        depthWrite={false}
        sizeAttenuation
      />
    </sprite>
  );
}
