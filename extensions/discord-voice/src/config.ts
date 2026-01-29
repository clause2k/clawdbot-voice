import { Type, type Static } from "@sinclair/typebox";

export const VoiceConfigSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  piperPath: Type.String({
    default: "/home/nuc/clawd/tools/piper/piper",
    description: "Path to Piper binary",
  }),
  piperModelPath: Type.String({
    default: "/home/nuc/clawd/tools/piper/voices/en_US-lessac-medium.onnx",
    description: "Path to Piper model",
  }),
  ffmpegPath: Type.String({
    default: "ffmpeg",
    description: "Path to ffmpeg binary",
  }),
  autoDeaf: Type.Boolean({
    default: false,
    description: "Whether the bot should deafen itself after joining",
  }),
  autoMute: Type.Boolean({
    default: false,
    description: "Whether the bot should mute itself after joining",
  }),
  sttEnabled: Type.Boolean({
    default: true,
    description: "Enable speech-to-text capture in voice channels",
  }),
  groqApiKey: Type.String({
    default: "",
    description: "Groq API key for Whisper transcription",
  }),
  groqApiEndpoint: Type.String({
    default: "https://api.groq.com/openai/v1/audio/transcriptions",
    description: "Groq Whisper API endpoint",
  }),
  whisperCppPath: Type.String({
    default: "",
    description: "Path to whisper.cpp binary",
  }),
  whisperCppModelPath: Type.String({
    default: "",
    description: "Path to whisper.cpp model",
  }),
  vadEnergyThreshold: Type.Number({
    default: 0.01,
    description: "Energy threshold for simple VAD",
  }),
});

export type VoiceConfig = Static<typeof VoiceConfigSchema>;

export function validateConfig(config: VoiceConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.piperPath) {
    errors.push("piperPath is required");
  }
  if (!config.piperModelPath) {
    errors.push("piperModelPath is required");
  }
  if (!config.ffmpegPath) {
    errors.push("ffmpegPath is required");
  }

  return { valid: errors.length === 0, errors };
}
