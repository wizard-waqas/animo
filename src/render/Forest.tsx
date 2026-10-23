import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { DEG } from "../engine/math";
import type { PropSpec } from "../engine/spec";
import { shapes, toonGradient } from "./toon";

/**
 * Trees drawn with GPU instancing: one draw call per tree part (and one per outline) no matter how many
 * trees there are. Same look as the regular tree/pine props in Props.tsx.
 */

interface TreePart {
  geometry: THREE.BufferGeometry;
  offset: [number, number, number];
  color: string;
}

const PARTS: Record<"tree" | "pine", TreePart[]> = {
  pine: [
    { geometry: shapes.cylinder(0.15, 0.2, 1.2), offset: [0, 0.6, 0], color: "#7a4b2e" },
    { geometry: shapes.cone(1.4, 2.2, 8), offset: [0, 2.0, 0], color: "#2e7d4f" },
    { geometry: shapes.cone(1.05, 1.8, 8), offset: [0, 3.1, 0], color: "#358f5b" },
  ],
  tree: [
    { geometry: shapes.cylinder(0.18, 0.25, 2), offset: [0, 1, 0], color: "#8d5a3b" },
    { geometry: shapes.sphere(1.4), offset: [0, 2.9, 0], color: "#4caf50" },
    { geometry: shapes.sphere(1.0), offset: [0.7, 2.4, 0.4], color: "#5cc95f" },
    { geometry: shapes.sphere(0.9), offset: [-0.6, 3.6, -0.2], color: "#43a047" },
  ],
};

const instancedOutline = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.022 }, color: { value: new THREE.Color("#1d1b26") } },
  vertexShader: `
    uniform float thickness;
    void main() {
      vec4 pushed = vec4(position + normal * thickness, 1.0);
      #ifdef USE_INSTANCING
        pushed = instanceMatrix * pushed;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * pushed;
    }`,
  fragmentShader: `
    uniform vec3 color;
    void main() { gl_FragColor = vec4(color, 1.0); }`,
  side: THREE.BackSide,
});

export const Forest = ({ trees }: { trees: PropSpec[] }) => {
  const byType = useMemo(() => ({
    pine: trees.filter((tree) => tree.type === "pine"),
    tree: trees.filter((tree) => tree.type === "tree"),
  }), [trees]);
  return (
    <>
      {(["pine", "tree"] as const).flatMap((type) =>
        byType[type].length === 0 ? [] : PARTS[type].map((part, index) => <InstancedPart key={`${type}-${index}`} part={part} trees={byType[type]} />),
      )}
    </>
  );
};

const InstancedPart = ({ part, trees }: { part: TreePart; trees: PropSpec[] }) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const outline = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonGradient }), []);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const color = new THREE.Color();
    trees.forEach((tree, index) => {
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.facing * DEG);
      const offset = new THREE.Vector3(...part.offset).multiplyScalar(tree.scale).applyQuaternion(rotation);
      matrix.compose(new THREE.Vector3(tree.at[0], 0, tree.at[1]).add(offset), rotation, new THREE.Vector3(tree.scale, tree.scale, tree.scale));
      mesh.current?.setMatrixAt(index, matrix);
      outline.current?.setMatrixAt(index, matrix);
      // Leaves take the tree's own color if given; trunks keep their brown.
      const isLeaves = part.color !== "#7a4b2e" && part.color !== "#8d5a3b";
      mesh.current?.setColorAt(index, color.set(isLeaves && tree.color ? tree.color : part.color));
    });
    for (const target of [mesh.current, outline.current]) {
      if (!target) continue;
      target.instanceMatrix.needsUpdate = true;
      if (target.instanceColor) target.instanceColor.needsUpdate = true;
      // Bounds over every instance, so three.js can skip the whole row when the camera looks away.
      target.computeBoundingSphere();
    }
  }, [trees, part]);
  return (
    <>
      <instancedMesh ref={mesh} args={[part.geometry, material, trees.length]} castShadow receiveShadow />
      <instancedMesh ref={outline} args={[part.geometry, instancedOutline, trees.length]} />
    </>
  );
};
