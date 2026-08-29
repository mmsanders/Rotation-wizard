import type { AxisName } from './math/conventions';

/**
 * Axis colours, shared by the 3D scene and the readouts.
 *
 * Kept out of any component file so both layers import the same constant, and so neither
 * file has to export a non-component alongside its component.
 */
export const AXIS_COLORS: Record<AxisName, string> = {
  X: '#ff5a5f',
  Y: '#4ade80',
  Z: '#60a5fa',
};
