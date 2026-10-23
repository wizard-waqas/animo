import { Composition, registerRoot } from "remotion";
import { parseScene } from "./engine/spec";
import { sceneMetadata } from "./render/metadata";
import { SceneVideo, type SceneVideoProps } from "./render/SceneVideo";

/**
 * CLI render entry point: a single composition that takes the whole scene as inputProps. It imports no scene
 * files and no voice manifest, so the webpack bundle only changes when src/ changes (see bundleOnce in scripts/lib.ts).
 */
const placeholder: SceneVideoProps = { spec: parseScene({ id: "placeholder", duration: 1, cast: {}, timeline: [] }), clips: {} };

const RenderRoot = () => (
  <Composition
    id="scene"
    component={SceneVideo}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={placeholder}
    calculateMetadata={({ props }) => sceneMetadata(props.spec, props.preview)}
  />
);

registerRoot(RenderRoot);
