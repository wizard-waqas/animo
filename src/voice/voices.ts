import type { CharacterModel } from "../catalog/characters";

/**
 * Default realistic voice per character model, per provider. Override per character with
 * character(id, model, { voice: "<provider voice id>" }).
 *
 * ElevenLabs: premade voice IDs (run `npm run voices -- --list` to see what your account has).
 * Google: Cloud Text-to-Speech Chirp 3 HD voices.
 */
export type VoiceProvider = "elevenlabs" | "google";

export const DEFAULT_VOICES: Record<VoiceProvider, Record<CharacterModel, string>> = {
  elevenlabs: {
    "casual-guy": "iP95p4xoKVk53GoZ742B", // Chris: casual, down-to-earth
    "casual-girl": "cgSgspJ2msm6clMCkdW9", // Jessica: young, expressive
    "business-man": "nPczCjzI2devNBz1zQrb", // Brian: deep, measured
    "business-woman": "EXAVITQu4vr4xnSDxMaL", // Sarah: confident
    kid: "FGY2WhTYpPnrIDTdsKH5", // Laura: youthful
    grandpa: "pqHfZKP75CvOlQylNhV4", // Bill: older, warm
    grandma: "XrExE9yKIg1WjnnlVkGX", // Matilda: warm
    mechanic: "bIHbv24MWmeRgasZH58o", // Will: friendly
  },
  google: {
    "casual-guy": "en-US-Chirp3-HD-Puck",
    "casual-girl": "en-US-Chirp3-HD-Leda",
    "business-man": "en-US-Chirp3-HD-Charon",
    "business-woman": "en-US-Chirp3-HD-Kore",
    kid: "en-US-Chirp3-HD-Zephyr",
    grandpa: "en-US-Chirp3-HD-Algenib",
    grandma: "en-US-Chirp3-HD-Gacrux",
    mechanic: "en-US-Chirp3-HD-Fenrir",
  },
};

/**
 * The voice identity used for a character. It's the explicit `voice` if set, otherwise "model:<model>",
 * which the generator resolves to the provider's default. Line keys hash this, so they stay
 * stable across providers — regenerate with --force after switching provider.
 */
export const voiceIdentity = (model: CharacterModel, voice?: string) => voice ?? `model:${model}`;

export const resolveVoice = (identity: string, provider: VoiceProvider) =>
  identity.startsWith("model:") ? DEFAULT_VOICES[provider][identity.slice(6) as CharacterModel] : identity;
