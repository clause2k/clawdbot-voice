import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { VoiceConfigSchema, validateConfig } from "./src/config.js";
import { createVoiceRuntime } from "./src/runtime.js";
const plugin = {
    id: "discord-voice",
    name: "Discord Voice",
    description: "Discord voice channel support with Piper TTS (Phase 1)",
    configSchema: {
        parse: (value) => Value.Default(VoiceConfigSchema, value ?? {}),
        uiHints: {
            enabled: { label: "Enable Voice", help: "Enable Discord voice features" },
            piperPath: { label: "Piper Path", help: "Path to Piper binary" },
            piperModelPath: { label: "Piper Model", help: "Path to Piper model" },
            ffmpegPath: { label: "FFmpeg Path", help: "Path to ffmpeg binary" },
        },
    },
    register(api) {
        const config = Value.Default(VoiceConfigSchema, api.pluginConfig ?? {});
        const validation = validateConfig(config);
        if (!validation.valid) {
            api.logger.warn(`[discord-voice] Config issues: ${validation.errors.join("; ")}`);
        }
        let runtimePromise = null;
        const ensureRuntime = () => {
            if (!config.enabled) {
                throw new Error("Discord voice extension disabled");
            }
            if (!runtimePromise) {
                runtimePromise = createVoiceRuntime({
                    config,
                    discordClient: api.runtime?.channel?.discord?.client ?? null,
                    logger: api.logger,
                });
            }
            return runtimePromise;
        };
        api.registerTool({
            name: "voice_channel",
            label: "Voice Channel",
            description: "Join, leave, speak, or check status for Discord voice channels",
            parameters: Type.Union([
                Type.Object({
                    action: Type.Literal("join"),
                    guildId: Type.String({ description: "Discord server ID" }),
                    channelId: Type.String({ description: "Voice channel ID" }),
                }),
                Type.Object({
                    action: Type.Literal("leave"),
                    guildId: Type.String({ description: "Discord server ID" }),
                }),
                Type.Object({
                    action: Type.Literal("speak"),
                    guildId: Type.String({ description: "Discord server ID" }),
                    text: Type.String({ description: "Text to speak" }),
                }),
                Type.Object({
                    action: Type.Literal("status"),
                }),
            ]),
            async execute(_toolCallId, params) {
                const runtime = await ensureRuntime();
                switch (params.action) {
                    case "join":
                        await runtime.join(params.guildId, params.channelId);
                        return { ok: true };
                    case "leave":
                        await runtime.leave(params.guildId);
                        return { ok: true };
                    case "speak":
                        await runtime.speak(params.guildId, params.text);
                        return { ok: true };
                    case "status":
                        return runtime.status();
                    default:
                        throw new Error(`Unknown action: ${params.action}`);
                }
            },
        });
    },
};
export default plugin;
//# sourceMappingURL=index.js.map