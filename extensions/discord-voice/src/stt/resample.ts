import { spawn } from "node:child_process";

export function resampleToWav16kMono(pcm: Buffer, ffmpegPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      "-f",
      "s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-i",
      "pipe:0",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-f",
      "wav",
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

    ffmpeg.stdin.write(pcm);
    ffmpeg.stdin.end();
  });
}
