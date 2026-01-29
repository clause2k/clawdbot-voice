# Clawdbot Integration

## Clawdbot Architecture Overview

Based on exploration of `/usr/lib/node_modules/clawdbot/`:

```
clawdbot/
├── dist/              # Compiled JS (source not distributed)
├── extensions/        # Channel plugins (discord, telegram, etc.)
├── skills/            # Agent skills (SKILL.md + optional scripts)
├── docs/              # Documentation
└── package.json
```

### Extension Structure

Each channel is implemented as an extension/plugin:

```typescript
// extensions/discord/index.ts
const plugin = {
  id: "discord",
  name: "Discord",
  description: "Discord channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: ClawdbotPluginApi) {
    setDiscordRuntime(api.runtime);
    api.registerChannel({ plugin: discordPlugin });
  },
};
```

### Plugin API

The `ClawdbotPluginApi` provides:
- `api.registerChannel()` - Register a messaging channel
- `api.registerTool()` - Register agent tools
- `api.registerService()` - Register background services
- `api.registerCli()` - Register CLI commands
- `api.registerGatewayMethod()` - Register RPC methods
- `api.runtime` - Access to Clawdbot runtime (TTS, LLM, etc.)
- `api.config` - Access to configuration
- `api.logger` - Logging

### Existing Discord Extension

Located at `/usr/lib/node_modules/clawdbot/extensions/discord/`

Key files:
- `index.ts` - Plugin entry point
- `src/channel.ts` - Channel implementation (text messaging)
- `src/runtime.ts` - Runtime access

The Discord extension handles:
- Text messages in channels/DMs
- Polls, reactions, threads
- Message actions (send, edit, delete, etc.)

**Does NOT handle:** Voice channels (this is what we're adding)

---

## Integration Strategy

### Option A: Extend Existing Discord Extension

**Pros:**
- Reuses existing Discord client connection
- Shares authentication/configuration
- Single extension to maintain

**Cons:**
- Larger, more complex extension
- Voice failures could affect text messaging
- Tighter coupling

### Option B: Separate discord-voice Extension (Recommended)

**Pros:**
- Independent failure domain
- Cleaner separation of concerns
- Can be enabled/disabled separately
- Easier to develop and test

**Cons:**
- Needs its own Discord client instance (or share via runtime)
- Separate configuration section

**Decision:** Option B - Create `extensions/discord-voice/`

---

## New Extension Structure

```
extensions/discord-voice/
├── index.ts                 # Plugin entry
├── package.json
├── clawdbot.plugin.json     # Plugin manifest
├── README.md
└── src/
    ├── config.ts            # Configuration schema
    ├── voice-manager.ts     # Connection management
    ├── audio-receiver.ts    # Incoming audio handling
    ├── audio-player.ts      # Outgoing audio playback
    ├── stt/
    │   ├── index.ts         # STT service interface
    │   ├── groq.ts          # Groq provider
    │   ├── whisper-cpp.ts   # Local whisper.cpp
    │   └── whisper-remote.ts # Remote GPU endpoint
    ├── tts/
    │   ├── index.ts         # TTS service interface
    │   └── piper.ts         # Piper provider
    ├── vad.ts               # Voice activity detection
    └── session.ts           # Voice session management
```

---

## Plugin Implementation

### Entry Point

```typescript
// index.ts
import { Type } from "@sinclair/typebox";
import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";

import { VoiceConfigSchema, validateConfig } from "./src/config.js";
import { createVoiceRuntime, type VoiceRuntime } from "./src/runtime.js";
import { registerVoiceCli } from "./src/cli.js";

const plugin = {
  id: "discord-voice",
  name: "Discord Voice",
  description: "Discord voice channel support with local STT/TTS",
  configSchema: {
    parse: (value: unknown) => VoiceConfigSchema.parse(value),
    uiHints: {
      "enabled": { label: "Enable Voice", help: "Enable Discord voice features" },
      "stt.provider": { label: "STT Provider", help: "groq, whisper-local, whisper-remote" },
      "tts.provider": { label: "TTS Provider", help: "piper, elevenlabs" },
      // ... more hints
    },
  },
  
  register(api: ClawdbotPluginApi) {
    const cfg = VoiceConfigSchema.parse(api.pluginConfig);
    const validation = validateConfig(cfg);
    
    if (!validation.valid) {
      api.logger.warn(`[discord-voice] Config issues: ${validation.errors.join("; ")}`);
    }
    
    let runtime: VoiceRuntime | null = null;
    
    const ensureRuntime = async () => {
      if (!cfg.enabled) throw new Error("Discord voice disabled");
      if (runtime) return runtime;
      runtime = await createVoiceRuntime({
        config: cfg,
        coreConfig: api.config,
        ttsRuntime: api.runtime.tts,
        discordRuntime: api.runtime.channel?.discord,
        logger: api.logger,
      });
      return runtime;
    };
    
    // Register voice_channel tool
    api.registerTool({
      name: "voice_channel",
      label: "Voice Channel",
      description: "Join, leave, or interact with Discord voice channels",
      parameters: Type.Union([
        Type.Object({
          action: Type.Literal("join"),
          guildId: Type.String({ description: "Discord server ID" }),
          channelId: Type.String({ description: "Voice channel ID" }),
        }),
        Type.Object({
          action: Type.Literal("leave"),
          guildId: Type.String({ description: "Discord server ID" }),
        }),
        Type.Object({
          action: Type.Literal("speak"),
          guildId: Type.String({ description: "Discord server ID" }),
          text: Type.String({ description: "Text to speak" }),
        }),
        Type.Object({
          action: Type.Literal("status"),
          guildId: Type.Optional(Type.String()),
        }),
      ]),
      async execute(_toolCallId, params) {
        const rt = await ensureRuntime();
        // Handle actions...
      },
    });
    
    // Register CLI
    api.registerCli(
      ({ program }) => registerVoiceCli({ program, ensureRuntime, logger: api.logger }),
      { commands: ["voice"] },
    );
    
    // Register gateway methods
    api.registerGatewayMethod("voice.join", async ({ params, respond }) => {
      // ...
    });
    
    api.registerGatewayMethod("voice.leave", async ({ params, respond }) => {
      // ...
    });
    
    // Register service (starts/stops with gateway)
    api.registerService({
      id: "discord-voice",
      start: async () => {
        if (!cfg.enabled) return;
        await ensureRuntime();
      },
      stop: async () => {
        if (runtime) {
          await runtime.stop();
          runtime = null;
        }
      },
    });
  },
};

export default plugin;
```

### Configuration Schema

```typescript
// src/config.ts
import { z } from "zod";

export const VoiceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  
  stt: z.object({
    provider: z.enum(["groq", "whisper-local", "whisper-remote"]).default("groq"),
    groqApiKey: z.string().optional(),
    groqModel: z.string().default("whisper-large-v3"),
    whisperPath: z.string().optional(),
    whisperModel: z.string().default("tiny.en"),
    remoteUrl: z.string().optional(),
  }).default({}),
  
  tts: z.object({
    provider: z.enum(["piper", "elevenlabs"]).default("piper"),
    piperPath: z.string().optional(),
    piperModel: z.string().optional(),
    piperVoicesDir: z.string().optional(),
  }).default({}),
  
  vad: z.object({
    provider: z.enum(["silero", "energy"]).default("silero"),
    silenceMs: z.number().default(800),
    energyThreshold: z.number().default(0.01),
  }).default({}),
  
  behavior: z.object({
    announceOnJoin: z.boolean().default(true),
    joinGreeting: z.string().default("Hey, I'm here! What's up?"),
    maxSessionMinutes: z.number().default(60),
    idleTimeoutMinutes: z.number().default(5),
  }).default({}),
});

export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;
```

---

## Message Routing

When a user speaks in voice chat, the transcription needs to be routed to Clawdbot's agent like any other message.

### Voice Message Flow

```
User speaks → Audio → STT → Text
                              ↓
                    VoiceSession creates message
                              ↓
                    Route to Clawdbot runtime
                              ↓
                    Agent generates response
                              ↓
                    TTS synthesizes audio
                              ↓
                    Play in voice channel
```

### Integration with Core Runtime

```typescript
// In voice session handler
async function handleUserSpeech(userId: string, text: string, session: VoiceSession) {
  // Create a message object compatible with Clawdbot's message handling
  const message = {
    channel: "discord",
    type: "voice",
    userId,
    username: session.users.get(userId)?.username,
    text,
    metadata: {
      guildId: session.guildId,
      channelId: session.channelId,
      voiceSessionId: session.id,
    },
  };
  
  // Route to agent
  const response = await clawdbotRuntime.handleIncomingMessage(message);
  
  // Speak response
  if (response?.text) {
    const audio = await ttsService.synthesize(response.text);
    await session.player.play(audio);
  }
}
```

---

## Sharing Discord Client

The existing Discord extension already maintains a connected client. The voice extension should reuse it rather than creating a separate connection.

### Approach: Access via Runtime

```typescript
// The Discord extension exposes its client via runtime
const discordClient = api.runtime.channel?.discord?.client;

if (discordClient) {
  // Use existing client for voice
  const guild = await discordClient.guilds.fetch(guildId);
  const channel = guild.channels.cache.get(channelId);
  // ...
}
```

If the Discord extension isn't loaded, the voice extension should fail gracefully with a clear error.

---

## Config File Changes

Add to gateway config:

```yaml
plugins:
  entries:
    discord-voice:
      enabled: true
      config:
        enabled: true
        stt:
          provider: groq
          groqApiKey: ${GROQ_API_KEY}
        tts:
          provider: piper
          piperPath: ~/clawd/tools/piper/piper
          piperModel: ~/clawd/tools/piper/voices/en_US-lessac-medium.onnx
        vad:
          provider: silero
          silenceMs: 800
        behavior:
          announceOnJoin: true
          maxSessionMinutes: 60
```

---

## CLI Commands

```bash
# Join a voice channel
clawdbot voice join --guild <id> --channel <id>

# Leave voice channel
clawdbot voice leave --guild <id>

# Speak text (for testing)
clawdbot voice speak --guild <id> "Hello world"

# Show status
clawdbot voice status

# List active sessions
clawdbot voice sessions
```

---

## Tool Usage by Agent

The agent can use the voice_channel tool:

```
User (text): Join the voice channel and say hello
Agent: [uses voice_channel tool with action=join, then action=speak]

User (voice in VC): What's the weather like?
Agent: [responds via voice, no tool needed - automatic]
```

---

## Error Handling

1. **Discord extension not loaded:** Clear error, suggest enabling it
2. **No permission to join channel:** Report to user
3. **STT fails:** Fall back to next provider, log error
4. **TTS fails:** Fall back to text response in channel
5. **Connection drops:** Attempt reconnect, notify user if persistent

---

## Future Considerations

1. **Streaming STT:** Process audio in real-time for lower latency
2. **Streaming TTS:** Start playing before full synthesis completes
3. **Multi-bot support:** Multiple account IDs with separate voice
4. **Recording:** Optional session recording for review
5. **Wake word:** Activate only on specific phrase
