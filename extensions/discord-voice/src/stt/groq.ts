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

  async transcribe(wav: Buffer): Promise<string> {
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
