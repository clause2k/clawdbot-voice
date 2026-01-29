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

export class GroqSTT {
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(options: { apiKey: string; endpoint?: string }) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? "https://api.groq.com/openai/v1/audio/transcriptions";
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async transcribe(pcm: Buffer): Promise<string> {
    const wav = pcmToWav(pcm, { sampleRate: 48000, channels: 2 });
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
    form.append("model", "whisper-large-v3");

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Groq STT failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { text?: string };
    return json.text ?? "";
  }
}
