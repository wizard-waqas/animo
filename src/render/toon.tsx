import { type ReactNode, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Cartoon look: 3-step toon shading plus an inverted-hull outline on every part.
 * Geometries and materials are cached so re-rendering every frame stays cheap.
 */

const gradientMap = (() => {
  const steps = new Uint8Array([125, 195, 255]);
  const texture = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
})();

const toonMaterials = new Map<string, THREE.Material>();
export const toonMaterial = (color: string, options: { opacity?: number; emissive?: string } = {}) => {
  const key = `${color}|${options.opacity ?? 1}|${options.emissive ?? ""}`;
  let material = toonMaterials.get(key);
  if (!material) {
    material = new THREE.MeshToonMaterial({
      color,
      gradientMap,
      transparent: options.opacity !== undefined && options.opacity < 1,
      opacity: options.opacity ?? 1,
      depthWrite: options.opacity === undefined || options.opacity >= 1,
      emissive: options.emissive ?? "#000000",
    });
    toonMaterials.set(key, material);
  }
  return material;
};

const OUTLINE_COLOR = "#1d1b26";
const outlineMaterials = new Map<number, THREE.ShaderMaterial>();
export const outlineMaterial = (thickness = 0.022) => {
  let material = outlineMaterials.get(thickness);
  if (!material) {
    material = new THREE.ShaderMaterial({
      uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(OUTLINE_COLOR) } },
      vertexShader: `
        uniform float thickness;
        void main() {
          vec3 pushed = position + normal * thickness;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pushed, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 color;
        void main() { gl_FragColor = vec4(color, 1.0); }`,
      side: THREE.BackSide,
    });
    outlineMaterials.set(thickness, material);
  }
  return material;
};

const geometries = new Map<string, THREE.BufferGeometry>();
const cachedGeometry = (key: string, create: () => THREE.BufferGeometry) => {
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = create();
    geometries.set(key, geometry);
  }
  return geometry;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

export const shapes = {
  box: (w: number, h: number, d: number, radius = 0.06) => {
    const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
    return cachedGeometry(`box|${round(w)}|${round(h)}|${round(d)}|${round(r)}`, () => new RoundedBoxGeometry(w, h, d, 3, r));
  },
  sphere: (radius: number) => cachedGeometry(`sphere|${round(radius)}`, () => new THREE.SphereGeometry(radius, 24, 16)),
  /** Capsule hanging down from its top end (pivot at the top). */
  limb: (radius: number, length: number) =>
    cachedGeometry(`limb|${round(radius)}|${round(length)}`, () => {
      const geometry = new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.001), 6, 12);
      geometry.translate(0, -length / 2, 0);
      return geometry;
    }),
  capsule: (radius: number, length: number) =>
    cachedGeometry(`capsule|${round(radius)}|${round(length)}`, () => new THREE.CapsuleGeometry(radius, length, 6, 14)),
  /** Cylinder lying along X (wheels). */
  wheel: (radius: number, width: number) =>
    cachedGeometry(`wheel|${round(radius)}|${round(width)}`, () => {
      const geometry = new THREE.CylinderGeometry(radius, radius, width, 28, 1);
      geometry.rotateZ(Math.PI / 2);
      return geometry;
    }),
  cylinder: (top: number, bottom: number, height: number, segments = 16) =>
    cachedGeometry(`cyl|${round(top)}|${round(bottom)}|${round(height)}|${segments}`, () => new THREE.CylinderGeometry(top, bottom, height, segments)),
  cone: (radius: number, height: number, segments = 12) =>
    cachedGeometry(`cone|${round(radius)}|${round(height)}|${segments}`, () => new THREE.ConeGeometry(radius, height, segments)),
  torus: (radius: number, tube: number) =>
    cachedGeometry(`torus|${round(radius)}|${round(tube)}`, () => new THREE.TorusGeometry(radius, tube, 8, 24)),
  plane: (w: number, d: number) =>
    cachedGeometry(`plane|${round(w)}|${round(d)}`, () => {
      const geometry = new THREE.PlaneGeometry(w, d);
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    }),
};

type Triple = [number, number, number];

interface PartProps {
  geometry: THREE.BufferGeometry;
  color: string;
  position?: Triple;
  rotation?: Triple;
  scale?: Triple | number;
  outline?: number | false;
  opacity?: number;
  emissive?: string;
  shadow?: boolean;
  children?: ReactNode;
}

/** One toon-shaded mesh with its outline. */
export const Part = ({ geometry, color, position, rotation, scale, outline = 0.022, opacity, emissive, shadow = true, children }: PartProps) => {
  const material = useMemo(() => toonMaterial(color, { opacity, emissive }), [color, opacity, emissive]);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={geometry} material={material} castShadow={shadow} receiveShadow />
      {outline !== false && <mesh geometry={geometry} material={outlineMaterial(outline)} />}
      {children}
    </group>
  );
};
