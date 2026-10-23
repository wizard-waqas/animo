import { clamp01 } from "./math";

/**
 * Easing curves map 0..1 progress to 0..1 distance.
 * Movement eases never overshoot, so nothing ever drives backwards by accident.
 */
export const EASE_NAMES = ["linear", "smooth", "in", "out", "cruise", "arrive", "depart"] as const;
export type EaseName = (typeof EASE_NAMES)[number];

const RAMP = 0.25;
const ARRIVE_RAMP = 0.45;

/** Trapezoid speed profile: speed up, cruise, slow down. */
const cruise = (u: number) => {
  const topSpeed = 1 / (1 - RAMP);
  if (u < RAMP) return (topSpeed * u * u) / (2 * RAMP);
  if (u < 1 - RAMP) return topSpeed * (RAMP / 2 + (u - RAMP));
  const remaining = 1 - u;
  return 1 - (topSpeed * remaining * remaining) / (2 * RAMP);
};

/** Already moving at full speed, then brakes to a stop. */
const arrive = (u: number) => {
  const topSpeed = 1 / (1 - ARRIVE_RAMP / 2);
  if (u < 1 - ARRIVE_RAMP) return topSpeed * u;
  const remaining = 1 - u;
  return 1 - (topSpeed * remaining * remaining) / (2 * ARRIVE_RAMP);
};

/** Starts from a stop and leaves at full speed. */
const depart = (u: number) => 1 - arrive(1 - u);

const EASES: Record<EaseName, (u: number) => number> = {
  linear: (u) => u,
  // Quintic "smootherstep": acceleration is continuous too, so there's no hitch at the midpoint.
  smooth: (u) => u * u * u * (u * (u * 6 - 15) + 10),
  in: (u) => u * u * u,
  out: (u) => 1 - Math.pow(1 - u, 3),
  cruise,
  arrive,
  depart,
};

export const ease = (name: EaseName, u: number) => EASES[name](clamp01(u));

/** Cartoony pop: overshoots then settles. For scale/rotation only, never for distance. */
export const easeOutBack = (u: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(u);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
