import { type Static } from "@sinclair/typebox";
export declare const VoiceConfigSchema: import("@sinclair/typebox").TObject<{
    enabled: import("@sinclair/typebox").TBoolean;
    piperPath: import("@sinclair/typebox").TString;
    piperModelPath: import("@sinclair/typebox").TString;
    ffmpegPath: import("@sinclair/typebox").TString;
    autoDeaf: import("@sinclair/typebox").TBoolean;
    autoMute: import("@sinclair/typebox").TBoolean;
}>;
export type VoiceConfig = Static<typeof VoiceConfigSchema>;
export declare function validateConfig(config: VoiceConfig): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=config.d.ts.map