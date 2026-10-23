import { useMemo } from "react";
import * as THREE from "three";
import { type CharacterLook, RIG } from "../catalog/characters";
import type { CharacterState } from "../engine/characterTrack";
import { type Face, MOODS } from "../engine/expression";
import { Part, shapes } from "./toon";

const darken = (hex: string, amount: number) => {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.round(((value >> shift) & 255) * (1 - amount)));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
};

interface CharacterModelProps {
  look: CharacterLook;
  state: CharacterState;
  time: number;
  /** 0..1 mouth opening from speech (lip sync). */
  talk: number;
  /** Seed so characters don't all blink at the same moment. */
  seed: number;
}

/** Procedural cartoon person. Facing +Z, root at the ground between the feet. */
export const CharacterModel = ({ look, state, time, talk, seed }: CharacterModelProps) => {
  const { pose } = state;
  return (
    <group position={state.pos} rotation={[0, state.facing, 0]} scale={look.height}>
      <group position={[0, RIG.hipHeight + pose.rootY, 0]} scale={[1, pose.squash, 1]}>
        <Part geometry={shapes.box(0.34 * look.build, 0.2, 0.24, 0.08)} color={look.pants} position={[0, 0.02, 0]} />
        <Leg side={1} hip={pose.lHipX} knee={pose.lKnee} look={look} />
        <Leg side={-1} hip={pose.rHipX} knee={pose.rKnee} look={look} />
        <group rotation={[pose.spineX, pose.spineY, pose.spineZ]}>
          <Torso look={look} />
          <Arm side={1} shoulderX={pose.lShoulderX} shoulderZ={pose.lShoulderZ} elbow={pose.lElbow} look={look} />
          <Arm side={-1} shoulderX={pose.rShoulderX} shoulderZ={pose.rShoulderZ} elbow={pose.rElbow} look={look} item={state.item === "check" ? undefined : state.item} />
          {state.item === "check" && <BigCheck />}
          <Part geometry={shapes.cylinder(0.07, 0.08, 0.14)} color={look.skin} position={[0, 0.58, 0]} outline={false} />
          <group position={[0, RIG.headHeight, 0]} rotation={[pose.headX, pose.headY, pose.headZ]}>
            <Head look={look} time={time} talk={talk} seed={seed} face={state.face ?? MOODS.neutral} />
          </group>
        </group>
      </group>
    </group>
  );
};

const Leg = ({ side, hip, knee, look }: { side: 1 | -1; hip: number; knee: number; look: CharacterLook }) => (
  <group position={[side * RIG.hipSpacing * look.build, -0.02, 0]} rotation={[-hip, 0, 0]}>
    <Part geometry={shapes.limb(0.08, RIG.upperLeg)} color={look.pants} />
    <group position={[0, -RIG.upperLeg + 0.02, 0]} rotation={[knee, 0, 0]}>
      <Part geometry={shapes.limb(0.07, RIG.lowerLeg)} color={look.pants} />
      <Part geometry={shapes.box(0.14, 0.1, 0.26, 0.045)} color={look.shoes} position={[0, -RIG.lowerLeg + 0.03, 0.05]} />
    </group>
  </group>
);

const Arm = ({ side, shoulderX, shoulderZ, elbow, look, item }: { side: 1 | -1; shoulderX: number; shoulderZ: number; elbow: number; look: CharacterLook; item?: "phone" | "mug" }) => (
  <group position={[side * RIG.shoulderSpacing * look.build, RIG.shoulderHeight - 0.03, 0]} rotation={[-shoulderX, 0, side * shoulderZ]}>
    <Part geometry={shapes.limb(0.068, RIG.upperArm)} color={look.shirt} />
    <group position={[0, -RIG.upperArm + 0.02, 0]} rotation={[-elbow, 0, 0]}>
      <Part geometry={shapes.limb(0.06, RIG.lowerArm)} color={look.skin} />
      <Part geometry={shapes.sphere(0.075)} color={look.skin} position={[0, -RIG.lowerArm, 0]} />
      {item === "phone" && <Phone />}
      {item === "mug" && <Mug upright={shoulderX + elbow} />}
    </group>
  </group>
);

/** Phone gripped in the hand: long side along the forearm, glowing screen toward the palm side (+Z when the arm hangs). */
const Phone = () => (
  <group position={[0, -RIG.lowerArm - 0.06, 0.02]}>
    <Part geometry={shapes.box(0.1, 0.19, 0.02, 0.014)} color="#1b1b1b" outline={0.008} />
    <Part geometry={shapes.box(0.084, 0.165, 0.004, 0.004)} color="#bfe3ff" emissive="#7fb8ff" position={[0, 0, 0.012]} outline={false} shadow={false} />
    <Part geometry={shapes.sphere(0.012)} color="#555555" position={[0.026, 0.065, -0.012]} outline={false} shadow={false} />
  </group>
);

/** Coffee mug in the hand, kept upright (the forearm's swing is undone) with a slight tilt toward the drinker. */
const Mug = ({ upright }: { upright: number }) => (
  <group position={[0.02, -RIG.lowerArm - 0.03, 0.05]} rotation={[upright - 0.25, 0, 0]}>
    <Part geometry={shapes.cylinder(0.055, 0.05, 0.12, 16)} color="#ffffff" position={[0, 0.03, 0.04]} outline={0.008} />
    <Part geometry={shapes.cylinder(0.046, 0.046, 0.01, 16)} color="#5b3a1e" position={[0, 0.087, 0.04]} outline={false} shadow={false} />
    <Part geometry={shapes.torus(0.032, 0.011)} color="#ffffff" position={[-0.062, 0.03, 0.04]} rotation={[0, Math.PI / 2, 0]} outline={0.006} />
  </group>
);

const checkTextures = new Map<string, THREE.CanvasTexture>();
/** The giant novelty check, drawn once on a canvas. */
const checkTexture = () => {
  const key = "check";
  let texture = checkTextures.get(key);
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 460;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#e9f7e1";
    context.fillRect(0, 0, 1024, 460);
    context.strokeStyle = "#2d6a4f";
    context.lineWidth = 22;
    context.strokeRect(14, 14, 996, 432);
    context.fillStyle = "#1b4332";
    context.font = "800 46px Arial, sans-serif";
    context.fillText("MUDDY BROS. DIRT CO.", 50, 90);
    context.font = "600 36px Arial, sans-serif";
    context.fillText("PAY TO THE ORDER OF:  YOU", 50, 160);
    context.font = "900 150px Arial, sans-serif";
    context.textAlign = "center";
    context.fillStyle = "#1d1b26";
    context.fillText("$1,000,000", 512, 330);
    context.font = "italic 600 38px Arial, sans-serif";
    context.fillText("One million dollars & 00/100", 512, 405);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    checkTextures.set(key, texture);
  }
  return texture;
};

/** Held up in front of the chest with both hands (lives in the torso's frame, so it stays level). */
const BigCheck = () => {
  const texture = useMemo(() => checkTexture(), []);
  return (
    <group position={[0, RIG.shoulderHeight - 0.02, 0.62]} rotation={[-0.12, 0, 0]}>
      <Part geometry={shapes.box(1.12, 0.52, 0.02, 0.01)} color="#2d6a4f" outline={0.01} />
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[1.08, 0.485]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
};

const Torso = ({ look }: { look: CharacterLook }) => {
  const hasOveralls = look.accessories.includes("overalls");
  const hasTie = look.accessories.includes("tie");
  return (
    <>
      <Part geometry={shapes.box(0.46 * look.build, 0.56, 0.3, 0.13)} color={look.shirt} position={[0, 0.28, 0]} />
      {hasOveralls && (
        <>
          <Part geometry={shapes.box(0.3 * look.build, 0.26, 0.04, 0.02)} color={look.pants} position={[0, 0.16, 0.15]} outline={0.012} />
          <Part geometry={shapes.box(0.05, 0.3, 0.32, 0.02)} color={look.pants} position={[0.12 * look.build, 0.4, 0]} outline={false} />
          <Part geometry={shapes.box(0.05, 0.3, 0.32, 0.02)} color={look.pants} position={[-0.12 * look.build, 0.4, 0]} outline={false} />
        </>
      )}
      {hasTie && <Part geometry={shapes.box(0.07, 0.32, 0.03, 0.015)} color={look.accent ?? "#c1121f"} position={[0, 0.34, 0.155]} outline={0.01} />}
      {look.accessories.includes("badge") && (
        <>
          <Part geometry={shapes.cylinder(0.045, 0.045, 0.02, 6)} color="#ffd166" position={[0.11 * look.build, 0.4, 0.158]} rotation={[Math.PI / 2, 0, 0]} outline={0.006} shadow={false} />
          <Part geometry={shapes.box(0.36 * look.build, 0.07, 0.31, 0.03)} color="#111111" position={[0, 0.03, 0]} outline={false} />
        </>
      )}
    </>
  );
};

/** Blend a hex color toward another (used for the angry red flush). */
const mixColor = (from: string, to: string, amount: number) => {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
};

const Head = ({ look, time, talk, seed, face }: { look: CharacterLook; time: number; talk: number; seed: number; face: Face }) => {
  const blinkCycle = (time + seed * 1.37) % 3.7;
  const blinking = blinkCycle < 0.12 && face.sclera < 0.5;
  const talkOpen = talk;
  // Shouting opens the mouth wider.
  const mouthOpen = Math.min(1, face.mouthOpen + talkOpen * (0.55 + face.redness * 0.8));
  const tremble = face.tremble * 0.035 * Math.sin(time * 41 + seed);
  // Quantize the flush so the material cache stays small.
  const skin = mixColor(look.skin, "#e63946", Math.round(face.redness * 0.55 * 10) / 10);
  const r = RIG.headRadius;
  return (
    <group rotation={[0, tremble, tremble * 0.5]}>
      <Part geometry={shapes.sphere(r)} color={skin} />
      <Part geometry={shapes.sphere(0.06)} color={skin} position={[r, 0, 0]} scale={[0.6, 1, 1]} />
      <Part geometry={shapes.sphere(0.06)} color={skin} position={[-r, 0, 0]} scale={[0.6, 1, 1]} />
      <Part geometry={shapes.sphere(0.042)} color={darken(skin, 0.12)} position={[0, -0.03, r - 0.005]} outline={false} />
      <Eye x={0.095} closed={blinking} face={face} />
      <Eye x={-0.095} closed={blinking} face={face} />
      <Brow side={1} face={face} color={browColor(look)} />
      <Brow side={-1} face={face} color={browColor(look)} />
      <Mouth face={face} open={mouthOpen} />
      {face.sweat > 0.3 && <SweatDrop time={time} amount={face.sweat} />}
      <Hair look={look} />
      <Accessories look={look} />
    </group>
  );
};

/** Brows are darker than the hair so they read against bangs (light/gray hair keeps a light brow). */
const browColor = (look: CharacterLook) => (look.hairStyle === "bald" ? darken(look.skin, 0.45) : darken(look.hair, 0.55));

const Eye = ({ x, closed, face }: { x: number; closed: boolean; face: Face }) => {
  const wide = face.sclera > 0.5;
  const size = face.eyeScale;
  return (
    <group position={[x, 0.045, RIG.headRadius - 0.025]} scale={[size, closed ? 0.15 : size, size]}>
      {wide ? (
        <>
          <Part geometry={shapes.sphere(0.058)} color="#ffffff" scale={[1, 1.15, 0.7]} outline={0.01} shadow={false} />
          <Part geometry={shapes.sphere(0.02)} color="#1b1b1b" position={[0, 0, 0.04]} outline={false} shadow={false} />
        </>
      ) : (
        <>
          <Part geometry={shapes.sphere(0.042)} color="#1b1b1b" outline={false} />
          <Part geometry={shapes.sphere(0.013)} color="#ffffff" position={[0.012, 0.015, 0.032]} outline={false} shadow={false} />
        </>
      )}
    </group>
  );
};

/** Eyebrow: side 1 is the character's left (+X). Positive tilt lifts the inner end (worried). */
const Brow = ({ side, face, color }: { side: 1 | -1; face: Face; color: string }) => (
  <Part
    // Sits just in front of the hairline so bangs never hide it.
    geometry={shapes.box(0.12, 0.032, 0.03, 0.013)}
    color={color}
    position={[side * 0.1, 0.122 + face.browRaise + (face.sclera > 0.5 ? 0.02 : 0), RIG.headRadius - 0.006]}
    rotation={[-0.35, 0, side * -face.browTilt]}
    outline={false}
    shadow={false}
  />
);

/**
 * Mouth: a curved bar (smile/frown/smirk) that becomes a dark open oval when talking, shouting or gasping.
 * Built from three short segments so it can bend.
 */
const Mouth = ({ face, open }: { face: Face; open: number }) => {
  const r = RIG.headRadius;
  const y = -0.115;
  const z = r - 0.03;
  if (open > 0.25) {
    return (
      <Part
        geometry={shapes.sphere(0.05)}
        color="#5a1e1e"
        position={[face.mouthSkew * 0.02, y - 0.005, z - 0.01]}
        scale={[0.9 + open * 0.5, 0.35 + open * 0.9, 0.5]}
        outline={0.008}
        shadow={false}
      />
    );
  }
  const bend = face.mouthCurve * 0.35;
  const skew = face.mouthSkew * 0.25;
  return (
    <group position={[0, y, z]} rotation={[0, 0, skew]}>
      <Part geometry={shapes.capsule(0.014, 0.04)} color="#5a1e1e" rotation={[0, 0, Math.PI / 2]} outline={false} shadow={false} />
      <Part geometry={shapes.capsule(0.014, 0.035)} color="#5a1e1e" position={[0.045, 0.012 * face.mouthCurve, -0.004]} rotation={[0, 0, Math.PI / 2 + bend]} outline={false} shadow={false} />
      <Part geometry={shapes.capsule(0.014, 0.035)} color="#5a1e1e" position={[-0.045, 0.012 * face.mouthCurve, -0.004]} rotation={[0, 0, Math.PI / 2 - bend]} outline={false} shadow={false} />
    </group>
  );
};

/** Nervous sweat drop sliding down the side of the forehead. */
const SweatDrop = ({ time, amount }: { time: number; amount: number }) => {
  const slide = (time * 0.35) % 1;
  return (
    <group position={[-0.2, 0.17 - slide * 0.12, 0.17]} scale={amount}>
      <Part geometry={shapes.sphere(0.035)} color="#8fd3ff" outline={0.008} shadow={false} />
      <Part geometry={shapes.cone(0.03, 0.06, 10)} color="#8fd3ff" position={[0, 0.04, 0]} outline={false} shadow={false} />
    </group>
  );
};

const Hair = ({ look }: { look: CharacterLook }) => {
  const r = RIG.headRadius;
  const cap = <Part shadow={false} geometry={shapes.sphere(r + 0.02)} color={look.hair} position={[0, 0.07, -0.035]} scale={[1, 0.82, 1]} />;
  switch (look.hairStyle) {
    case "bald":
      return (
        <>
          <Part shadow={false} geometry={shapes.sphere(0.09)} color={look.hair} position={[0.21, 0.0, -0.1]} />
          <Part shadow={false} geometry={shapes.sphere(0.09)} color={look.hair} position={[-0.21, 0.0, -0.1]} />
        </>
      );
    case "short":
      return cap;
    case "spiky":
      return (
        <>
          {cap}
          {[-0.12, 0, 0.12].map((x) => (
            <Part shadow={false} key={x} geometry={shapes.cone(0.07, 0.16, 6)} color={look.hair} position={[x, r + 0.04, -0.02]} rotation={[-0.3, 0, -x * 2.5]} />
          ))}
        </>
      );
    case "long":
      return (
        <>
          {cap}
          <Part shadow={false} geometry={shapes.box(0.5, 0.5, 0.18, 0.08)} color={look.hair} position={[0, -0.14, -0.15]} />
        </>
      );
    case "bun":
      return (
        <>
          {cap}
          <Part shadow={false} geometry={shapes.sphere(0.11)} color={look.hair} position={[0, 0.24, -0.16]} />
        </>
      );
    case "ponytail":
      return (
        <>
          {cap}
          <Part shadow={false} geometry={shapes.limb(0.075, 0.36)} color={look.hair} position={[0, 0.12, -0.27]} rotation={[0.45, 0, 0]} />
        </>
      );
    case "curly":
      return (
        <>
          {cap}
          {[[0.17, 0.12, 0.05], [-0.17, 0.12, 0.05], [0.1, 0.22, -0.05], [-0.1, 0.22, -0.05], [0, 0.24, 0.05], [0.2, 0.0, -0.1], [-0.2, 0.0, -0.1], [0, 0.1, -0.24]].map(([x, y, z]) => (
            <Part shadow={false} key={`${x}${y}${z}`} geometry={shapes.sphere(0.1)} color={look.hair} position={[x, y, z]} />
          ))}
        </>
      );
  }
};

const Accessories = ({ look }: { look: CharacterLook }) => {
  const r = RIG.headRadius;
  return (
    <>
      {look.accessories.includes("glasses") && (
        <group position={[0, 0.045, r + 0.0]}>
          <Part shadow={false} geometry={shapes.torus(0.065, 0.011)} color="#222222" position={[0.095, 0, 0]} outline={false} />
          <Part shadow={false} geometry={shapes.torus(0.065, 0.011)} color="#222222" position={[-0.095, 0, 0]} outline={false} />
          <Part shadow={false} geometry={shapes.box(0.06, 0.015, 0.015, 0.005)} color="#222222" outline={false} />
        </group>
      )}
      {look.accessories.includes("mustache") && (
        <Part shadow={false} geometry={shapes.capsule(0.03, 0.12)} color={look.hair} position={[0, -0.075, r - 0.01]} rotation={[0, 0, Math.PI / 2]} outline={0.01} />
      )}
      {look.accessories.includes("beard") && (
        <Part shadow={false} geometry={shapes.sphere(0.2)} color={look.hair} position={[0, -0.13, 0.06]} scale={[1.05, 0.7, 0.9]} />
      )}
      {look.accessories.includes("cap") && (
        <>
          <Part shadow={false} geometry={shapes.sphere(r + 0.03)} color={look.accent ?? "#e63946"} position={[0, 0.09, -0.02]} scale={[1, 0.72, 1]} />
          <Part shadow={false} geometry={shapes.box(0.36, 0.035, 0.22, 0.015)} color={look.accent ?? "#e63946"} position={[0, 0.13, 0.27]} />
        </>
      )}
      {look.accessories.includes("police-cap") && (
        <>
          <Part geometry={shapes.cylinder(0.3, 0.27, 0.16, 20)} color={look.accent ?? "#16213e"} position={[0, 0.25, -0.01]} rotation={[-0.08, 0, 0]} shadow={false} />
          <Part geometry={shapes.cylinder(0.27, 0.27, 0.04, 20)} color="#111111" position={[0, 0.18, 0]} outline={false} shadow={false} />
          <Part geometry={shapes.box(0.32, 0.03, 0.17, 0.012)} color="#111111" position={[0, 0.17, 0.27]} rotation={[0.25, 0, 0]} shadow={false} />
          <Part geometry={shapes.cylinder(0.035, 0.035, 0.02, 6)} color="#ffd166" position={[0, 0.27, 0.28]} rotation={[Math.PI / 2 - 0.1, 0, 0]} outline={0.005} shadow={false} />
        </>
      )}
      {look.accessories.includes("bow") && (
        <Part shadow={false} geometry={shapes.sphere(0.07)} color={look.accent ?? "#ff006e"} position={[0.18, 0.2, -0.05]} scale={[1.6, 1, 0.8]} />
      )}
    </>
  );
};
