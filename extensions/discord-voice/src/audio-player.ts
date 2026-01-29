import {
  AudioPlayer,
  AudioPlayerStatus,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
  StreamType,
} from "@discordjs/voice";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";

export class VoicePlayer {
  private player: AudioPlayer;

  constructor(private readonly ffmpegPath: string) {
    this.player = createAudioPlayer();
  }

  async play(pcmBuffer: Buffer, connection: VoiceConnection): Promise<void> {
    const resampled = await this.resampleToDiscord(pcmBuffer);
    const resource = createAudioResource(Readable.from(resampled), {
      inputType: StreamType.Raw,
    });

    connection.subscribe(this.player);
    this.player.play(resource);

    return new Promise((resolve, reject) => {
      const onIdle = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        this.player.removeListener(AudioPlayerStatus.Idle, onIdle);
        this.player.removeListener("error", onError);
      };

      this.player.once(AudioPlayerStatus.Idle, onIdle);
      this.player.once("error", onError);
    });
  }

  private resampleToDiscord(pcmBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.ffmpegPath, [
        "-f",
        "s16le",
        "-ar",
        "22050",
        "-ac",
        "1",
        "-i",
        "pipe:0",
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ]);

      const chunks: Buffer[] = [];
      const errors: Buffer[] = [];

      ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk as Buffer));
      ffmpeg.stderr.on("data", (chunk) => errors.push(chunk as Buffer));
      ffmpeg.on("error", (err) => reject(err));
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
          return;
        }
        const message = Buffer.concat(errors).toString().trim();
        reject(new Error(message || `ffmpeg exited with code ${code}`));
      });

      ffmpeg.stdin.write(pcmBuffer);
      ffmpeg.stdin.end();
    });
  }
}
