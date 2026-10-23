import type { PropSpec } from "../engine/spec";
import { DEG } from "../engine/math";
import { Part, shapes } from "./toon";

/** Set dressing. Everything sits on the ground at `at` and faces +Z at facing 0. */
export const Prop = ({ prop, night }: { prop: PropSpec; night: boolean }) => (
  <group position={[prop.at[0], 0, prop.at[1]]} rotation={[0, prop.facing * DEG, 0]} scale={prop.scale}>
    <PropBody prop={prop} night={night} />
  </group>
);

const PropBody = ({ prop, night }: { prop: PropSpec; night: boolean }) => {
  switch (prop.type) {
    case "tree":
      return (
        <>
          <Part geometry={shapes.cylinder(0.18, 0.25, 2)} color="#8d5a3b" position={[0, 1, 0]} />
          <Part geometry={shapes.sphere(1.4)} color={prop.color ?? "#4caf50"} position={[0, 2.9, 0]} />
          <Part geometry={shapes.sphere(1.0)} color={prop.color ?? "#5cc95f"} position={[0.7, 2.4, 0.4]} />
          <Part geometry={shapes.sphere(0.9)} color={prop.color ?? "#43a047"} position={[-0.6, 3.6, -0.2]} />
        </>
      );
    case "pine":
      return (
        <>
          <Part geometry={shapes.cylinder(0.15, 0.2, 1.2)} color="#7a4b2e" position={[0, 0.6, 0]} />
          <Part geometry={shapes.cone(1.4, 2.2, 8)} color={prop.color ?? "#2e7d4f"} position={[0, 2.0, 0]} />
          <Part geometry={shapes.cone(1.05, 1.8, 8)} color={prop.color ?? "#358f5b"} position={[0, 3.1, 0]} />
        </>
      );
    case "bush":
      return (
        <>
          <Part geometry={shapes.sphere(0.6)} color={prop.color ?? "#57a63d"} position={[0, 0.45, 0]} />
          <Part geometry={shapes.sphere(0.45)} color={prop.color ?? "#64b947"} position={[0.55, 0.35, 0.1]} />
          <Part geometry={shapes.sphere(0.45)} color={prop.color ?? "#4c9a35"} position={[-0.5, 0.35, 0]} />
        </>
      );
    case "house": {
      const wall = prop.color ?? "#f6bd60";
      return (
        <>
          <Part geometry={shapes.box(7, 3.6, 6, 0.12)} color={wall} position={[0, 1.8, 0]} />
          <Part geometry={shapes.cone(5.6, 2.4, 4)} color="#9a3b3b" position={[0, 4.8, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 1, 0.82]} />
          <Part geometry={shapes.box(1.1, 2.0, 0.12, 0.04)} color="#6d4c41" position={[0, 1.0, 3.02]} />
          {[-2.2, 2.2].map((x) => (
            <Part key={x} geometry={shapes.box(1.3, 1.1, 0.1, 0.04)} color={night ? "#ffe8a3" : "#bde0fe"} emissive={night ? "#b38b2d" : undefined} position={[x, 2.0, 3.02]} />
          ))}
        </>
      );
    }
    case "garage":
      return (
        <>
          <Part geometry={shapes.box(4, 3, 5.5, 0.1)} color={prop.color ?? "#e9edc9"} position={[0, 1.5, 0]} />
          <Part geometry={shapes.box(4.3, 0.3, 5.8, 0.08)} color="#9a3b3b" position={[0, 3.1, 0]} />
          <Part geometry={shapes.box(3, 2.3, 0.1, 0.03)} color="#cfd8dc" position={[0, 1.15, 2.76]} />
        </>
      );
    case "building":
      return (
        <>
          <Part geometry={shapes.box(9, 10, 8, 0.15)} color={prop.color ?? "#8ecae6"} position={[0, 5, 0]} />
          {[2, 4.5, 7].flatMap((y) =>
            [-2.8, 0, 2.8].map((x) => (
              <Part key={`${x}-${y}`} geometry={shapes.box(1.6, 1.4, 0.1, 0.03)} color={night ? "#ffe08a" : "#dff3ff"} emissive={night ? "#9c7a1c" : undefined} position={[x, y, 4.02]} outline={0.012} />
            )),
          )}
          <Part geometry={shapes.box(9.4, 0.4, 8.4, 0.08)} color="#5c677d" position={[0, 10, 0]} />
        </>
      );
    case "cone":
      return (
        <>
          <Part geometry={shapes.box(0.5, 0.06, 0.5, 0.02)} color="#ff6d00" position={[0, 0.03, 0]} />
          <Part geometry={shapes.cone(0.2, 0.7, 16)} color={prop.color ?? "#ff6d00"} position={[0, 0.4, 0]} />
          <Part geometry={shapes.cylinder(0.11, 0.14, 0.12, 16)} color="#ffffff" position={[0, 0.42, 0]} outline={false} />
        </>
      );
    case "lamp":
      return (
        <>
          <Part geometry={shapes.cylinder(0.08, 0.12, 5)} color="#495057" position={[0, 2.5, 0]} />
          <Part geometry={shapes.box(0.2, 0.12, 1.2, 0.04)} color="#495057" position={[0, 5, 0.5]} />
          <Part geometry={shapes.sphere(0.22)} color="#fff3b0" emissive={night ? "#ffd166" : undefined} position={[0, 4.85, 1]} scale={[1, 0.6, 1]} />
        </>
      );
    case "bench":
      return (
        <>
          <Part geometry={shapes.box(1.8, 0.1, 0.5, 0.03)} color={prop.color ?? "#a26769"} position={[0, 0.48, 0]} />
          <Part geometry={shapes.box(1.8, 0.45, 0.08, 0.03)} color={prop.color ?? "#a26769"} position={[0, 0.8, -0.22]} />
          {[-0.75, 0.75].map((x) => (
            <Part key={x} geometry={shapes.box(0.08, 0.48, 0.45, 0.02)} color="#343a40" position={[x, 0.24, 0]} />
          ))}
        </>
      );
    case "mailbox":
      return (
        <>
          <Part geometry={shapes.cylinder(0.05, 0.05, 1.1)} color="#6c584c" position={[0, 0.55, 0]} />
          <Part geometry={shapes.box(0.3, 0.3, 0.5, 0.12)} color={prop.color ?? "#1d3557"} position={[0, 1.2, 0]} />
        </>
      );
  }
};
