import { entersState, joinVoiceChannel, VoiceConnectionStatus, } from "@discordjs/voice";
export class VoiceManager {
    connections = new Map();
    async join(options) {
        const connection = joinVoiceChannel({
            guildId: options.guildId,
            channelId: options.channelId,
            adapterCreator: options.adapterCreator,
            selfDeaf: options.selfDeaf,
            selfMute: options.selfMute,
        });
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        this.connections.set(options.guildId, connection);
        return connection;
    }
    get(guildId) {
        return this.connections.get(guildId);
    }
    listGuilds() {
        return Array.from(this.connections.keys());
    }
    async leave(guildId) {
        const connection = this.connections.get(guildId);
        if (!connection)
            return;
        connection.destroy();
        this.connections.delete(guildId);
    }
}
//# sourceMappingURL=voice-manager.js.map