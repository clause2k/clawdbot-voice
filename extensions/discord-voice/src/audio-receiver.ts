import { EndBehaviorType, type VoiceConnection } from "@discordjs/voice";
import prism from "prism-media";
import type { EnergyVAD } from "./vad.js";

type LoggerLike = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

type DiscordClientLike = {
  users: {
    fetch: (id: string) => Promise<{ id: string; username?: string; tag?: string }>;
  };
};

export type UtteranceHandler = (payload: {
  userId: string;
  username: string;
  pcm: Buffer;
}) => Promise<void> | void;

export class AudioReceiver {
  private readonly connection: VoiceConnection;
  private readonly vad: EnergyVAD;
  private readonly onUtterance: UtteranceHandler;
  private readonly discordClient: DiscordClientLike;
  private readonly logger?: LoggerLike;
  private readonly onStartBound: (userId: string) => void;

  constructor(options: {
    connection: VoiceConnection;
    vad: EnergyVAD;
    onUtterance: UtteranceHandler;
    discordClient: DiscordClientLike;
    logger?: LoggerLike;
  }) {
    this.connection = options.connection;
    this.vad = options.vad;
    this.onUtterance = options.onUtterance;
    this.discordClient = options.discordClient;
    this.logger = options.logger;
    this.onStartBound = (userId) => void this.handleSpeakingStart(userId);
  }

  start(): void {
    this.connection.receiver.speaking.on("start", this.onStartBound);
  }

  stop(): void {
    this.connection.receiver.speaking.off("start", this.onStartBound);
  }

  private async handleSpeakingStart(userId: string): Promise<void> {
    const stream = this.connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 800 },
    });

    const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
    const pcmChunks: Buffer[] = [];
    let speechDetected = false;

    stream.on("data", (chunk: Buffer) => {
      decoder.write(chunk);
    });

    decoder.on("data", (pcmChunk: Buffer) => {
      if (this.vad.hasSpeech(pcmChunk)) speechDetected = true;
      pcmChunks.push(pcmChunk);
    });

    stream.on("end", async () => {
      decoder.end();
      if (!speechDetected) return;

      const pcm = Buffer.concat(pcmChunks);
      const username = await this.resolveUsername(userId);
      await this.onUtterance({ userId, username, pcm });
    });

    stream.on("error", (err) => {
      this.logger?.warn?.(`[discord-voice] Audio receive error: ${String(err)}`);
      decoder.destroy();
    });
  }

  private async resolveUsername(userId: string): Promise<string> {
    try {
      const user = await this.discordClient.users.fetch(userId);
      return user.username ?? user.tag ?? userId;
    } catch {
      return userId;
    }
  }
}
