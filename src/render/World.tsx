import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Vec3 } from "../engine/math";
import { NARROW_NORTH_LOTS, NARROW_SOUTH_LOTS, SET_PROPS } from "../catalog/sets";
import type { PropSpec, SetName } from "../engine/spec";
import { Forest } from "./Forest";
import { Prop } from "./Props";
import type { StylePreset } from "./styles";
import { Part, shapes, toonGradient } from "./toon";

/** Sky, light, ground and the set. `focus` is where the camera looks, so shadows stay sharp around the action. */
export const World = ({ style, set, props, focus, debug }: { style: StylePreset; set: SetName; props: PropSpec[]; focus: Vec3; debug: boolean }) => {
  const setProps = useMemo(() => [...SET_PROPS[set], ...props], [set, props]);
  return (
    <>
      <fog attach="fog" args={[style.skyHorizon, style.fogNear, style.fogFar]} />
      <Sky style={style} />
      {style.clouds && <Clouds />}
      <hemisphereLight args={[style.ambientSky, style.ambientGround, style.ambientIntensity]} />
      <Sun style={style} focus={focus} />
      <Ground style={style} set={set} />
      {/* Trees are instanced (cheap even by the hundred); everything else is a regular prop. */}
      <Forest trees={setProps.filter((prop) => prop.type === "tree" || prop.type === "pine")} />
      {setProps.filter((prop) => prop.type !== "tree" && prop.type !== "pine").map((prop, index) => (
        <Prop key={index} prop={prop} night={style.night} />
      ))}
      {debug && <gridHelper args={[60, 60, "#ff006e", "#c8c8c8"]} position={[0, 0.08, 0]} />}
    </>
  );
};

const Sky = ({ style }: { style: StylePreset }) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(style.skyTop) }, horizon: { value: new THREE.Color(style.skyHorizon) } },
        vertexShader: `
          varying vec3 vDirection;
          void main() {
            vDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 horizon;
          varying vec3 vDirection;
          void main() {
            float height = clamp(vDirection.y * 1.6, 0.0, 1.0);
            gl_FragColor = vec4(mix(horizon, top, pow(height, 0.7)), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [style.skyTop, style.skyHorizon],
  );
  return (
    <mesh material={material} renderOrder={-1}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
};

const CLOUDS: Vec3[] = [[-60, 38, -150], [10, 45, -170], [75, 34, -140], [-120, 42, -110], [130, 40, -120], [-20, 30, -120]];
const Clouds = () => (
  <>
    {CLOUDS.map((position, index) => (
      <group key={index} position={position} scale={2.5 + (index % 3)}>
        <Part geometry={shapes.sphere(3)} color="#ffffff" outline={false} shadow={false} />
        <Part geometry={shapes.sphere(2.3)} color="#ffffff" position={[3, -0.6, 0]} outline={false} shadow={false} />
        <Part geometry={shapes.sphere(2.1)} color="#ffffff" position={[-3, -0.8, 0.5]} outline={false} shadow={false} />
      </group>
    ))}
  </>
);

const Sun = ({ style, focus }: { style: StylePreset; focus: Vec3 }) => {
  const light = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const sun = light.current;
    if (!sun) return;
    const [dx, dy, dz] = style.sunDirection;
    sun.position.set(focus[0] + dx * 40, dy * 40, focus[2] + dz * 40);
    sun.target.position.set(focus[0], 0, focus[2]);
    sun.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      color={style.sunColor}
      intensity={style.sunIntensity}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-28}
      shadow-camera-right={28}
      shadow-camera-top={28}
      shadow-camera-bottom={-28}
      shadow-camera-near={1}
      shadow-camera-far={120}
      shadow-bias={-0.003}
      shadow-normalBias={0.06}
    />
  );
};

const Ground = ({ style, set }: { style: StylePreset; set: SetName }) => (
  <>
    <Part geometry={shapes.plane(800, 800)} color={style.grass} outline={false} />
    {(set === "suburb" || set === "city") && <Street style={style} wide={set === "city"} />}
    {set === "narrow-street" && <NarrowStreet style={style} />}
    {set === "highway" && <Highway style={style} />}
    {set === "parking-lot" && <ParkingLot style={style} />}
  </>
);

const DASHES = Array.from({ length: 60 }, (_, i) => -150 + i * 5);

/** Two-lane road along the X axis, centered on z = 0. Lanes are at z = +1.8 (heading +X) and z = -1.8 (heading -X). */
const Street = ({ style, wide }: { style: StylePreset; wide: boolean }) => {
  const sidewalkWidth = wide ? 5 : 2.5;
  return (
    <>
      <Part geometry={shapes.plane(400, 7.2)} color={style.asphalt} position={[0, 0.03, 0]} outline={false} />
      {DASHES.map((x) => (
        <Part key={x} geometry={shapes.plane(2.2, 0.16)} color="#f8f9fa" position={[x, 0.06, 0]} outline={false} shadow={false} />
      ))}
      {[1, -1].map((side) => (
        <group key={side}>
          <Part geometry={shapes.plane(400, sidewalkWidth)} color={style.sidewalk} position={[0, 0.045, side * (3.6 + sidewalkWidth / 2)]} outline={false} />
          <LongBox length={400} size={[0.12, 0.2]} radius={0.02} color="#b8b2a7" position={[0, 0.06, side * 3.65]} />
        </group>
      ))}
      {!wide && [-32, -16, 0, 16, 32].map((x) => (
        <Part key={x} geometry={shapes.plane(3.6, 7)} color={style.sidewalk} position={[x, 0.036, -9.5]} outline={false} />
      ))}
    </>
  );
};

/**
 * A long rail/curb along X built from 40m sections. One giant mesh (hundreds of meters of thin box)
 * renders with artifacts — it showed up as a line drawn across faces in close-ups.
 */
const LongBox = ({ length, size, radius, color, position }: { length: number; size: [number, number]; radius: number; color: string; position: [number, number, number] }) => {
  const sectionLength = 40;
  const count = Math.round(length / sectionLength);
  return (
    <>
      {Array.from({ length: count }, (_, i) => position[0] - length / 2 + sectionLength * (i + 0.5)).map((x) => (
        <Part key={x} geometry={shapes.box(sectionLength + 0.02, size[0], size[1], radius)} color={color} position={[x, position[1], position[2]]} outline={false} />
      ))}
    </>
  );
};

const CURB_YELLOW = "#ffc300";
const STENCIL_SPACING = 9;
const STENCILS = Array.from({ length: 22 }, (_, i) => -99 + i * STENCIL_SPACING);

/** "EMERGENCY VEHICLES ONLY" painted in yellow, drawn once to a canvas. Reads upright from the +Z side. */
let stencilTexture: THREE.CanvasTexture | undefined;
const emergencyStencil = () => {
  if (stencilTexture) return stencilTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.fillStyle = CURB_YELLOW;
  context.font = "bold 150px 'DejaVu Sans', Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("EMERGENCY VEHICLES ONLY", 1024, 132, 1960);
  stencilTexture = new THREE.CanvasTexture(canvas);
  stencilTexture.colorSpace = THREE.SRGBColorSpace;
  stencilTexture.anisotropy = 8;
  return stencilTexture;
};

const Stencil = ({ position }: { position: [number, number, number] }) => {
  const material = useMemo(
    () => new THREE.MeshToonMaterial({ map: emergencyStencil(), gradientMap: toonGradient, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    [],
  );
  return <mesh geometry={shapes.plane(7.6, 0.95)} material={material} position={position} receiveShadow />;
};

/**
 * Narrow residential street along X: asphalt z -5..5, one lane between two yellow no-parking strips
 * (z ±3..±5, yellow curbs, "EMERGENCY VEHICLES ONLY" stencils), 2m sidewalks, and a 2-car driveway per lot.
 */
const NarrowStreet = ({ style }: { style: StylePreset }) => (
  <>
    <Part geometry={shapes.plane(400, 10)} color={style.asphalt} position={[0, 0.03, 0]} outline={false} />
    {[1, -1].map((side) => (
      <group key={side}>
        <LongBox length={400} size={[0.16, 0.012]} radius={0.004} color={CURB_YELLOW} position={[0, 0.04, side * 3.0]} />
        <Part geometry={shapes.plane(400, 2)} color={style.sidewalk} position={[0, 0.045, side * 6.1]} outline={false} />
        <LongBox length={400} size={[0.14, 0.2]} radius={0.02} color={CURB_YELLOW} position={[0, 0.06, side * 5.05]} />
        {STENCILS.map((x) => (
          <Stencil key={x} position={[x + (side > 0 ? STENCIL_SPACING / 2 : 0), 0.05, side * 4.0]} />
        ))}
      </group>
    ))}
    {[...NARROW_NORTH_LOTS.map((x) => [x, -1]), ...NARROW_SOUTH_LOTS.map((x) => [x, 1])].map(([x, side]) => (
      <group key={`${x}|${side}`}>
        <Part geometry={shapes.plane(5.6, 5.9)} color="#d6d0c4" position={[x + 3.5, 0.05, side * 8.0]} outline={false} />
        <Part geometry={shapes.plane(1.1, 3.9)} color={style.sidewalk} position={[x - 2.5, 0.048, side * 9.05]} outline={false} />
      </group>
    ))}
  </>
);

const HIGHWAY_DASHES = Array.from({ length: 160 }, (_, i) => -400 + i * 5);
const GUARDRAIL_POSTS = Array.from({ length: 160 }, (_, i) => -400 + i * 5);
const HILLS: [number, number, number, string][] = [
  [-180, -110, 40, "#5e9f4d"], [-60, -130, 55, "#689f52"], [70, -115, 45, "#5a9a48"], [190, -125, 50, "#63a24f"], [-260, -120, 45, "#578f45"],
];

/**
 * Forest highway along X. Eastbound (+X) lanes z = 1.8 and 5.4, shoulders z -1.0…0 and 7.2…9.4,
 * guardrails at z = -1.3 and 10, walls of tall pines beyond both. The westbound road sits behind the
 * left tree line (z ≈ -18), glimpsed between trunks.
 */
const Highway = ({ style }: { style: StylePreset }) => (
  <>
    <Part geometry={shapes.plane(800, 10.6)} color={style.asphalt} position={[0, 0.03, 4.2]} outline={false} />
    <Part geometry={shapes.plane(800, 8)} color={style.asphalt} position={[0, 0.03, -19]} outline={false} />
    {HIGHWAY_DASHES.map((x) => (
      <Part key={x} geometry={shapes.plane(2.6, 0.16)} color="#f8f9fa" position={[x, 0.06, 3.6]} outline={false} shadow={false} />
    ))}
    <Part geometry={shapes.plane(800, 0.18)} color="#ffd166" position={[0, 0.06, 0.05]} outline={false} shadow={false} />
    <Part geometry={shapes.plane(800, 0.18)} color="#f8f9fa" position={[0, 0.06, 7.2]} outline={false} shadow={false} />
    {[-1.3, 10].map((z) => (
      <group key={z}>
        <LongBox length={800} size={[0.32, 0.08]} radius={0.03} color="#adb5bd" position={[0, 0.62, z]} />
        {GUARDRAIL_POSTS.map((x) => (
          <Part key={x} geometry={shapes.box(0.12, 0.7, 0.12, 0.02)} color="#868e96" position={[x, 0.35, z + (z > 0 ? 0.05 : -0.05)]} outline={false} />
        ))}
      </group>
    ))}
    {HILLS.map(([x, z, radius, color]) => (
      <Part key={x} geometry={shapes.sphere(radius)} color={color} position={[x, -radius * 0.6, z]} scale={[1.6, 1, 1]} outline={false} shadow={false} />
    ))}
  </>
);

const ParkingLot = ({ style }: { style: StylePreset }) => (
  <>
    <Part geometry={shapes.plane(70, 44)} color={style.asphalt} position={[0, 0.03, -6]} outline={false} />
    {Array.from({ length: 13 }, (_, i) => -18 + i * 3).flatMap((x) =>
      [-12, -2].map((z) => (
        <Part key={`${x}-${z}`} geometry={shapes.plane(0.14, 5)} color="#f8f9fa" position={[x, 0.06, z]} outline={false} shadow={false} />
      )),
    )}
    <Part geometry={shapes.plane(70, 2.5)} color={style.sidewalk} position={[0, 0.045, -29.2]} outline={false} />
  </>
);
