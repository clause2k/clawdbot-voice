import { AudioPlayerStatus, createAudioPlayer, createAudioResource, StreamType, } from "@discordjs/voice";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
export class VoicePlayer {
    ffmpegPath;
    player;
    constructor(ffmpegPath) {
        this.ffmpegPath = ffmpegPath;
        this.player = createAudioPlayer();
    }
    async play(pcmBuffer, connection) {
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
            const onError = (err) => {
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
    resampleToDiscord(pcmBuffer) {
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
            const chunks = [];
            const errors = [];
            ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
            ffmpeg.stderr.on("data", (chunk) => errors.push(chunk));
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
//# sourceMappingURL=audio-player.js.map