import { type Vec2, angleDelta, distance2, forwardOf, headingOf, lerp, sub2, add2, scale2, length2 } from "./math";

const SAMPLES = 256;

/**
 * A ground path sampled by arc length, so "distance along the path" is exact
 * and speed stays even through curves.
 */
export class Path {
  readonly length: number;
  private readonly points: Vec2[];
  private readonly distances: number[];

  constructor(pointAtU: (u: number) => Vec2) {
    this.points = [];
    this.distances = [];
    let total = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const point = pointAtU(i / SAMPLES);
      if (i > 0) total += distance2(point, this.points[i - 1]);
      this.points.push(point);
      this.distances.push(total);
    }
    this.length = total;
  }

  pointAt(distance: number): Vec2 {
    const { index, fraction } = this.locate(distance);
    const a = this.points[index];
    const b = this.points[Math.min(index + 1, SAMPLES)];
    return [lerp(a[0], b[0], fraction), lerp(a[1], b[1], fraction)];
  }

  headingAt(distance: number): number {
    const step = Math.max(this.length / SAMPLES, 0.01);
    const behind = this.pointAt(Math.max(0, distance - step));
    const ahead = this.pointAt(Math.min(this.length, distance + step));
    const direction = sub2(ahead, behind);
    if (length2(direction) < 1e-6) return headingOf(sub2(this.points[SAMPLES], this.points[0]));
    return headingOf(direction);
  }

  /** Signed curvature (1/m). Positive turns toward +heading (the car's left). */
  curvatureAt(distance: number): number {
    const step = Math.max(this.length / 64, 0.25);
    if (this.length < step * 2) return 0;
    const from = Math.max(0, distance - step);
    const to = Math.min(this.length, distance + step);
    return angleDelta(this.headingAt(from), this.headingAt(to)) / (to - from);
  }

  private locate(distance: number) {
    if (distance <= 0) return { index: 0, fraction: 0 };
    if (distance >= this.length) return { index: SAMPLES - 1, fraction: 1 };
    let low = 0;
    let high = SAMPLES;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (this.distances[mid] <= distance) low = mid;
      else high = mid;
    }
    const span = this.distances[low + 1] - this.distances[low];
    return { index: low, fraction: span > 0 ? (distance - this.distances[low]) / span : 0 };
  }
}

/** Smooth curve from `start` (leaving along `startHeading`) to `end` (arriving along `endHeading`). */
export const bezierPath = (start: Vec2, startHeading: number, end: Vec2, endHeading?: number) => {
  const span = distance2(start, end);
  const handle = span / 3;
  const control1 = add2(start, scale2(forwardOf(startHeading), handle));
  const arrivalHeading = endHeading ?? headingOf(sub2(end, control1));
  const control2 = sub2(end, scale2(forwardOf(arrivalHeading), handle));
  return new Path((u) => {
    const inv = 1 - u;
    const a = inv * inv * inv;
    const b = 3 * inv * inv * u;
    const c = 3 * inv * u * u;
    const d = u * u * u;
    return [
      a * start[0] + b * control1[0] + c * control2[0] + d * end[0],
      a * start[1] + b * control1[1] + c * control2[1] + d * end[1],
    ];
  });
};

/** Centripetal Catmull-Rom through every point (never loops or overshoots between points). */
export const smoothPath = (points: Vec2[]) => {
  if (points.length < 2) throw new Error("A path needs at least 2 points");
  const padded = [
    add2(points[0], sub2(points[0], points[1])),
    ...points,
    add2(points[points.length - 1], sub2(points[points.length - 1], points[points.length - 2])),
  ];
  const segmentCount = points.length - 1;
  return new Path((u) => {
    const scaled = Math.min(u * segmentCount, segmentCount - 1e-9);
    const segment = Math.floor(scaled);
    return catmullRom(padded[segment], padded[segment + 1], padded[segment + 2], padded[segment + 3], scaled - segment);
  });
};

const catmullRom = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 => {
  const knot = (a: Vec2, b: Vec2) => Math.max(Math.sqrt(distance2(a, b)), 1e-4);
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const tt = lerp(t1, t2, t);
  const mix = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => {
    const w = (tt - ta) / (tb - ta);
    return [lerp(a[0], b[0], w), lerp(a[1], b[1], w)];
  };
  const a1 = mix(p0, p1, 0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, 0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
};

/** Points along a circular arc, for donuts, roundabouts and U-turns. Degrees use the heading convention. */
export const arcPoints = (center: Vec2, radius: number, fromDeg: number, toDeg: number, steps = 16): Vec2[] => {
  const points: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = lerp(fromDeg, toDeg, i / steps) * (Math.PI / 180);
    points.push([center[0] + Math.sin(angle) * radius, center[1] + Math.cos(angle) * radius]);
  }
  return points;
};
