import type { VoiceConnection } from "@discordjs/voice";
import { VoiceManager } from "./voice-manager.js";
import { PiperTTS } from "./tts-service.js";
import { VoicePlayer } from "./audio-player.js";
import type { VoiceConfig } from "./config.js";
import { AudioReceiver } from "./audio-receiver.js";
import { EnergyVAD } from "./vad.js";
import { STTService } from "./stt/index.js";
import { GroqSTT } from "./stt/groq.js";
import { WhisperCppSTT } from "./stt/whisper-cpp.js";
import { resampleToWav16kMono } from "./stt/resample.js";

export type LoggerLike = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

export type VoiceRuntime = {
  join: (guildId: string, channelId: string) => Promise<void>;
  leave: (guildId: string) => Promise<void>;
  speak: (guildId: string, text: string) => Promise<void>;
  status: () => { connectedGuilds: string[] };
};

type VoiceMessage = {
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  text: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

type VoiceMessageRouter = (message: VoiceMessage) => Promise<string | null>;

type DiscordClientLike = {
  channels: {
    fetch: (id: string) => Promise<any>;
  };
  users: {
    fetch: (id: string) => Promise<any>;
  };
};

function resolveAdapterCreator(channel: any): unknown {
  if (!channel || !channel.guild || !channel.guild.voiceAdapterCreator) {
    throw new Error("Unable to resolve voice adapter for channel");
  }
  return channel.guild.voiceAdapterCreator;
}

function assertVoiceChannel(channel: any): void {
  if (!channel) throw new Error("Channel not found");

  if (typeof channel.isVoiceBased === "function" && !channel.isVoiceBased()) {
    throw new Error("Channel is not a voice-based channel");
  }
}

export async function createVoiceRuntime(options: {
  config: VoiceConfig;
  discordClient: DiscordClientLike | null | undefined;
  messageRouter?: VoiceMessageRouter;
  logger?: LoggerLike;
}): Promise<VoiceRuntime> {
  const { config, discordClient, logger, messageRouter } = options;

  if (!discordClient) {
    throw new Error("Discord client not available. Ensure the discord extension is enabled.");
  }

  const voiceManager = new VoiceManager();
  const tts = new PiperTTS(config.piperPath, config.piperModelPath);
  const player = new VoicePlayer(config.ffmpegPath);
  const receivers = new Map<string, AudioReceiver>();
  const sessions = new Map<
    string,
    {
      guildId: string;
      channelId: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
      queue: Promise<void>;
    }
  >();

  const stt = new STTService([
    new GroqSTT({ apiKey: config.groqApiKey, endpoint: config.groqApiEndpoint }),
    new WhisperCppSTT(config.whisperCppPath, config.whisperCppModelPath),
  ]);

  const logInfo = logger?.info ?? (() => undefined);
  const logWarn = logger?.warn ?? (() => undefined);

  return {
    async join(guildId: string, channelId: string) {
      const channel = await discordClient.channels.fetch(channelId);
      assertVoiceChannel(channel);

      const adapterCreator = resolveAdapterCreator(channel);
      await voiceManager.join({
        guildId,
        channelId,
        adapterCreator,
        selfDeaf: config.autoDeaf,
        selfMute: config.autoMute,
      });

      logInfo(`[discord-voice] Joined voice channel ${channelId} in guild ${guildId}`);

      if (!sessions.has(guildId)) {
        sessions.set(guildId, {
          guildId,
          channelId,
          history: [] as Array<{ role: "user" | "assistant"; content: string }>,
          queue: Promise.resolve(),
        });
      }

      if (config.sttEnabled) {
        const connection = voiceManager.get(guildId);
        if (connection) {
          const receiver = new AudioReceiver({
            connection,
            vad: new EnergyVAD({ energyThreshold: config.vadEnergyThreshold }),
            discordClient,
            logger,
            onUtterance: async ({ userId, username, pcm }) => {
              const session = sessions.get(guildId);
              if (!session) return;

              session.queue = session.queue.then(async () => {
                try {
                  const wav = await resampleToWav16kMono(pcm, config.ffmpegPath);
                  const text = await stt.transcribe(wav);
                  if (!text.trim()) return;

                  logInfo(`[discord-voice] ${username} (${userId}): ${text}`);

                  const history: Array<{ role: "user" | "assistant"; content: string }> =
                    session.history.slice(-20);
                  history.push({ role: "user", content: text });
                  session.history = history;

                  if (!messageRouter) {
                    logger?.warn?.("[discord-voice] No message router configured; skipping response");
                    return;
                  }

                  const response = await messageRouter({
                    guildId,
                    channelId,
                    userId,
                    username,
                    text,
                    history: session.history,
                  });

                  if (!response || !response.trim()) return;
                  const updatedHistory: Array<{ role: "user" | "assistant"; content: string }> = [
                    ...session.history,
                    { role: "assistant", content: response },
                  ];
                  session.history = updatedHistory.slice(-20);
                  await player.play(await tts.synthesize(response), connection);
                } catch (err) {
                  logger?.warn?.(`[discord-voice] STT/response failed: ${String(err)}`);
                }
              });
            },
          });
          receiver.start();
          receivers.set(guildId, receiver);
        }
      }
    },

    async leave(guildId: string) {
      const receiver = receivers.get(guildId);
      if (receiver) {
        receiver.stop();
        receivers.delete(guildId);
      }
      sessions.delete(guildId);
      await voiceManager.leave(guildId);
      logInfo(`[discord-voice] Left voice channel in guild ${guildId}`);
    },

    async speak(guildId: string, text: string) {
      const connection: VoiceConnection | undefined = voiceManager.get(guildId);
      if (!connection) {
        throw new Error(`Not connected to a voice channel for guild ${guildId}`);
      }

      if (!text.trim()) {
        logWarn("[discord-voice] Speak called with empty text");
        return;
      }

      const pcm = await tts.synthesize(text);
      await player.play(pcm, connection);
    },

    status() {
      return { connectedGuilds: voiceManager.listGuilds() };
    },
  };
}
