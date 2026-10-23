import * as THREE from "three";
import type { FrameState } from "../engine/compile";
import type { Vec3 } from "../engine/math";

/** A thin stick between two points (wires, lightning segments). */
const Stick = ({ from, to, radius, color }: { from: Vec3; to: Vec3; radius: number; color: string }) => {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const length = start.distanceTo(end);
  if (length < 1e-4) return null;
  const middle = start.clone().add(end).multiplyScalar(0.5);
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  return (
    <mesh position={middle} quaternion={orientation}>
      <cylinderGeometry args={[radius, radius, length, 5]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
};

/** Deterministic jitter so the lightning flickers per frame but renders identically every time. */
const jitter = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};

const Bolt = ({ center, seed }: { center: Vec3; seed: number }) => {
  const points: Vec3[] = [];
  const angle = jitter(seed) * Math.PI * 2;
  const reach = 0.5 + Math.abs(jitter(seed + 1)) * 0.4;
  for (let i = 0; i <= 5; i++) {
    const along = (i / 5) * reach;
    points.push([
      center[0] + Math.cos(angle) * along + jitter(seed + i * 3) * 0.16,
      center[1] + (jitter(seed + 2) * 1.0) * (i / 5) + jitter(seed + i * 5) * 0.12,
      center[2] + Math.sin(angle) * along + jitter(seed + i * 7) * 0.16,
    ]);
  }
  return (
    <>
      {points.slice(1).map((point, index) => (
        <Stick key={index} from={points[index]} to={point} radius={0.018} color={index % 2 ? "#e0fbff" : "#7df9ff"} />
      ))}
    </>
  );
};

export const ZapEffect = ({ zap }: { zap: FrameState["zaps"][number] }) => {
  const flicker = Math.floor(zap.t * 30);
  // Wires sag a little between the hand and the target.
  const sag: Vec3 = [(zap.hand[0] + zap.body[0]) / 2, Math.min(zap.hand[1], zap.body[1]) - 0.15, (zap.hand[2] + zap.body[2]) / 2];
  return (
    <>
      {[-0.05, 0.05].map((offset) => (
        <group key={offset} position={[0, offset, 0]}>
          <Stick from={zap.hand} to={sag} radius={0.008} color="#ffd166" />
          <Stick from={sag} to={zap.body} radius={0.008} color="#ffd166" />
        </group>
      ))}
      {zap.electrified && [0, 1, 2, 3, 4].map((index) => <Bolt key={index} center={zap.body} seed={flicker * 7 + index * 13} />)}
      {zap.electrified && (
        <mesh position={zap.body}>
          <sphereGeometry args={[0.45 + 0.08 * Math.abs(jitter(flicker)), 12, 8]} />
          <meshBasicMaterial color="#7df9ff" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
    </>
  );
};
