export type VADOptions = {
  energyThreshold: number;
};

export class EnergyVAD {
  private readonly energyThreshold: number;

  constructor(options?: Partial<VADOptions>) {
    this.energyThreshold = options?.energyThreshold ?? 0.01;
  }

  hasSpeech(pcmChunk: Buffer): boolean {
    if (pcmChunk.length < 2) return false;

    const sampleCount = Math.floor(pcmChunk.length / 2);
    let sumSquares = 0;

    for (let i = 0; i < sampleCount; i += 1) {
      const sample = pcmChunk.readInt16LE(i * 2) / 32768;
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / sampleCount);
    return rms >= this.energyThreshold;
  }
}
