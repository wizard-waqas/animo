import * as THREE from "three";
import type { CameraState } from "../engine/cameraTrack";
import type { Vec3 } from "../engine/math";

/** Project a world point to pixel coordinates using the same camera the 3D view uses. */
export const makeProjector = (camera: CameraState, width: number, height: number) => {
  const perspective = new THREE.PerspectiveCamera(camera.fov, width / height, 0.1, 1000);
  perspective.position.set(...camera.position);
  perspective.lookAt(...camera.lookAt);
  perspective.updateMatrixWorld();
  return (point: Vec3) => {
    const projected = new THREE.Vector3(...point).project(perspective);
    return {
      x: ((projected.x + 1) / 2) * width,
      y: ((1 - projected.y) / 2) * height,
      visible: projected.z < 1 && Math.abs(projected.x) <= 1.2 && Math.abs(projected.y) <= 1.2,
      /** In front of the camera and only somewhat off-screen — speech bubbles get pinned to the edge. */
      nearScreen: projected.z < 1 && Math.abs(projected.x) <= 2.5 && Math.abs(projected.y) <= 2.5,
    };
  };
};
