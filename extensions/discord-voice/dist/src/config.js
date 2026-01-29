import { Type } from "@sinclair/typebox";
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
});
export function validateConfig(config) {
    const errors = [];
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
//# sourceMappingURL=config.js.map