/**
 * Procedural cartoon people. Every character shares one rig (see RIG), so every
 * animation clip works on every character.
 */

/** Rig measurements in meters at height 1.0. Root is the ground point between the feet. */
export const RIG = {
  hipHeight: 0.72,
  legLength: 0.7,
  upperLeg: 0.36,
  lowerLeg: 0.34,
  hipSpacing: 0.1,
  shoulderHeight: 0.48, // above the hips
  shoulderSpacing: 0.25,
  upperArm: 0.27,
  lowerArm: 0.25,
  headHeight: 0.84, // head center above the hips
  headRadius: 0.27,
} as const;

export const HAIR_STYLES = ["short", "long", "bun", "ponytail", "spiky", "bald", "curly"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const ACCESSORIES = ["cap", "glasses", "tie", "beard", "mustache", "overalls", "bow"] as const;
export type Accessory = (typeof ACCESSORIES)[number];

export interface CharacterLook {
  label: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
  shoes: string;
  /** Overall scale. 1 ≈ 1.8m. Kids are ~0.65. */
  height: number;
  /** Body width multiplier. */
  build: number;
  accessories: Accessory[];
  accent?: string;
}

export const CHARACTERS = {
  "casual-guy": {
    label: "Casual guy (t-shirt, jeans)",
    skin: "#f1c27d", hair: "#3b2a20", hairStyle: "short",
    shirt: "#2a9d8f", pants: "#264653", shoes: "#f4f1de",
    height: 0.95, build: 1, accessories: [],
  },
  "casual-girl": {
    label: "Casual girl (ponytail, hoodie)",
    skin: "#e0ac69", hair: "#7b3f00", hairStyle: "ponytail",
    shirt: "#e76f51", pants: "#3d405b", shoes: "#ffffff",
    height: 0.9, build: 0.92, accessories: [],
  },
  "business-man": {
    label: "Business man (suit, tie)",
    skin: "#c68642", hair: "#1b1b1b", hairStyle: "short",
    shirt: "#2b2d42", pants: "#2b2d42", shoes: "#111111",
    height: 0.97, build: 1.02, accessories: ["tie"], accent: "#d62828",
  },
  "business-woman": {
    label: "Business woman (blazer, bun)",
    skin: "#8d5524", hair: "#1b1b1b", hairStyle: "bun",
    shirt: "#5e548e", pants: "#22223b", shoes: "#111111",
    height: 0.92, build: 0.92, accessories: ["glasses"],
  },
  kid: {
    label: "Kid (spiky hair)",
    skin: "#ffdbac", hair: "#f4a261", hairStyle: "spiky",
    shirt: "#ffbe0b", pants: "#3a86ff", shoes: "#ff006e",
    height: 0.62, build: 0.95, accessories: [],
  },
  grandpa: {
    label: "Grandpa (mustache, glasses)",
    skin: "#f1c27d", hair: "#e0e0e0", hairStyle: "bald",
    shirt: "#a3b18a", pants: "#6b705c", shoes: "#5c4033",
    height: 0.9, build: 1.08, accessories: ["mustache", "glasses"],
  },
  grandma: {
    label: "Grandma (curly gray hair)",
    skin: "#ffdbac", hair: "#d9d9d9", hairStyle: "curly",
    shirt: "#c9184a", pants: "#590d22", shoes: "#3d3d3d",
    height: 0.85, build: 1, accessories: ["glasses"],
  },
  mechanic: {
    label: "Mechanic / installer (cap, overalls)",
    skin: "#c68642", hair: "#2b1d14", hairStyle: "short",
    shirt: "#ffffff", pants: "#1d3557", shoes: "#2b2b2b",
    height: 0.96, build: 1.05, accessories: ["cap", "overalls", "beard"], accent: "#1d3557",
  },
} satisfies Record<string, CharacterLook>;

export type CharacterModel = keyof typeof CHARACTERS;
export const CHARACTER_MODELS = Object.keys(CHARACTERS) as CharacterModel[];
