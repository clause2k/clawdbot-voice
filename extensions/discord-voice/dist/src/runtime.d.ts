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
    status: () => {
        connectedGuilds: string[];
    };
};
type DiscordClientLike = {
    channels: {
        fetch: (id: string) => Promise<any>;
    };
};
export declare function createVoiceRuntime(options: {
    config: VoiceConfig;
    discordClient: DiscordClientLike | null | undefined;
    logger?: LoggerLike;
}): Promise<VoiceRuntime>;
export {};
//# sourceMappingURL=runtime.d.ts.map