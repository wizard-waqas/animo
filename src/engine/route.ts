import { type Vec2, distance2, rotate2, sub2, add2 } from "./math";

/** A rectangle on the ground (a parked car's footprint). */
export interface Obstacle { center: Vec2; heading: number; halfWidth: number; halfLength: number }

const CLEARANCE = 0.45;

/** Expanded corners in world space, so walkers keep a little distance from the car. */
const cornersOf = (obstacle: Obstacle): Vec2[] => {
  const w = obstacle.halfWidth + CLEARANCE;
  const l = obstacle.halfLength + CLEARANCE;
  return ([[w, l], [-w, l], [-w, -l], [w, -l]] as Vec2[]).map((corner) => add2(obstacle.center, rotate2(corner, obstacle.heading)));
};

const toLocal = (point: Vec2, obstacle: Obstacle) => rotate2(sub2(point, obstacle.center), -obstacle.heading);

const isInside = (point: Vec2, obstacle: Obstacle, margin: number) => {
  const local = toLocal(point, obstacle);
  return Math.abs(local[0]) < obstacle.halfWidth + margin && Math.abs(local[1]) < obstacle.halfLength + margin;
};

/** Does segment a→b pass through the (slightly shrunk) expanded rectangle? Slab test in the box's frame. */
const segmentHits = (a: Vec2, b: Vec2, obstacle: Obstacle) => {
  const start = toLocal(a, obstacle);
  const end = toLocal(b, obstacle);
  const half: Vec2 = [obstacle.halfWidth + CLEARANCE - 0.01, obstacle.halfLength + CLEARANCE - 0.01];
  let enter = 0;
  let exit = 1;
  for (let axis = 0; axis < 2; axis++) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(start[axis]) >= half[axis]) return false;
      continue;
    }
    let t1 = (-half[axis] - start[axis]) / delta;
    let t2 = (half[axis] - start[axis]) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    enter = Math.max(enter, t1);
    exit = Math.min(exit, t2);
    if (enter >= exit) return false;
  }
  return true;
};

/**
 * Shortest walking route from `from` to `to` that goes around obstacles
 * (visibility graph over the obstacles' expanded corners + Dijkstra).
 * Obstacles containing either endpoint are ignored, so you can still walk up to a car.
 */
export const routeAround = (from: Vec2, to: Vec2, allObstacles: Obstacle[]): Vec2[] => {
  const obstacles = allObstacles.filter((o) => !isInside(from, o, CLEARANCE) && !isInside(to, o, CLEARANCE));
  const blocked = (a: Vec2, b: Vec2) => obstacles.some((o) => segmentHits(a, b, o));
  if (!blocked(from, to)) return [from, to];

  const nodes: Vec2[] = [from, to, ...obstacles.flatMap(cornersOf).filter((corner) => !obstacles.some((o) => isInside(corner, o, CLEARANCE - 0.02)))];
  const distances = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const visited = nodes.map(() => false);
  distances[0] = 0;
  for (;;) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited[i] && (current < 0 || distances[i] < distances[current])) current = i;
    if (current < 0 || distances[current] === Infinity) break;
    if (current === 1) break;
    visited[current] = true;
    for (let i = 0; i < nodes.length; i++) {
      if (visited[i] || blocked(nodes[current], nodes[i])) continue;
      const candidate = distances[current] + distance2(nodes[current], nodes[i]);
      if (candidate < distances[i]) {
        distances[i] = candidate;
        previous[i] = current;
      }
    }
  }
  if (previous[1] < 0) return [from, to];
  const route: Vec2[] = [];
  for (let node = 1; node >= 0; node = previous[node]) route.unshift(nodes[node]);
  return route;
};
