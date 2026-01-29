import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function pcmToWav(pcm: Buffer, options: { sampleRate: number; channels: number }): Buffer {
  const byteRate = options.sampleRate * options.channels * 2;
  const blockAlign = options.channels * 2;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(options.channels, 22);
  header.writeUInt32LE(options.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export class WhisperCppSTT {
  constructor(
    private readonly binaryPath: string,
    private readonly modelPath: string,
  ) {}

  isAvailable(): boolean {
    return Boolean(this.binaryPath) && Boolean(this.modelPath);
  }

  async transcribe(pcm: Buffer): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "whisper-"));
    const wavPath = join(dir, "audio.wav");
    const outPrefix = join(dir, "out");
    const outPath = `${outPrefix}.txt`;

    try {
      const wav = pcmToWav(pcm, { sampleRate: 48000, channels: 2 });
      await writeFile(wavPath, wav);

      await new Promise<void>((resolve, reject) => {
        const whisper = spawn(this.binaryPath, [
          "-m",
          this.modelPath,
          "-f",
          wavPath,
          "-otxt",
          "-of",
          outPrefix,
        ]);

        let stderr = "";
        whisper.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        whisper.on("error", reject);
        whisper.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr || `whisper.cpp exited with code ${code}`));
        });
      });

      const text = await readFile(outPath, "utf8");
      return text.trim();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
