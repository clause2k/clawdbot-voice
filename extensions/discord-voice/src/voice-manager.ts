import {
  entersState,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";

export class VoiceManager {
  private connections = new Map<string, VoiceConnection>();

  async join(options: {
    guildId: string;
    channelId: string;
    adapterCreator: unknown;
    selfDeaf: boolean;
    selfMute: boolean;
  }): Promise<VoiceConnection> {
    const connection = joinVoiceChannel({
      guildId: options.guildId,
      channelId: options.channelId,
      adapterCreator: options.adapterCreator as any,
      selfDeaf: options.selfDeaf,
      selfMute: options.selfMute,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    this.connections.set(options.guildId, connection);
    return connection;
  }

  get(guildId: string): VoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  listGuilds(): string[] {
    return Array.from(this.connections.keys());
  }

  async leave(guildId: string): Promise<void> {
    const connection = this.connections.get(guildId);
    if (!connection) return;

    connection.destroy();
    this.connections.delete(guildId);
  }
}
