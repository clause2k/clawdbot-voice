import { VoiceManager } from "./voice-manager.js";
import { PiperTTS } from "./tts-service.js";
import { VoicePlayer } from "./audio-player.js";
function resolveAdapterCreator(channel) {
    if (!channel || !channel.guild || !channel.guild.voiceAdapterCreator) {
        throw new Error("Unable to resolve voice adapter for channel");
    }
    return channel.guild.voiceAdapterCreator;
}
function assertVoiceChannel(channel) {
    if (!channel)
        throw new Error("Channel not found");
    if (typeof channel.isVoiceBased === "function" && !channel.isVoiceBased()) {
        throw new Error("Channel is not a voice-based channel");
    }
}
export async function createVoiceRuntime(options) {
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
        async join(guildId, channelId) {
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
        async leave(guildId) {
            await voiceManager.leave(guildId);
            logInfo(`[discord-voice] Left voice channel in guild ${guildId}`);
        },
        async speak(guildId, text) {
            const connection = voiceManager.get(guildId);
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
//# sourceMappingURL=runtime.js.map