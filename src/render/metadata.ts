import { FORMAT_SIZES, type SceneSpec } from "../engine/spec";

/** Composition size/fps/length for a scene. Previews always run at 30fps. */
export const sceneMetadata = (spec: SceneSpec, preview = false) => {
  const size = FORMAT_SIZES[spec.format];
  const fps = preview ? 30 : spec.fps;
  return { width: size.width, height: size.height, fps, durationInFrames: Math.max(1, Math.round(spec.duration * fps)) };
};
