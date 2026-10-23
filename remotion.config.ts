import { Config } from "@remotion/cli/config";

// Software WebGL on GPU-less Linux boxes, real GPU everywhere else.
Config.setChromiumOpenGlRenderer(process.platform === "linux" ? "swangle" : "angle");
Config.setVideoImageFormat("jpeg");
if (process.env.TOON_BROWSER) Config.setBrowserExecutable(process.env.TOON_BROWSER);
