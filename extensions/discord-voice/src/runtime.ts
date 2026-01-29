import type { VoiceConnection } from "@discordjs/voice";
import { VoiceManager } from "./voice-manager.js";
import { PiperTTS } from "./tts-service.js";
import { VoicePlayer } from "./audio-player.js";
import type { VoiceConfig } from "./config.js";

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

type DiscordClientLike = {
  channels: {
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
  logger?: LoggerLike;
}): Promise<VoiceRuntime> {
  const { config, discordClient, logger } = options;

  if (!discordClient) {
    throw new Error("Discord client not available. Ensure the discord extension is enabled.");
  }

  const voiceManager = new VoiceManager();
  const tts = new PiperTTS(config.piperPath, config.piperModelPath);
  const player = new VoicePlayer(config.ffmpegPath);

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
    },

    async leave(guildId: string) {
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
