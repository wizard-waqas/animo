import { useMemo } from "react";
import * as THREE from "three";
import type { Crash } from "../engine/compile";
import { clamp01, type Vec3 } from "../engine/math";
import { easeOutBack } from "../engine/easing";
import { Part, shapes } from "./toon";

const GRAVITY = 9.8;

/** Deterministic pseudo-random numbers (same crash → same debris every frame and every render). */
const seeded = (seed: number) => {
  let state = Math.floor(seed * 1000) + 12345;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const starGeometry = (() => {
  const shape = new THREE.Shape();
  const points = 9;
  for (let i = 0; i <= points * 2; i++) {
    const radius = i % 2 === 0 ? 1 : 0.42;
    const angle = (i / (points * 2)) * Math.PI * 2;
    const x = Math.sin(angle) * radius;
    const y = Math.cos(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(shape);
})();

/** Impact burst + flying debris + smoke puffs. Everything is a pure function of time since impact. */
export const CrashEffect = ({ crash, t, cameraPosition }: { crash: Crash; t: number; cameraPosition: Vec3 }) => {
  const age = t - crash.time;
  const debris = useMemo(() => makeDebris(crash), [crash]);
  const puffs = useMemo(() => makePuffs(crash), [crash]);
  return (
    <>
      {age < 0.55 && <ImpactStar point={crash.point} age={age} cameraPosition={cameraPosition} power={crash.speed} />}
      {debris.map((piece, index) => (
        <DebrisPiece key={index} piece={piece} age={age} />
      ))}
      {age < 2.2 && puffs.map((puff, index) => <SmokePuff key={index} puff={puff} age={age} />)}
    </>
  );
};

const ImpactStar = ({ point, age, cameraPosition, power }: { point: Vec3; age: number; cameraPosition: Vec3; power: number }) => {
  const dx = cameraPosition[0] - point[0];
  const dy = cameraPosition[1] - point[1];
  const dz = cameraPosition[2] - point[2];
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  const grow = easeOutBack(clamp01(age / 0.12));
  const shrink = 1 - clamp01((age - 0.25) / 0.3);
  const size = (0.9 + Math.min(power, 20) * 0.06) * grow * shrink;
  return (
    <group position={point} rotation={[pitch, yaw, age * 1.5, "YXZ"]} scale={size}>
      <mesh geometry={starGeometry} position={[0, 0, -0.02]} scale={1.15}>
        <meshBasicMaterial color="#1d1b26" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={starGeometry}>
        <meshBasicMaterial color="#ffd60a" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={starGeometry} position={[0, 0, 0.02]} scale={0.55}>
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

interface DebrisPiece { start: Vec3; velocity: Vec3; spin: Vec3; size: Vec3; color: string }

const makeDebris = (crash: Crash): DebrisPiece[] => {
  const random = seeded(crash.time + crash.point[0]);
  const palette = [...crash.colors, "#adb5bd", "#2b2d42", "#a9def9", "#a9def9"];
  return Array.from({ length: 14 }, () => {
    const sideways = (random() - 0.5) * 7;
    const along = (random() - 0.3) * 4;
    const perpendicular: [number, number] = [-crash.direction[1], crash.direction[0]];
    return {
      start: [crash.point[0], crash.point[1] + (random() - 0.5) * 0.3, crash.point[2]],
      velocity: [
        crash.direction[0] * along + perpendicular[0] * sideways,
        2.5 + random() * 4,
        crash.direction[1] * along + perpendicular[1] * sideways,
      ],
      spin: [random() * 14 - 7, random() * 14 - 7, random() * 14 - 7],
      size: [0.07 + random() * 0.14, 0.03 + random() * 0.05, 0.06 + random() * 0.12],
      color: palette[Math.floor(random() * palette.length)],
    };
  });
};

/** Ballistic flight, then it lies on the road where it landed. */
const DebrisPiece = ({ piece, age }: { piece: DebrisPiece; age: number }) => {
  const [vx, vy, vz] = piece.velocity;
  const groundHeight = piece.size[1] / 2 + 0.04;
  const drop = piece.start[1] - groundHeight;
  const landTime = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY;
  const flight = Math.min(age, landTime);
  const slide = Math.max(0, age - landTime);
  const slideDistance = 0.35 * (1 - Math.exp(-slide * 4));
  const position: Vec3 = [
    piece.start[0] + vx * flight + vx * 0.08 * slideDistance,
    age < landTime ? piece.start[1] + vy * flight - 0.5 * GRAVITY * flight * flight : groundHeight,
    piece.start[2] + vz * flight + vz * 0.08 * slideDistance,
  ];
  const spinTime = flight + slideDistance * 0.3;
  const rotation: Vec3 = [piece.spin[0] * spinTime, piece.spin[1] * spinTime, age < landTime ? piece.spin[2] * spinTime : 0];
  return <Part geometry={shapes.box(piece.size[0], piece.size[1], piece.size[2], 0.01)} color={piece.color} position={position} rotation={age < landTime ? rotation : [0, rotation[1], 0]} outline={0.01} />;
};

interface Puff { offset: Vec3; drift: Vec3; size: number; delay: number }

const makePuffs = (crash: Crash): Puff[] => {
  const random = seeded(crash.time * 7 + 3);
  return Array.from({ length: 8 }, (_, i) => ({
    offset: [crash.point[0] + (random() - 0.5) * 1.2, crash.point[1] - 0.2 + random() * 0.4, crash.point[2] + (random() - 0.5) * 1.2],
    drift: [(random() - 0.5) * 0.6, 0.45 + random() * 0.5, (random() - 0.5) * 0.6],
    size: 0.35 + random() * 0.35,
    delay: i * 0.04,
  }));
};

const SmokePuff = ({ puff, age }: { puff: Puff; age: number }) => {
  const life = age - puff.delay;
  if (life <= 0) return null;
  const grow = 1 - Math.exp(-life * 3);
  const fade = clamp01(1 - life / 2);
  // Quantize opacity so the toon material cache stays small.
  const opacity = Math.round(fade * 0.85 * 20) / 20;
  if (opacity <= 0) return null;
  return (
    <Part
      geometry={shapes.sphere(puff.size)}
      color="#d6d3cd"
      opacity={opacity}
      position={[puff.offset[0] + puff.drift[0] * life, puff.offset[1] + puff.drift[1] * life, puff.offset[2] + puff.drift[2] * life]}
      scale={0.5 + grow * 1.4}
      outline={false}
      shadow={false}
    />
  );
};
