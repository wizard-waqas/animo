import { useMemo } from "react";
import * as THREE from "three";
import { type CarShape, type SeatName, availableSeats, isBike, mudSpots, seatLayout } from "../catalog/cars";
import type { CarState } from "../engine/carTrack";
import { Part, shapes } from "./toon";

const GLASS = "#a9def9";
const TRIM = "#2b2d42";
const TIRE = "#22223b";

interface CarModelProps {
  shape: CarShape;
  color: string;
  state: CarState;
  label?: string;
  night?: boolean;
  dashcam?: boolean;
  time: number;
  /** Filming from inside this car (dashcam replay): hide the cabin and dashcam, keep the hood in view. */
  insideView?: boolean;
  /** Text across the back (tailgate). */
  rearLabel?: string;
}

/** Procedural cartoon car. Forward is +Z; the driver (left) side is +X. */
export const CarModel = ({ shape, color, state, label, night, dashcam, time, insideView, rearLabel }: CarModelProps) => {
  if (isBike(shape)) return <Motorcycle shape={shape} color={color} state={state} night={night} />;
  const wheelX = shape.width / 2 - 0.12;
  const wheelZ = shape.wheelbase / 2;
  const bodyHeight = shape.beltline - shape.bodyBottom;
  const bodyY = (shape.beltline + shape.bodyBottom) / 2;
  return (
    <group position={[state.pos[0], state.lift, state.pos[1]]} rotation={[0, state.heading, 0]}>
      <Wheel shape={shape} position={[wheelX, wheelZ]} steer={state.steer} spin={state.wheelSpin} />
      <Wheel shape={shape} position={[-wheelX, wheelZ]} steer={state.steer} spin={state.wheelSpin} />
      <Wheel shape={shape} position={[wheelX, -wheelZ]} steer={0} spin={state.wheelSpin} />
      <Wheel shape={shape} position={[-wheelX, -wheelZ]} steer={0} spin={state.wheelSpin} />
      <Part geometry={shapes.plane(shape.width * 1.05, shape.length * 1.02)} color="#000000" opacity={0.18} position={[0, 0.02, 0]} outline={false} shadow={false} />

      {/* Chassis rides on the springs: heave, pitch and roll come from the suspension sim. */}
      <group position={[0, state.heave, 0]} rotation={[state.pitch, 0, state.roll]} scale={[1, 1 + state.heave * 0.8, 1]}>
        <Part geometry={shapes.box(shape.width, bodyHeight, shape.length, 0.22)} color={color} position={[0, bodyY, 0]} />
        {!insideView && <Cabin shape={shape} color={color} />}
        {!insideView && <SteeringWheel shape={shape} />}
        <FrontAndBack shape={shape} night={night} braking={state.braking} />
        {availableSeats(shape).map((seat) => (
          <Door key={seat} shape={shape} seat={seat} color={shape.extra === "police" ? "#f8f9fa" : color} openness={state.doors[seat]} insideView={insideView} />
        ))}
        {shape.extra === "police" && <LightBar shape={shape} on={state.siren} time={time} />}
        {label && <DoorLabels shape={shape} text={label} />}
        {rearLabel && <RearLabel shape={shape} text={rearLabel} />}
        <Extras shape={shape} color={color} />
        {state.mud.length > 0 && <Mud shape={shape} splats={state.mud} insideView={insideView} />}
        {dashcam && !insideView && <Dashcam shape={shape} time={time} tug={state.dashcamTug} />}
      </group>
    </group>
  );
};

const CHROME = "#ced4da";

/**
 * Cartoon motorcycle: two wheels in line, chunky tank and seat, handlebar with mirrors, round headlight.
 * Tipping over pivots on the ground line under the wheels, lifted a little as it lands on the handlebar.
 */
const Motorcycle = ({ shape, color, state, night }: { shape: CarShape; color: string; state: CarState; night?: boolean }) => {
  const r = shape.wheelRadius;
  const half = shape.wheelbase / 2;
  const tipped = Math.abs(state.tilt);
  const rest = 0.16 * Math.sin(tipped);
  return (
    <group position={[state.pos[0], state.lift, state.pos[1]]} rotation={[0, state.heading, 0]}>
      <Part geometry={shapes.plane(shape.width * 1.1, shape.length * 1.02)} color="#000000" opacity={0.18} position={[0, 0.02, 0]} outline={false} shadow={false} />
      <group position={[0, rest, 0]} rotation={[0, 0, -state.tilt]}>
        <group rotation={[state.pitch, 0, state.roll]} position={[0, state.heave, 0]}>
          {[half, -half].map((z) => (
            <group key={z} position={[0, r, z]} rotation={[0, z > 0 ? state.steer : 0, 0]}>
              <group rotation={[state.wheelSpin, 0, 0]}>
                <Part geometry={shapes.wheel(r, 0.16)} color={TIRE} outline={0.025} />
                <Part geometry={shapes.wheel(r * 0.6, 0.18)} color={CHROME} outline={false} />
                <Part geometry={shapes.box(0.2, r * 1.1, 0.05, 0.015)} color="#868e96" outline={false} />
              </group>
            </group>
          ))}
          {/* Frame from the rear axle to the steering head, engine block between the legs. */}
          <Part geometry={shapes.box(0.14, 0.14, 1.25, 0.05)} color={TRIM} position={[0, 0.55, -0.05]} rotation={[-0.12, 0, 0]} />
          <Part geometry={shapes.box(0.3, 0.3, 0.42, 0.07)} color="#495057" position={[0, 0.42, 0.12]} />
          <Part geometry={shapes.cylinder(0.05, 0.05, 0.75, 10)} color={CHROME} position={[-0.2, 0.32, -0.35]} rotation={[Math.PI / 2 - 0.1, 0, 0]} outline={0.01} />
          {/* Tank, seat and tail. */}
          <Part geometry={shapes.sphere(1)} color={color} position={[0, 0.8, 0.3]} scale={[0.2, 0.15, 0.32]} />
          <Part geometry={shapes.box(0.3, 0.1, 0.62, 0.05)} color="#212529" position={[0, shape.beltline, -0.2]} />
          <Part geometry={shapes.box(0.26, 0.14, 0.4, 0.06)} color={color} position={[0, 0.72, -0.62]} rotation={[0.18, 0, 0]} />
          <Part geometry={shapes.box(0.16, 0.06, 0.04, 0.02)} color={state.braking ? "#ff4d4d" : "#b5172b"} emissive={state.braking ? "#ff1a1a" : undefined} position={[0, 0.74, -0.83]} outline={false} />
          <Part geometry={shapes.box(0.3, 0.05, 0.42, 0.02)} color={color} position={[0, r * 2 + 0.06, -half + 0.05]} />
          {/* Fork, handlebar, mirrors and headlight. */}
          {[1, -1].map((x) => (
            <Part key={x} geometry={shapes.cylinder(0.025, 0.025, 0.75, 8)} color={CHROME} position={[x * 0.09, 0.68, half - 0.12]} rotation={[0.38, 0, 0]} outline={0.008} />
          ))}
          <group position={[0, 1.05, half - 0.3]} rotation={[0, state.steer * 0.6, 0]}>
            <Part geometry={shapes.cylinder(0.025, 0.025, 0.72, 8)} color={TRIM} rotation={[0, 0, Math.PI / 2]} outline={0.008} />
            {[1, -1].map((x) => (
              <group key={x}>
                <Part geometry={shapes.cylinder(0.035, 0.035, 0.13, 8)} color="#212529" position={[x * 0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]} outline={false} />
                <Part geometry={shapes.cylinder(0.01, 0.01, 0.2, 6)} color={TRIM} position={[x * 0.24, 0.1, 0]} outline={false} />
                <Part geometry={shapes.sphere(0.05)} color={CHROME} position={[x * 0.25, 0.21, 0]} scale={[1, 0.7, 0.4]} outline={0.006} />
              </group>
            ))}
          </group>
          <Part geometry={shapes.sphere(0.11)} color="#fffbe6" emissive={night ? "#fff3b0" : undefined} position={[0, 0.88, half - 0.1]} scale={[1, 1, 0.6]} />
          <Part geometry={shapes.box(0.26, 0.04, 0.4, 0.02)} color={color} position={[0, r * 2 + 0.05, half - 0.02]} />
        </group>
      </group>
    </group>
  );
};

/** Little camera behind the rear-view mirror with a blinking red record light. */
const Dashcam = ({ shape, time, tug }: { shape: CarShape; time: number; tug: number }) => {
  const front = shape.cabinCenter + shape.cabinLength / 2;
  const recording = time % 1 < 0.6;
  // Being yanked: rattles on its mount.
  const shake = tug * 0.05;
  return (
    <group
      position={[0.12 + shake * Math.sin(time * 47), shape.roof - 0.26 - shake * Math.abs(Math.sin(time * 31)), front - 0.16 - shake * 0.6 * Math.abs(Math.sin(time * 23))]}
      rotation={[tug * 0.35 * Math.sin(time * 29), tug * 0.4 * Math.sin(time * 37), tug * 0.3 * Math.sin(time * 41)]}
    >
      <Part geometry={shapes.box(0.22, 0.13, 0.1, 0.03)} color="#1d1b26" outline={0.008} />
      <Part geometry={shapes.cylinder(0.04, 0.04, 0.04, 12)} color="#3a3a4a" position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]} outline={false} />
      <Part geometry={shapes.sphere(0.022)} color={recording ? "#ff1744" : "#5a1020"} emissive={recording ? "#ff1744" : undefined} position={[-0.07, 0.04, 0.055]} outline={false} shadow={false} />
    </group>
  );
};

/** Roof light bar: red and blue halves flashing alternately while the siren is on. */
const LightBar = ({ shape, on, time }: { shape: CarShape; on: boolean; time: number }) => {
  const phase = Math.floor(time * 6) % 2 === 0;
  const red = on && phase;
  const blue = on && !phase;
  return (
    <group position={[0, shape.roof + 0.09, shape.cabinCenter + 0.1]}>
      <Part geometry={shapes.box(1.25, 0.08, 0.3, 0.03)} color="#2b2d42" outline={0.01} />
      <Part geometry={shapes.box(0.56, 0.14, 0.26, 0.05)} color={red ? "#ff2d2d" : "#8a1c1c"} emissive={red ? "#ff1a1a" : undefined} position={[0.31, 0.1, 0]} outline={0.01} shadow={false} />
      <Part geometry={shapes.box(0.56, 0.14, 0.26, 0.05)} color={blue ? "#2d6bff" : "#1c2f8a"} emissive={blue ? "#1a4dff" : undefined} position={[-0.31, 0.1, 0]} outline={0.01} shadow={false} />
    </group>
  );
};

const Wheel = ({ shape, position, steer, spin }: { shape: CarShape; position: [number, number]; steer: number; spin: number }) => {
  const r = shape.wheelRadius;
  return (
    <group position={[position[0], r, position[1]]} rotation={[0, steer, 0]}>
      <group rotation={[spin, 0, 0]}>
        <Part geometry={shapes.wheel(r, 0.3)} color={TIRE} outline={0.03} />
        <Part geometry={shapes.wheel(r * 0.55, 0.32)} color="#e9ecef" outline={false} />
        <Part geometry={shapes.box(0.34, r * 0.95, 0.09, 0.02)} color="#adb5bd" outline={false} />
      </group>
    </group>
  );
};

/** Where the side glass runs (z range), shared by the cabin and the door windows. */
const glassSpan = (shape: CarShape) => {
  const front = shape.cabinCenter + shape.cabinLength / 2;
  const isCargo = shape.extra === "cargo";
  const length = isCargo ? 1.9 : shape.cabinLength - 0.1;
  const center = isCargo ? front - length / 2 : shape.cabinCenter;
  return { back: center - length / 2, front: center + length / 2, center, length };
};

/** The part of a door that carries a window (z range), or undefined if the door sits below fixed glass only. */
const doorWindowSpan = (shape: CarShape, seat: SeatName) => {
  const layout = seatLayout(shape, seat)!;
  const glass = glassSpan(shape);
  const back = Math.max(layout.door.centerZ - layout.door.length / 2, glass.back) + 0.04;
  const front = Math.min(layout.door.centerZ + layout.door.length / 2, glass.front) - 0.04;
  return front - back > 0.2 ? { back, front } : undefined;
};

const Cabin = ({ shape, color }: { shape: CarShape; color: string }) => {
  const cabinHeight = shape.roof - shape.beltline;
  const cabinWidth = shape.width * 0.88;
  const front = shape.cabinCenter + shape.cabinLength / 2;
  const back = shape.cabinCenter - shape.cabinLength / 2;
  const isCargo = shape.extra === "cargo";
  const glass = glassSpan(shape);
  const glassHeight = cabinHeight - 0.1;
  const glassY = shape.beltline + glassHeight / 2;
  const pillarZs = [front - 0.05, back + 0.05];
  if (shape.rearDoors) pillarZs.push(shape.cabinCenter + 0.05);
  if (isCargo) pillarZs.push(front - glass.length);
  // Side glass that isn't part of a door (rear quarter windows); door windows swing out with their doors.
  const sidePanels = ([1, -1] as const).flatMap((side) => {
    const doorSpans = availableSeats(shape)
      .filter((seat) => seatLayout(shape, seat)!.side === side)
      .map((seat) => doorWindowSpan(shape, seat))
      .filter((span) => span !== undefined)
      .sort((a, b) => a.back - b.back);
    const panels: { side: 1 | -1; back: number; front: number }[] = [];
    let cursor = glass.back;
    for (const span of doorSpans) {
      if (span.back - cursor > 0.15) panels.push({ side, back: cursor, front: span.back });
      cursor = Math.max(cursor, span.front);
    }
    if (glass.front - cursor > 0.15) panels.push({ side, back: cursor, front: glass.front });
    return panels;
  });
  return (
    <>
      <Part geometry={shapes.box(cabinWidth, 0.14, shape.cabinLength, 0.07)} color={color} position={[0, shape.roof - 0.07, shape.cabinCenter]} />
      {/* Windshield and rear window. */}
      <Part geometry={shapes.box(cabinWidth - 0.04, glassHeight, 0.05, 0.02)} color={GLASS} opacity={0.38} position={[0, glassY, glass.front - 0.03]} outline={false} shadow={false} />
      {!isCargo && (
        <Part geometry={shapes.box(cabinWidth - 0.04, glassHeight, 0.05, 0.02)} color={GLASS} opacity={0.38} position={[0, glassY, glass.back + 0.03]} outline={false} shadow={false} />
      )}
      {sidePanels.map((panel) => (
        <Part
          key={`${panel.side}-${panel.back}`}
          geometry={shapes.box(0.04, glassHeight, panel.front - panel.back, 0.015)}
          color={GLASS}
          opacity={0.38}
          position={[panel.side * (cabinWidth / 2 - 0.04), glassY, (panel.front + panel.back) / 2]}
          outline={false}
          shadow={false}
        />
      ))}
      {isCargo && (
        <Part
          geometry={shapes.box(cabinWidth, cabinHeight - 0.08, shape.cabinLength - glass.length, 0.05)}
          color={color}
          position={[0, shape.beltline + (cabinHeight - 0.08) / 2, back + (shape.cabinLength - glass.length) / 2]}
        />
      )}
      {pillarZs.flatMap((z) =>
        [1, -1].map((side) => (
          <Part
            key={`${z}-${side}`}
            geometry={shapes.box(0.08, cabinHeight, 0.09, 0.03)}
            color={color}
            position={[side * (cabinWidth / 2 - 0.03), shape.beltline + cabinHeight / 2, z]}
            outline={0.012}
          />
        )),
      )}
    </>
  );
};

/** Steering wheel in front of the driver's seat, tilted toward them (seen through the windows). */
const SteeringWheel = ({ shape }: { shape: CarShape }) => {
  const driver = seatLayout(shape, "driver");
  if (!driver) return null;
  return (
    <group position={[driver.seat[0], shape.beltline + 0.06, driver.seat[1] + 0.5]} rotation={[0.55, 0, 0]}>
      <Part geometry={shapes.torus(0.16, 0.025)} color="#1d1b26" outline={false} />
      <Part geometry={shapes.box(0.3, 0.035, 0.03, 0.01)} color="#1d1b26" outline={false} />
      <Part geometry={shapes.cylinder(0.025, 0.025, 0.3, 8)} color="#1d1b26" position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]} outline={false} />
    </group>
  );
};

const FrontAndBack = ({ shape, night, braking }: { shape: CarShape; night?: boolean; braking?: boolean }) => {
  const front = shape.length / 2;
  const lampY = shape.bodyBottom + (shape.beltline - shape.bodyBottom) * 0.62;
  const bumperY = shape.bodyBottom + 0.08;
  // Brake lights: bright red with a soft glow, plus the third light up at the rear window.
  const tailColor = braking ? "#ff4d4d" : "#b5172b";
  const tailGlow = braking ? "#ff1a1a" : night ? "#9d0208" : undefined;
  const thirdLightZ = shape.extra === "pickup-bed" || shape.extra === "dump-bed" || shape.extra === "cargo"
    ? undefined
    : shape.cabinCenter - shape.cabinLength / 2 + 0.06;
  return (
    <>
      {[1, -1].map((side) => (
        <group key={side}>
          <Part geometry={shapes.sphere(0.12)} color="#fffbe6" emissive={night ? "#fff3b0" : undefined} position={[side * shape.width * 0.32, lampY, front - 0.02]} scale={[1.2, 0.85, 0.5]} />
          <Part geometry={shapes.box(0.3, 0.12, 0.06, 0.03)} color={tailColor} emissive={tailGlow} position={[side * shape.width * 0.33, lampY, -front + 0.01]} />
          {braking && (
            <Part geometry={shapes.sphere(0.3)} color="#ff3030" emissive="#ff1a1a" opacity={0.28} position={[side * shape.width * 0.33, lampY, -front - 0.04]} scale={[1.2, 0.7, 0.25]} outline={false} shadow={false} />
          )}
        </group>
      ))}
      {thirdLightZ !== undefined && (
        <Part geometry={shapes.box(0.36, 0.05, 0.04, 0.015)} color={tailColor} emissive={braking ? "#ff1a1a" : undefined} position={[0, shape.roof - 0.17, thirdLightZ]} outline={false} shadow={false} />
      )}
      <Part geometry={shapes.box(shape.width * 0.36, 0.14, 0.05, 0.03)} color={TRIM} position={[0, lampY - 0.04, front + 0.0]} outline={0.012} />
      <Part geometry={shapes.box(shape.width * 0.98, 0.14, 0.18, 0.06)} color={TRIM} position={[0, bumperY, front - 0.02]} />
      <Part geometry={shapes.box(shape.width * 0.98, 0.14, 0.18, 0.06)} color={TRIM} position={[0, bumperY, -front + 0.02]} />
    </>
  );
};

const Door = ({ shape, seat, color, openness, insideView }: { shape: CarShape; seat: SeatName; color: string; openness: number; insideView?: boolean }) => {
  const layout = seatLayout(shape, seat)!;
  const height = (shape.beltline - shape.bodyBottom) * 0.86;
  const hingeZ = layout.door.centerZ + layout.door.length / 2;
  const openAngle = openness * 1.15 * -layout.side;
  const groupX = layout.side * (shape.width / 2 + 0.02);
  const groupY = shape.bodyBottom + height / 2 + 0.06;
  // The door's window (glass in a thin frame) sits up at the cabin's side and swings out with the door.
  const window = insideView ? undefined : doorWindowSpan(shape, seat);
  const cabinX = layout.side * (shape.width * 0.44 - 0.04);
  const glassHeight = shape.roof - shape.beltline - 0.1;
  const glassY = shape.beltline + glassHeight / 2 - groupY;
  return (
    <group position={[groupX, groupY, hingeZ]} rotation={[0, openAngle, 0]}>
      <Part geometry={shapes.box(0.07, height, layout.door.length, 0.03)} color={color} position={[0, 0, -layout.door.length / 2]} outline={0.014} />
      <Part geometry={shapes.box(0.05, 0.04, 0.16, 0.015)} color={TRIM} position={[layout.side * 0.04, height * 0.25, -layout.door.length + 0.18]} outline={false} />
      {window && (
        <group position={[cabinX - groupX, glassY, (window.front + window.back) / 2 - hingeZ]}>
          <Part geometry={shapes.box(0.04, glassHeight, window.front - window.back, 0.015)} color={GLASS} opacity={0.38} outline={false} shadow={false} />
          {openness > 0.02 && (
            <>
              {/* Frame edges only show once the door leaves the body (closed, the pillars and roof cover them). */}
              <Part geometry={shapes.box(0.05, 0.05, window.front - window.back, 0.015)} color={color} position={[0, glassHeight / 2, 0]} outline={0.008} />
              <Part geometry={shapes.box(0.05, glassHeight, 0.05, 0.015)} color={color} position={[0, 0, -(window.front - window.back) / 2]} outline={0.008} />
            </>
          )}
        </group>
      )}
    </group>
  );
};

const labelTextures = new Map<string, THREE.CanvasTexture>();
const labelTexture = (text: string) => {
  let texture = labelTextures.get(text);
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.font = "900 150px 'Arial Rounded MT Bold', 'Helvetica Neue', Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 18;
    context.strokeStyle = "#1d1b26";
    context.strokeText(text, 512, 128, 980);
    context.fillStyle = "#ffffff";
    context.fillText(text, 512, 128, 980);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    labelTextures.set(text, texture);
  }
  return texture;
};

const MUD_COLORS = ["#5c3d1e", "#6f4a24", "#4e3319", "#7a5530"];

/** Mud splats: flattened blobs that squash in when they land, plus a few drips on the vertical ones. */
const Mud = ({ shape, splats, insideView }: { shape: CarShape; splats: CarState["mud"]; insideView?: boolean }) => {
  const spots = useMemo(() => mudSpots(shape), [shape]);
  return (
    <>
      {splats.map(({ spot, age }) => {
        const where = spots[spot];
        if (!where) return null;
        // Windshield splats would sit right in front of the dashcam's lens.
        if (insideView && where.normal === "front" && where.pos[1] > shape.beltline) return null;
        const landed = Math.min(1, age / 0.12);
        const spread = where.size * (0.6 + 0.4 * landed);
        const color = MUD_COLORS[spot % MUD_COLORS.length];
        const flat = where.normal === "up" ? ([spread, 0.035 + 0.05 * (1 - landed), spread * 0.85] as const) : ([spread, spread * 0.85, 0.035 + 0.05 * (1 - landed)] as const);
        return (
          <group key={spot} position={where.pos}>
            <Part geometry={shapes.sphere(1)} color={color} scale={[...flat]} outline={0.01} shadow={false} />
            <Part geometry={shapes.sphere(1)} color={color} position={where.normal === "up" ? [spread * 0.7, 0, spread * 0.3] : [spread * 0.6, spread * 0.4, 0]} scale={where.normal === "up" ? [spread * 0.35, 0.03, spread * 0.3] : [spread * 0.3, spread * 0.3, 0.03]} outline={false} shadow={false} />
            {where.normal === "front" && (
              <Part geometry={shapes.capsule(0.03, spread * 0.6 * Math.min(1, age / 1.5))} color={color} position={[spread * -0.2, -spread * (0.6 + 0.3 * Math.min(1, age / 1.5)), 0.01]} outline={false} shadow={false} />
            )}
          </group>
        );
      })}
    </>
  );
};

/** Text across the back of the vehicle (on a dump truck: the tailgate, big enough to read from behind). */
const RearLabel = ({ shape, text }: { shape: CarShape; text: string }) => {
  const texture = useMemo(() => labelTexture(text), [text]);
  const width = shape.width * 0.92;
  const y = shape.extra === "dump-bed" ? shape.beltline + 0.55 : shape.bodyBottom + (shape.beltline - shape.bodyBottom) * 0.55;
  return (
    <mesh position={[0, y, -shape.length / 2 - 0.035]} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[width, width / 4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
};

/** Business name painted on both sides, just below the windows. */
const DoorLabels = ({ shape, text }: { shape: CarShape; text: string }) => {
  const texture = useMemo(() => labelTexture(text), [text]);
  const dumpBed = shape.extra === "dump-bed";
  const width = Math.min(shape.length * 0.55, dumpBed ? 3.6 : 2.6);
  // Dump trucks wear their name on the bed walls.
  const y = dumpBed ? shape.beltline + 0.55 : shape.bodyBottom + (shape.beltline - shape.bodyBottom) * 0.45;
  const z = shape.extra === "cargo" ? -0.6 : dumpBed ? -0.95 : -0.3;
  return (
    <>
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * (shape.width / 2 + 0.065), y, z]} rotation={[0, side * (Math.PI / 2), 0]}>
          <planeGeometry args={[width, width / 4]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
      ))}
    </>
  );
};

const Extras = ({ shape, color }: { shape: CarShape; color: string }) => {
  switch (shape.extra) {
    case "pickup-bed": {
      const bedFront = shape.cabinCenter - shape.cabinLength / 2 - 0.05;
      const bedBack = -shape.length / 2 + 0.1;
      const bedLength = bedFront - bedBack;
      return (
        <Part geometry={shapes.box(shape.width * 0.82, 0.06, bedLength, 0.02)} color={TRIM} position={[0, shape.beltline - 0.01, (bedFront + bedBack) / 2]} outline={false} />
      );
    }
    case "taxi-sign":
      return (
        <Part geometry={shapes.box(0.6, 0.22, 0.28, 0.06)} color="#ffffff" position={[0, shape.roof + 0.1, shape.cabinCenter]} />
      );
    case "spoiler":
      return (
        <>
          <Part geometry={shapes.box(shape.width * 0.9, 0.06, 0.32, 0.03)} color={color} position={[0, shape.beltline + 0.3, -shape.length / 2 + 0.25]} />
          {[1, -1].map((side) => (
            <Part key={side} geometry={shapes.box(0.06, 0.3, 0.1, 0.02)} color={TRIM} position={[side * shape.width * 0.3, shape.beltline + 0.15, -shape.length / 2 + 0.25]} outline={false} />
          ))}
        </>
      );
    case "dump-bed": {
      // Steel tub behind the cab, heaped with dirt, with a ribbed tailgate.
      const bedFront = shape.cabinCenter - shape.cabinLength / 2 - 0.12;
      const bedBack = -shape.length / 2;
      const bedLength = bedFront - bedBack;
      const wallTop = shape.beltline + 1.1;
      const wallHeight = wallTop - shape.beltline;
      const centerZ = (bedFront + bedBack) / 2;
      return (
        <>
          {[1, -1].map((side) => (
            <Part key={side} geometry={shapes.box(0.1, wallHeight, bedLength, 0.04)} color={color} position={[side * (shape.width / 2 - 0.05), shape.beltline + wallHeight / 2, centerZ]} />
          ))}
          <Part geometry={shapes.box(shape.width, wallHeight + 0.3, 0.12, 0.04)} color={color} position={[0, shape.beltline + (wallHeight + 0.3) / 2, bedFront]} />
          <Part geometry={shapes.box(shape.width, wallHeight, 0.1, 0.04)} color={color} position={[0, shape.beltline + wallHeight / 2, bedBack + 0.05]} />
          {/* The dirt heap. */}
          <Part geometry={shapes.sphere(1)} color="#6f4a24" position={[0, wallTop - 0.15, centerZ]} scale={[shape.width * 0.47, 0.55, bedLength * 0.47]} />
          <Part geometry={shapes.sphere(1)} color="#5c3d1e" position={[0.3, wallTop + 0.15, centerZ - 0.6]} scale={[0.6, 0.35, 0.8]} />
          <Part geometry={shapes.sphere(1)} color="#7a5530" position={[-0.35, wallTop + 0.1, centerZ + 0.7]} scale={[0.55, 0.3, 0.7]} />
          {/* Black bumper and mud flaps. */}
          <Part geometry={shapes.box(shape.width, 0.18, 0.2, 0.04)} color={TRIM} position={[0, shape.bodyBottom - 0.05, bedBack]} />
          {[1, -1].map((side) => (
            <Part key={side} geometry={shapes.box(0.5, 0.5, 0.04, 0.02)} color="#1d1b26" position={[side * (shape.width / 2 - 0.35), 0.45, -shape.wheelbase / 2 - shape.wheelRadius - 0.15]} outline={false} />
          ))}
        </>
      );
    }
    case "roof-rack":
      return (
        <>
          {[1, -1].map((side) => (
            <Part key={side} geometry={shapes.box(0.06, 0.08, shape.cabinLength * 0.9, 0.02)} color={TRIM} position={[side * shape.width * 0.36, shape.roof + 0.04, shape.cabinCenter]} outline={0.01} />
          ))}
        </>
      );
    default:
      return null;
  }
};
