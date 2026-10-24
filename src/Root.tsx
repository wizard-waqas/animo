import { Composition } from "remotion";
import { VOICE_CLIPS } from "../voices/manifest";
import { type SceneSpec, parseScene } from "./engine/spec";
import { sceneMetadata } from "./render/metadata";
import { SceneVideo, type SceneVideoProps } from "./render/SceneVideo";

/**
 * Remotion Studio root: one composition per scenes/*.scene.ts file (the filename is the registration; there is
 * no list to maintain). The CLI renders through src/entry.render.tsx instead, which never imports scenes.
 */
const sceneFiles = require.context("../scenes", false, /\.scene\.ts$/);
const scenes = sceneFiles
  .keys()
  .map((key) => parseScene(sceneFiles(key).default as SceneSpec))
  .sort((a, b) => a.id.localeCompare(b.id));

const propsFor = (spec: SceneSpec): SceneVideoProps => ({ spec, clips: VOICE_CLIPS, debug: false, preview: false, silent: false });

export const Root = () => (
  <>
    {scenes.map((spec) => {
      const { width, height, fps, durationInFrames } = sceneMetadata(spec);
      return (
        <Composition
          key={spec.id}
          id={spec.id}
          component={SceneVideo}
          width={width}
          height={height}
          fps={fps}
          durationInFrames={durationInFrames}
          defaultProps={propsFor(spec)}
          calculateMetadata={({ props }) => sceneMetadata(props.spec, props.preview)}
        />
      );
    })}
  </>
);
