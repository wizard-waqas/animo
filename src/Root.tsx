import { Composition } from "remotion";
import { scenes } from "../scenes";
import { FORMAT_SIZES } from "./engine/spec";
import { SceneVideo, type SceneVideoProps } from "./render/SceneVideo";

export const Root = () => (
  <>
    {scenes.map((scene) => {
      const size = FORMAT_SIZES[scene.format];
      return (
        <Composition
          key={scene.id}
          id={scene.id}
          component={SceneVideo}
          width={size.width}
          height={size.height}
          fps={scene.fps}
          durationInFrames={Math.round(scene.duration * scene.fps)}
          defaultProps={{ sceneId: scene.id, debug: false, preview: false }}
          calculateMetadata={({ props }) => {
            const fps = props.preview ? 30 : scene.fps;
            return { fps, durationInFrames: Math.round(scene.duration * fps) };
          }}
        />
      );
    })}
  </>
);
