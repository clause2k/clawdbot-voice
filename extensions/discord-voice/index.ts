import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { VoiceConfigSchema, validateConfig, type VoiceConfig } from "./src/config.js";
import { createVoiceRuntime } from "./src/runtime.js";

type ClawdbotPluginApi = {
  pluginConfig: unknown;
  config: unknown;
  runtime: any;
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  registerTool: (tool: {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    execute: (toolCallId: string, params: any) => Promise<unknown>;
  }) => void;
};

const plugin = {
  id: "discord-voice",
  name: "Discord Voice",
  description: "Discord voice channel support with Piper TTS (Phase 1)",
  configSchema: {
    parse: (value: unknown) => Value.Default(VoiceConfigSchema, value ?? {}),
    uiHints: {
      enabled: { label: "Enable Voice", help: "Enable Discord voice features" },
      piperPath: { label: "Piper Path", help: "Path to Piper binary" },
      piperModelPath: { label: "Piper Model", help: "Path to Piper model" },
      ffmpegPath: { label: "FFmpeg Path", help: "Path to ffmpeg binary" },
      sttEnabled: { label: "Enable STT", help: "Enable speech-to-text capture" },
      groqApiKey: { label: "Groq API Key", help: "Groq Whisper API key" },
      groqApiEndpoint: { label: "Groq API Endpoint", help: "Groq Whisper endpoint" },
      whisperCppPath: { label: "whisper.cpp Path", help: "Path to whisper.cpp binary" },
      whisperCppModelPath: { label: "whisper.cpp Model", help: "Path to whisper.cpp model" },
      vadEnergyThreshold: { label: "VAD Threshold", help: "Energy threshold for VAD" },
      responseModel: { label: "Response Model", help: "Provider/model override" },
      responseSystemPrompt: { label: "Response Prompt", help: "System prompt override" },
      responseTimeoutMs: { label: "Response Timeout", help: "Timeout override (ms)" },
    },
  },
  register(api: ClawdbotPluginApi) {
    const baseConfig = Value.Default(VoiceConfigSchema, api.pluginConfig ?? {}) as VoiceConfig;
    const groqApiKey =
      baseConfig.groqApiKey ||
      (api.config as any)?.gateway?.models?.providers?.groq?.apiKey ||
      "";
    const config: VoiceConfig = { ...baseConfig, groqApiKey };
    const validation = validateConfig(config);
    if (!validation.valid) {
      api.logger.warn(`[discord-voice] Config issues: ${validation.errors.join("; ")}`);
    }

    let runtimePromise: Promise<Awaited<ReturnType<typeof createVoiceRuntime>>> | null = null;

    const ensureRuntime = () => {
      if (!config.enabled) {
        throw new Error("Discord voice extension disabled");
      }

      if (!runtimePromise) {
        runtimePromise = createVoiceRuntime({
          config,
          discordClient: api.runtime?.channel?.discord?.client ?? null,
          coreConfig: api.config as any,
          ttsRuntime: api.runtime?.tts ?? null,
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
