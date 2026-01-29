import { VoiceConnection } from "@discordjs/voice";
export declare class VoiceManager {
    private connections;
    join(options: {
        guildId: string;
        channelId: string;
        adapterCreator: unknown;
        selfDeaf: boolean;
        selfMute: boolean;
    }): Promise<VoiceConnection>;
    get(guildId: string): VoiceConnection | undefined;
    listGuilds(): string[];
    leave(guildId: string): Promise<void>;
}
//# sourceMappingURL=voice-manager.d.ts.map