import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class WhisperCppSTT {
  constructor(
    private readonly binaryPath: string,
    private readonly modelPath: string,
  ) {}

  isAvailable(): boolean {
    return Boolean(this.binaryPath) && Boolean(this.modelPath);
  }

  async transcribe(wav: Buffer): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "whisper-"));
    const wavPath = join(dir, "audio.wav");
    const outPrefix = join(dir, "out");
    const outPath = `${outPrefix}.txt`;

    try {
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
