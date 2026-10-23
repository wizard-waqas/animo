import { useMemo } from "react";
import * as THREE from "three";
import { type CarShape, type SeatName, availableSeats, mudSpots, seatLayout } from "../catalog/cars";
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
        <FrontAndBack shape={shape} night={night} />
        {availableSeats(shape).map((seat) => (
          <Door key={seat} shape={shape} seat={seat} color={shape.extra === "police" ? "#f8f9fa" : color} openness={state.doors[seat]} />
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

const Cabin = ({ shape, color }: { shape: CarShape; color: string }) => {
  const cabinHeight = shape.roof - shape.beltline;
  const cabinWidth = shape.width * 0.88;
  const front = shape.cabinCenter + shape.cabinLength / 2;
  const back = shape.cabinCenter - shape.cabinLength / 2;
  const isCargo = shape.extra === "cargo";
  const glassLength = isCargo ? 1.9 : shape.cabinLength - 0.1;
  const glassCenter = isCargo ? front - glassLength / 2 : shape.cabinCenter;
  const pillarZs = [front - 0.05, back + 0.05];
  if (shape.rearDoors) pillarZs.push(shape.cabinCenter + 0.05);
  if (isCargo) pillarZs.push(front - glassLength);
  return (
    <>
      <Part geometry={shapes.box(cabinWidth, 0.14, shape.cabinLength, 0.07)} color={color} position={[0, shape.roof - 0.07, shape.cabinCenter]} />
      <Part
        geometry={shapes.box(cabinWidth - 0.04, cabinHeight - 0.1, glassLength, 0.05)}
        color={GLASS}
        opacity={0.38}
        position={[0, shape.beltline + (cabinHeight - 0.1) / 2, glassCenter]}
        outline={false}
        shadow={false}
      />
      {isCargo && (
        <Part
          geometry={shapes.box(cabinWidth, cabinHeight - 0.08, shape.cabinLength - glassLength, 0.05)}
          color={color}
          position={[0, shape.beltline + (cabinHeight - 0.08) / 2, back + (shape.cabinLength - glassLength) / 2]}
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

const FrontAndBack = ({ shape, night }: { shape: CarShape; night?: boolean }) => {
  const front = shape.length / 2;
  const lampY = shape.bodyBottom + (shape.beltline - shape.bodyBottom) * 0.62;
  const bumperY = shape.bodyBottom + 0.08;
  return (
    <>
      {[1, -1].map((side) => (
        <group key={side}>
          <Part geometry={shapes.sphere(0.12)} color="#fffbe6" emissive={night ? "#fff3b0" : undefined} position={[side * shape.width * 0.32, lampY, front - 0.02]} scale={[1.2, 0.85, 0.5]} />
          <Part geometry={shapes.box(0.3, 0.12, 0.06, 0.03)} color="#ef233c" emissive={night ? "#9d0208" : undefined} position={[side * shape.width * 0.33, lampY, -front + 0.01]} />
        </group>
      ))}
      <Part geometry={shapes.box(shape.width * 0.36, 0.14, 0.05, 0.03)} color={TRIM} position={[0, lampY - 0.04, front + 0.0]} outline={0.012} />
      <Part geometry={shapes.box(shape.width * 0.98, 0.14, 0.18, 0.06)} color={TRIM} position={[0, bumperY, front - 0.02]} />
      <Part geometry={shapes.box(shape.width * 0.98, 0.14, 0.18, 0.06)} color={TRIM} position={[0, bumperY, -front + 0.02]} />
    </>
  );
};

const Door = ({ shape, seat, color, openness }: { shape: CarShape; seat: SeatName; color: string; openness: number }) => {
  const layout = seatLayout(shape, seat)!;
  const height = (shape.beltline - shape.bodyBottom) * 0.86;
  const hingeZ = layout.door.centerZ + layout.door.length / 2;
  const openAngle = openness * 1.15 * -layout.side;
  return (
    <group position={[layout.side * (shape.width / 2 + 0.02), shape.bodyBottom + height / 2 + 0.06, hingeZ]} rotation={[0, openAngle, 0]}>
      <Part geometry={shapes.box(0.07, height, layout.door.length, 0.03)} color={color} position={[0, 0, -layout.door.length / 2]} outline={0.014} />
      <Part geometry={shapes.box(0.05, 0.04, 0.16, 0.015)} color={TRIM} position={[layout.side * 0.04, height * 0.25, -layout.door.length + 0.18]} outline={false} />
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
