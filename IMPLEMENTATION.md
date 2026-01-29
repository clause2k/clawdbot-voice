# Implementation Plan

## Overview

This plan breaks the Discord voice chat feature into three phases, from MVP to full conversational voice.

## Prerequisites

Before starting:

1. **Install system dependencies:**
   ```bash
   sudo apt install ffmpeg libopus-dev libsodium-dev
   ```

2. **Download Piper:**
   ```bash
   mkdir -p ~/clawd/tools/piper
   cd ~/clawd/tools/piper
   wget https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz
   tar -xzf piper_linux_x86_64.tar.gz
   
   # Download voice model
   mkdir -p voices
   cd voices
   wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
   wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
   ```

3. **Install whisper.cpp (optional, for local STT):**
   ```bash
   cd ~/clawd/tools
   git clone https://github.com/ggml-org/whisper.cpp
   cd whisper.cpp
   cmake -B build
   cmake --build build -j
   ./models/download-ggml-model.sh tiny.en
   ```

4. **Verify Groq API key in Clawdbot config**

---

## Phase 1: TTS Playback Only (MVP)

**Goal:** Bot can join voice channel and speak responses via TTS.

**Estimated effort:** 1-2 days

### Tasks

#### 1.1 Create discord-voice extension skeleton

```
extensions/discord-voice/
├── index.ts           # Plugin entry
├── package.json
├── src/
│   ├── voice-manager.ts    # Connection management
│   ├── tts-service.ts      # Piper wrapper
│   └── audio-player.ts     # Playback handling
└── README.md
```

#### 1.2 Implement voice connection management

```typescript
// src/voice-manager.ts
import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';

export class VoiceManager {
  private connections: Map<string, VoiceConnection> = new Map();
  
  async join(guildId: string, channelId: string, adapterCreator: any): Promise<VoiceConnection> {
    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator,
      selfDeaf: false,  // Need to hear users later
      selfMute: false,
    });
    
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    this.connections.set(guildId, connection);
    return connection;
  }
  
  async leave(guildId: string): Promise<void> {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.destroy();
      this.connections.delete(guildId);
    }
  }
}
```

#### 1.3 Implement Piper TTS wrapper

```typescript
// src/tts-service.ts
import { spawn } from 'child_process';
import { Readable } from 'stream';

export class PiperTTS {
  private piperPath: string;
  private modelPath: string;
  
  constructor(piperPath: string, modelPath: string) {
    this.piperPath = piperPath;
    this.modelPath = modelPath;
  }
  
  synthesize(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const piper = spawn(this.piperPath, [
        '--model', this.modelPath,
        '--output-raw',
      ]);
      
      const chunks: Buffer[] = [];
      piper.stdout.on('data', (chunk) => chunks.push(chunk));
      piper.stderr.on('data', (data) => console.error('Piper:', data.toString()));
      piper.on('close', (code) => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`Piper exited with code ${code}`));
      });
      
      piper.stdin.write(text);
      piper.stdin.end();
    });
  }
}
```

#### 1.4 Implement audio playback

```typescript
// src/audio-player.ts
import {
  AudioPlayer,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  StreamType,
} from '@discordjs/voice';
import { Readable } from 'stream';

export class VoicePlayer {
  private player: AudioPlayer;
  
  constructor() {
    this.player = createAudioPlayer();
  }
  
  async play(pcmBuffer: Buffer, connection: VoiceConnection): Promise<void> {
    // Convert PCM to format Discord expects
    // Piper outputs 22050Hz mono, Discord wants 48000Hz stereo
    const resampled = await this.resample(pcmBuffer);
    
    const resource = createAudioResource(Readable.from(resampled), {
      inputType: StreamType.Raw,
    });
    
    connection.subscribe(this.player);
    this.player.play(resource);
    
    return new Promise((resolve) => {
      this.player.once('idle', resolve);
    });
  }
  
  private async resample(pcmBuffer: Buffer): Promise<Buffer> {
    // Use ffmpeg for resampling
    // ... implementation
  }
}
```

#### 1.5 Register CLI commands and tools

```typescript
// index.ts
api.registerTool({
  name: 'voice_channel',
  description: 'Join or leave Discord voice channels',
  parameters: Type.Object({
    action: Type.Union([Type.Literal('join'), Type.Literal('leave'), Type.Literal('speak')]),
    guildId: Type.Optional(Type.String()),
    channelId: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
  }),
  async execute(_id, params) {
    // Handle join/leave/speak
  },
});
```

#### 1.6 Test with simple command

```
User: /voice join #voice-channel
Bot: *joins channel*
Bot: *speaks greeting via Piper TTS*
```

### Phase 1 Deliverables

- [ ] Bot can join/leave voice channels via command
- [ ] Bot can speak text via local Piper TTS
- [ ] Audio plays clearly in Discord
- [ ] Basic error handling (channel not found, already connected, etc.)

---

## Phase 2: Add STT (Listening)

**Goal:** Bot can hear users and transcribe their speech.

**Estimated effort:** 2-3 days

### Tasks

#### 2.1 Implement audio receiver

```typescript
// src/audio-receiver.ts
import { VoiceReceiver, EndBehaviorType } from '@discordjs/voice';
import { OpusDecoder } from '@discordjs/opus';

export class AudioReceiver {
  private receiver: VoiceReceiver;
  private decoder: OpusDecoder;
  
  constructor(connection: VoiceConnection) {
    this.receiver = connection.receiver;
    this.decoder = new OpusDecoder(48000, 2);
  }
  
  subscribeToUser(userId: string, onUtterance: (pcm: Buffer) => void): void {
    this.receiver.speaking.on('start', (speakingUserId) => {
      if (speakingUserId !== userId) return;
      
      const stream = this.receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 800 },
      });
      
      const chunks: Buffer[] = [];
      
      stream.on('data', (opusChunk) => {
        const pcm = this.decoder.decode(opusChunk);
        chunks.push(pcm);
      });
      
      stream.on('end', () => {
        const fullPcm = Buffer.concat(chunks);
        onUtterance(fullPcm);
      });
    });
  }
}
```

#### 2.2 Implement STT service with fallback

```typescript
// src/stt-service.ts
export interface STTProvider {
  transcribe(audio: Buffer): Promise<string>;
  isAvailable(): boolean;
}

export class GroqSTT implements STTProvider {
  private apiKey: string;
  
  async transcribe(audio: Buffer): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([audio]), 'audio.wav');
    form.append('model', 'whisper-large-v3');
    
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: form,
    });
    
    const result = await response.json();
    return result.text;
  }
  
  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }
}

export class WhisperCppSTT implements STTProvider {
  private whisperPath: string;
  private modelPath: string;
  
  async transcribe(audio: Buffer): Promise<string> {
    // Write to temp file, run whisper-cli, parse output
  }
  
  isAvailable(): boolean {
    return fs.existsSync(this.whisperPath);
  }
}

export class STTService {
  private providers: STTProvider[];
  
  async transcribe(audio: Buffer): Promise<string> {
    for (const provider of this.providers) {
      if (provider.isAvailable()) {
        try {
          return await provider.transcribe(audio);
        } catch (err) {
          console.warn('STT provider failed, trying next:', err);
        }
      }
    }
    throw new Error('No STT provider available');
  }
}
```

#### 2.3 Implement VAD

```typescript
// src/vad.ts
import { Vad } from '@ricky0123/vad-node';

export class VoiceActivityDetector {
  private vad: Vad;
  
  async init(): Promise<void> {
    this.vad = await Vad.create();
  }
  
  detectSpeech(samples: Float32Array): boolean {
    const probability = this.vad.process(samples);
    return probability > 0.5;
  }
}
```

#### 2.4 Wire up listen → transcribe flow

```typescript
// In voice session handler
audioReceiver.subscribeToUser(userId, async (pcm) => {
  const text = await sttService.transcribe(pcm);
  console.log(`[${username}]: ${text}`);
  
  // Route to Clawdbot as a message
  await handleVoiceMessage({
    userId,
    username,
    guildId,
    channelId,
    text,
    isVoice: true,
  });
});
```

### Phase 2 Deliverables

- [ ] Bot receives and decodes user audio
- [ ] VAD detects when user stops speaking
- [ ] Groq STT transcribes utterances (primary)
- [ ] Local whisper.cpp works as fallback
- [ ] Transcriptions logged/visible for debugging

---

## Phase 3: Full Conversational Flow

**Goal:** Seamless voice conversation with the AI.

**Estimated effort:** 2-3 days

### Tasks

#### 3.1 Route voice transcriptions to Clawdbot agent

```typescript
// Integrate with Clawdbot's message handling
async function handleVoiceMessage(msg: VoiceMessage): Promise<void> {
  const response = await clawdbotRuntime.handleMessage({
    channel: 'discord',
    type: 'voice',
    userId: msg.userId,
    text: msg.text,
    metadata: {
      guildId: msg.guildId,
      voiceChannelId: msg.channelId,
    },
  });
  
  // Speak the response
  if (response.text) {
    await voicePlayer.speak(response.text, connection);
  }
}
```

#### 3.2 Implement conversation session context

```typescript
interface VoiceConversation {
  sessionId: string;
  guildId: string;
  channelId: string;
  participants: Map<string, UserContext>;
  history: ConversationTurn[];
  startedAt: Date;
  lastActivityAt: Date;
}

interface ConversationTurn {
  speaker: 'user' | 'assistant';
  userId?: string;
  text: string;
  timestamp: Date;
}
```

#### 3.3 Handle barge-in (user interrupts bot)

```typescript
// If user starts speaking while bot is talking
audioReceiver.onSpeechStart((userId) => {
  if (voicePlayer.isPlaying()) {
    voicePlayer.stop();  // Stop TTS playback
    // Queue the interruption as context
  }
});
```

#### 3.4 Multi-user support

```typescript
// Track who said what
audioReceiver.subscribeToAll((userId, pcm) => {
  const user = participants.get(userId);
  const text = await sttService.transcribe(pcm);
  
  // Add speaker attribution to context
  conversation.addTurn({
    speaker: 'user',
    userId,
    username: user.username,
    text,
  });
});
```

#### 3.5 Config schema additions

```yaml
channels:
  discord:
    voice:
      enabled: true
      stt:
        provider: groq  # groq | whisper-local | whisper-remote
        whisperModel: tiny.en
        groqModel: whisper-large-v3
        remoteUrl: http://endeavour:8000/transcribe
      tts:
        provider: piper  # piper | elevenlabs
        piperModel: en_US-lessac-medium
        piperPath: ~/clawd/tools/piper/piper
      vad:
        provider: silero  # silero | energy
        silenceMs: 800
      autoJoin: false
      announceOnJoin: true
      maxSessionMinutes: 60
```

### Phase 3 Deliverables

- [ ] Full voice → transcribe → respond → speak loop
- [ ] Conversation context maintained across turns
- [ ] Multi-user conversations supported
- [ ] Barge-in detection and handling
- [ ] Config options for all components
- [ ] Graceful handling of edge cases

---

## Testing Plan

### Unit Tests

- TTS synthesis produces valid audio
- STT transcription returns text
- VAD correctly detects speech boundaries
- Audio resampling works correctly

### Integration Tests

- Bot joins/leaves voice channels
- Audio plays in Discord without distortion
- Full conversation loop works end-to-end

### Manual Testing

- Test with different microphones
- Test with background noise
- Test multi-user scenarios
- Test network interruptions

---

## Rollout

1. **Alpha:** Test in #mimo channel with Oli only
2. **Beta:** Enable for specific Discord guilds
3. **Release:** Document and enable via config

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Prerequisites | 1 day | None |
| Phase 1 (TTS) | 1-2 days | Prerequisites |
| Phase 2 (STT) | 2-3 days | Phase 1 |
| Phase 3 (Full) | 2-3 days | Phase 2 |
| Testing & Polish | 1-2 days | Phase 3 |
| **Total** | **~8-12 days** | |
