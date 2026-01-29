import { spawn } from "node:child_process";
export class PiperTTS {
    piperPath;
    modelPath;
    constructor(piperPath, modelPath) {
        this.piperPath = piperPath;
        this.modelPath = modelPath;
    }
    synthesize(text) {
        return new Promise((resolve, reject) => {
            const piper = spawn(this.piperPath, ["--model", this.modelPath, "--output-raw"], {
                stdio: ["pipe", "pipe", "pipe"],
            });
            const chunks = [];
            const errors = [];
            piper.stdout.on("data", (chunk) => chunks.push(chunk));
            piper.stderr.on("data", (chunk) => errors.push(chunk));
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
//# sourceMappingURL=tts-service.js.map