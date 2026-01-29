export declare class PiperTTS {
    private readonly piperPath;
    private readonly modelPath;
    constructor(piperPath: string, modelPath: string);
    synthesize(text: string): Promise<Buffer>;
}
//# sourceMappingURL=tts-service.d.ts.map