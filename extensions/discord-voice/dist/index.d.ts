type ClawdbotPluginApi = {
    pluginConfig: unknown;
    config: unknown;
    runtime: any;
    logger: {
        info: (message: string) => void;
        warn: (message: string) => void;
        error: (message: string) => void;
    };
    registerTool: (tool: {
        name: string;
        label?: string;
        description: string;
        parameters: unknown;
        execute: (toolCallId: string, params: any) => Promise<unknown>;
    }) => void;
};
declare const plugin: {
    id: string;
    name: string;
    description: string;
    configSchema: {
        parse: (value: unknown) => unknown;
        uiHints: {
            enabled: {
                label: string;
                help: string;
            };
            piperPath: {
                label: string;
                help: string;
            };
            piperModelPath: {
                label: string;
                help: string;
            };
            ffmpegPath: {
                label: string;
                help: string;
            };
        };
    };
    register(api: ClawdbotPluginApi): void;
};
export default plugin;
//# sourceMappingURL=index.d.ts.map