import type { StyleName } from "../engine/spec";

export interface StylePreset {
  skyTop: string;
  skyHorizon: string;
  grass: string;
  asphalt: string;
  sidewalk: string;
  sunColor: string;
  sunIntensity: number;
  /** Direction the sunlight comes from (normalized-ish). */
  sunDirection: [number, number, number];
  ambientSky: string;
  ambientGround: string;
  ambientIntensity: number;
  fogNear: number;
  fogFar: number;
  night: boolean;
  clouds: boolean;
  /** A visible sun low in the sky (direction toward it). */
  sunDisc?: { color: string; glow: string; direction: [number, number, number] };
}

export const STYLE_PRESETS: Record<StyleName, StylePreset> = {
  sunny: {
    skyTop: "#4cb8ff", skyHorizon: "#d8f1ff", grass: "#8fd16a", asphalt: "#555b6e", sidewalk: "#d9d4c7",
    sunColor: "#fff3df", sunIntensity: 2.4, sunDirection: [-0.5, 1, 0.55],
    ambientSky: "#ffffff", ambientGround: "#7d9a5b", ambientIntensity: 1.25, fogNear: 60, fogFar: 190, night: false, clouds: true,
  },
  sunset: {
    skyTop: "#5b4b9a", skyHorizon: "#ffb27a", grass: "#7fae5a", asphalt: "#4d4a5c", sidewalk: "#c9b8a8",
    // The sun sets in the east (+X) so cars "drive off into the sunset" along the roads' main direction.
    sunColor: "#ffbf80", sunIntensity: 2.2, sunDirection: [0.85, 0.35, 0.35],
    ambientSky: "#ffd6b0", ambientGround: "#5b4b6a", ambientIntensity: 1.0, fogNear: 50, fogFar: 170, night: false, clouds: true,
    sunDisc: { color: "#fff1c9", glow: "#ffb35c", direction: [1, 0.07, 0.06] },
  },
  night: {
    skyTop: "#0b1033", skyHorizon: "#3a4a85", grass: "#3f6e4a", asphalt: "#3b3f52", sidewalk: "#6d7186",
    sunColor: "#dfe5ff", sunIntensity: 1.6, sunDirection: [0.4, 1, 0.6],
    ambientSky: "#c3c9f2", ambientGround: "#3a3f5c", ambientIntensity: 1.3, fogNear: 35, fogFar: 140, night: true, clouds: false,
  },
  overcast: {
    skyTop: "#9aa5b1", skyHorizon: "#dfe4e8", grass: "#86a874", asphalt: "#5c606b", sidewalk: "#cfcfcf",
    sunColor: "#ffffff", sunIntensity: 1.1, sunDirection: [-0.3, 1, 0.4],
    ambientSky: "#ffffff", ambientGround: "#8a9480", ambientIntensity: 1.6, fogNear: 40, fogFar: 150, night: false, clouds: true,
  },
};
