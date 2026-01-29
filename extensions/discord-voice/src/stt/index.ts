export interface STTProvider {
  isAvailable(): boolean;
  transcribe(wav: Buffer): Promise<string>;
}

export class STTService {
  constructor(private readonly providers: STTProvider[]) {}

  async transcribe(wav: Buffer): Promise<string> {
    for (const provider of this.providers) {
      if (!provider.isAvailable()) continue;
      try {
        const text = await provider.transcribe(wav);
        if (text.trim()) return text;
      } catch {
        continue;
      }
    }

    throw new Error("No STT provider available");
  }
}
