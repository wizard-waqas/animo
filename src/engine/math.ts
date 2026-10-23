/** Ground positions are [x, z]. World positions are [x, y, z]. Y is up. */
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export const DEG = Math.PI / 180;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (value: number) => clamp(value, 0, 1);

/** 0..1 progress of `t` inside [start, end]. */
export const progress = (t: number, start: number, end: number) =>
  end <= start ? (t >= end ? 1 : 0) : clamp01((t - start) / (end - start));

export const add2 = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale2 = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const length2 = (a: Vec2) => Math.hypot(a[0], a[1]);
export const distance2 = (a: Vec2, b: Vec2) => length2(sub2(a, b));
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * Heading is the rotation around Y in radians.
 * heading 0 faces +Z (toward the default camera), heading 90° faces +X (screen right).
 */
export const headingOf = (direction: Vec2) => Math.atan2(direction[0], direction[1]);
export const forwardOf = (heading: number): Vec2 => [Math.sin(heading), Math.cos(heading)];

/** Rotate a local [x, z] offset by a heading (same rotation three.js applies with rotation.y). */
export const rotate2 = (local: Vec2, heading: number): Vec2 => {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return [local[0] * cos + local[1] * sin, -local[0] * sin + local[1] * cos];
};

/** Shortest signed angle from a to b. */
export const angleDelta = (a: number, b: number) => {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};
export const lerpAngle = (a: number, b: number, t: number) => a + angleDelta(a, b) * t;

/** Deterministic smooth noise in roughly [-1, 1] (sum of sines, no randomness). */
export const wobble = (t: number, seed = 0) =>
  (Math.sin(t * 13.1 + seed * 1.7) * 0.5 + Math.sin(t * 21.7 + seed * 3.1) * 0.3 + Math.sin(t * 37.3 + seed * 5.3) * 0.2);
