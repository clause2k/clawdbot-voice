import { spawn } from "node:child_process";

export class PiperTTS {
  constructor(
    private readonly piperPath: string,
    private readonly modelPath: string,
  ) {}

  synthesize(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const piper = spawn(this.piperPath, ["--model", this.modelPath, "--output-raw"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      const chunks: Buffer[] = [];
      const errors: Buffer[] = [];

      piper.stdout.on("data", (chunk) => chunks.push(chunk as Buffer));
      piper.stderr.on("data", (chunk) => errors.push(chunk as Buffer));

      piper.on("error", (err) => reject(err));
      piper.on("close", (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
          return;
        }
        const message = Buffer.concat(errors).toString().trim();
        reject(new Error(message || `Piper exited with code ${code}`));
      });

      piper.stdin.write(text);
      piper.stdin.end();
    });
  }
}
