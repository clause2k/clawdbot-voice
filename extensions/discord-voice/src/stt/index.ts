export interface STTProvider {
  isAvailable(): boolean;
  transcribe(pcm: Buffer): Promise<string>;
}

export class STTService {
  constructor(private readonly providers: STTProvider[]) {}

  async transcribe(pcm: Buffer): Promise<string> {
    for (const provider of this.providers) {
      if (!provider.isAvailable()) continue;
      try {
        const text = await provider.transcribe(pcm);
        if (text.trim()) return text;
      } catch {
        continue;
      }
    }

    throw new Error("No STT provider available");
  }
}
