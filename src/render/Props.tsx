import type { PropSpec } from "../engine/spec";
import { DEG } from "../engine/math";
import { Part, shapes } from "./toon";

/** Set dressing. Everything sits at `at` (on the ground, or at height `y`) and faces +Z at facing 0. */
export const Prop = ({ prop, night, time = 0 }: { prop: PropSpec; night: boolean; time?: number }) => (
  <group position={[prop.at[0], prop.y ?? 0, prop.at[1]]} rotation={[0, prop.facing * DEG, 0]} scale={prop.scale}>
    <PropBody prop={prop} night={night} time={time} />
  </group>
);

const PropBody = ({ prop, night, time }: { prop: PropSpec; night: boolean; time: number }) => {
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
    case "chair": {
      // White plastic patio chair; the seat top is at 0.45m, the back is toward -Z.
      const white = prop.color ?? "#f8f9fa";
      return (
        <>
          <Part geometry={shapes.box(0.52, 0.06, 0.5, 0.03)} color={white} position={[0, 0.42, 0]} />
          <Part geometry={shapes.box(0.52, 0.5, 0.06, 0.03)} color={white} position={[0, 0.7, -0.25]} rotation={[-0.12, 0, 0]} />
          {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
            <Part key={`${x}${z}`} geometry={shapes.cylinder(0.025, 0.025, 0.42, 8)} color={white} position={[x * 0.22, 0.21, z * 0.21]} />
          )))}
          {[-1, 1].map((x) => (
            <Part key={x} geometry={shapes.box(0.05, 0.04, 0.42, 0.015)} color={white} position={[x * 0.25, 0.62, 0]} />
          ))}
        </>
      );
    }
    case "table":
      // Round patio table, top at 0.72m.
      return (
        <>
          <Part geometry={shapes.cylinder(0.42, 0.42, 0.04, 24)} color={prop.color ?? "#f8f9fa"} position={[0, 0.7, 0]} />
          <Part geometry={shapes.cylinder(0.035, 0.035, 0.68, 10)} color="#ced4da" position={[0, 0.35, 0]} />
          <Part geometry={shapes.cylinder(0.22, 0.25, 0.04, 16)} color="#ced4da" position={[0, 0.02, 0]} />
        </>
      );
    case "mug":
      return (
        <>
          <Part geometry={shapes.cylinder(0.055, 0.05, 0.12, 16)} color={prop.color ?? "#ffffff"} position={[0, 0.06, 0]} outline={0.008} />
          <Part geometry={shapes.cylinder(0.046, 0.046, 0.01, 16)} color="#5b3a1e" position={[0, 0.117, 0]} outline={false} shadow={false} />
          <Part geometry={shapes.torus(0.032, 0.011)} color={prop.color ?? "#ffffff"} position={[0.062, 0.06, 0]} rotation={[0, Math.PI / 2, 0]} outline={0.006} />
        </>
      );
    case "dashcam": {
      // A dashcam (off its mount) with its lens toward +Z and a blinking record light.
      const recording = time % 1 < 0.6;
      return (
        <>
          <Part geometry={shapes.box(0.22, 0.13, 0.1, 0.03)} color="#1d1b26" position={[0, 0.065, 0]} outline={0.008} />
          <Part geometry={shapes.cylinder(0.04, 0.04, 0.04, 12)} color="#3a3a4a" position={[0, 0.065, 0.06]} rotation={[Math.PI / 2, 0, 0]} outline={false} />
          <Part geometry={shapes.sphere(0.022)} color={recording ? "#ff1744" : "#5a1020"} emissive={recording ? "#ff1744" : undefined} position={[-0.07, 0.105, 0.055]} outline={false} shadow={false} />
          <Part geometry={shapes.box(0.05, 0.08, 0.05, 0.01)} color="#2b2d42" position={[0, 0.17, -0.02]} outline={false} />
        </>
      );
    }
    case "bump":
      // An asphalt hump across a lane (3.6m long along local Z), with yellow stripes.
      return (
        <>
          <Part geometry={shapes.sphere(1)} color="#3d3d46" position={[0, 0, 0]} scale={[0.45, 0.13, 1.8]} outline={0.01} />
          {[-1.2, 0, 1.2].map((z) => (
            <Part key={z} geometry={shapes.box(0.5, 0.02, 0.3, 0.01)} color="#ffd166" position={[0, 0.115, z]} outline={false} shadow={false} />
          ))}
        </>
      );
    case "porch":
      // Wooden deck (6 × 3m, front toward +Z) with two posts and a little roof, built against a house front.
      return (
        <>
          <Part geometry={shapes.box(6, 0.06, 3, 0.02)} color={prop.color ?? "#b08155"} position={[0, 0.03, 0]} outline={false} />
          {[-1.2, -0.6, 0, 0.6, 1.2].map((z) => (
            <Part key={z} geometry={shapes.box(6, 0.005, 0.03, 0.002)} color="#8a5f3a" position={[0, 0.062, z]} outline={false} shadow={false} />
          ))}
          {[-2.85, 2.85].map((x) => (
            <Part key={x} geometry={shapes.box(0.14, 2.6, 0.14, 0.03)} color="#f8f9fa" position={[x, 1.3, 1.35]} />
          ))}
          <Part geometry={shapes.box(6.4, 0.14, 3.3, 0.04)} color="#9a3b3b" position={[0, 2.66, 0.05]} rotation={[0.12, 0, 0]} />
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
