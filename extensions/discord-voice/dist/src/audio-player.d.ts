import { VoiceConnection } from "@discordjs/voice";
export declare class VoicePlayer {
    private readonly ffmpegPath;
    private player;
    constructor(ffmpegPath: string);
    play(pcmBuffer: Buffer, connection: VoiceConnection): Promise<void>;
    private resampleToDiscord;
}
//# sourceMappingURL=audio-player.d.ts.map