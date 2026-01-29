# Discord Voice Chat Architecture

## Overview

This document describes the architecture for adding Discord voice channel support to Clawdbot, enabling real-time voice conversations with the AI.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Discord Server                                  │
│  ┌─────────────────┐                           ┌─────────────────────────┐  │
│  │  Voice Channel  │◄──────── Opus ──────────► │     Discord Gateway     │  │
│  │   (User Audio)  │                           │   (WebSocket + RTP)     │  │
│  └─────────────────┘                           └───────────┬─────────────┘  │
└────────────────────────────────────────────────────────────┼────────────────┘
                                                             │
                                                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NUC (Clawdbot Host)                               │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Discord Voice Extension                          │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────────┐  │   │
│  │  │   Voice     │    │   Audio     │    │    Session Manager       │  │   │
│  │  │  Gateway    │───►│   Buffer    │───►│  (per-user state, VAD)   │  │   │
│  │  │(@discordjs/ │    │  (PCM/Opus) │    │                          │  │   │
│  │  │   voice)    │    └─────────────┘    └────────────┬─────────────┘  │   │
│  │  └─────────────┘                                    │                │   │
│  └─────────────────────────────────────────────────────┼────────────────┘   │
│                                                        │                    │
│           ┌────────────────────────────────────────────┼────────────────┐   │
│           │                                            ▼                │   │
│           │  ┌─────────────────┐         ┌─────────────────────────┐   │   │
│           │  │   STT Service   │◄────────│    Audio Processor      │   │   │
│           │  │                 │         │  (chunking, resampling) │   │   │
│           │  │ ┌─────────────┐ │         └─────────────────────────┘   │   │
│           │  │ │whisper.cpp  │ │                                       │   │
│           │  │ │(tiny/base)  │ │                                       │   │
│           │  │ └─────────────┘ │                                       │   │
│           │  │       OR        │                                       │   │
│           │  │ ┌─────────────┐ │                                       │   │
│           │  │ │ Groq API    │ │                                       │   │
│           │  │ │ (fallback)  │ │                                       │   │
│           │  │ └─────────────┘ │                                       │   │
│           │  └────────┬────────┘                                       │   │
│           │           │ text                                           │   │
│           │           ▼                                                │   │
│           │  ┌─────────────────┐                                       │   │
│           │  │  Clawdbot Core  │◄───────── existing message routing    │   │
│           │  │  (Agent/LLM)    │                                       │   │
│           │  └────────┬────────┘                                       │   │
│           │           │ response text                                  │   │
│           │           ▼                                                │   │
│           │  ┌─────────────────┐         ┌─────────────────────────┐   │   │
│           │  │   TTS Service   │────────►│    Audio Encoder        │   │   │
│           │  │                 │         │  (PCM → Opus for Discord)│   │   │
│           │  │ ┌─────────────┐ │         └────────────┬────────────┘   │   │
│           │  │ │   Piper     │ │                      │                │   │
│           │  │ │ (local TTS) │ │                      │                │   │
│           │  │ └─────────────┘ │                      │                │   │
│           │  └─────────────────┘                      │                │   │
│           │                                           │                │   │
│           └───────────────────────────────────────────┼────────────────┘   │
│                                                       │                    │
│  ┌────────────────────────────────────────────────────┼────────────────┐   │
│  │                      Discord Voice Extension       │                │   │
│  │                                           ┌────────▼────────┐       │   │
│  │                                           │  Audio Playback │       │   │
│  │                                           │  (stream to VC) │       │   │
│  │                                           └─────────────────┘       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

Optional: Remote GPU for STT
┌─────────────────────────────────────────┐
│           endeavour (RTX 3070)          │
│  ┌───────────────────────────────────┐  │
│  │      faster-whisper API           │  │
│  │   (HTTP endpoint for STT)         │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Component Breakdown

### 1. Voice Gateway (Discord Connection)

**Library:** `@discordjs/voice`

**Responsibilities:**
- Join/leave voice channels on command
- Establish WebSocket + RTP connection to Discord
- Receive Opus audio streams from users
- Play Opus audio back to the channel

**Key Classes:**
- `VoiceConnection` - manages connection to a voice channel
- `AudioReceiveStream` - incoming audio from a user
- `AudioPlayer` - plays audio resources to the channel
- `AudioResource` - wraps audio for playback

### 2. Audio Buffer & Processor

**Responsibilities:**
- Buffer incoming audio chunks from multiple users
- Resample if needed (Discord: 48kHz stereo Opus → Whisper: 16kHz mono PCM)
- Apply Voice Activity Detection (VAD) to detect speech boundaries
- Queue completed utterances for transcription

**VAD Strategy:**
- Use `@ricky0123/vad-node` (Silero VAD) for accurate speech detection
- OR simple energy-based detection (less accurate but lighter)
- Configurable silence threshold (e.g., 800ms silence = utterance end)

### 3. Session Manager

**Responsibilities:**
- Track active voice sessions (which users are in which channels)
- Maintain per-user conversation context
- Handle join/leave events
- Queue management for transcription requests

**Data Structure:**
```typescript
interface VoiceSession {
  guildId: string;
  channelId: string;
  connectionId: string;
  users: Map<string, UserVoiceState>;
  startedAt: Date;
  lastActivityAt: Date;
}

interface UserVoiceState {
  userId: string;
  username: string;
  audioBuffer: CircularBuffer;
  isSpeaking: boolean;
  lastSpokeAt: Date;
  pendingTranscription: boolean;
}
```

### 4. STT Service

**Primary:** whisper.cpp (local)
**Fallback:** Groq Whisper API

**Interface:**
```typescript
interface STTService {
  transcribe(audio: Buffer, options?: STTOptions): Promise<string>;
  isAvailable(): boolean;
  estimateLatency(durationMs: number): number;
}
```

**Local whisper.cpp:**
- Model: `tiny.en` or `base.en` (balance speed vs accuracy)
- Quantization: `q5_0` for reduced memory
- Streaming: Process in chunks as they complete

**Groq Fallback:**
- Triggers when local transcription is too slow
- Fast inference, minimal latency
- Free tier available

### 5. TTS Service

**Primary:** Piper (local)

**Interface:**
```typescript
interface TTSService {
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
  getVoices(): Voice[];
}
```

**Piper Configuration:**
- Model: `en_US-lessac-medium` (good quality, reasonable speed)
- Output: PCM 22050Hz → resample to 48kHz for Discord
- Streaming: Generate and stream in chunks for lower latency

### 6. Audio Playback

**Responsibilities:**
- Convert TTS output to Opus for Discord
- Manage playback queue (don't interrupt mid-sentence)
- Handle "barge-in" (user interrupts AI response)

## Data Flow

### User Speaks → AI Response

```
1. User speaks in Discord voice channel
   └─► Discord sends Opus packets via RTP

2. @discordjs/voice receives audio
   └─► AudioReceiveStream emits chunks

3. Audio Processor receives chunks
   ├─► Decodes Opus → PCM
   ├─► Resamples 48kHz → 16kHz
   └─► Feeds to VAD

4. VAD detects speech end
   └─► Emits complete utterance

5. STT Service transcribes
   ├─► Try local whisper.cpp
   └─► Fallback to Groq if slow/unavailable

6. Session Manager routes to Clawdbot
   └─► Creates message with voice session context

7. Clawdbot Agent generates response
   └─► Returns text response

8. TTS Service synthesizes
   └─► Piper generates audio

9. Audio Encoder prepares for Discord
   ├─► Resample to 48kHz
   └─► Encode to Opus

10. Audio Playback streams to channel
    └─► AudioPlayer plays AudioResource
```

## Latency Analysis

| Stage | Local (NUC) | With Groq STT | With GPU STT |
|-------|-------------|---------------|--------------|
| Audio capture | ~20ms | ~20ms | ~20ms |
| VAD processing | ~10ms | ~10ms | ~10ms |
| STT (3s utterance) | ~4-6s | ~500ms | ~300ms |
| LLM response | ~2-4s | ~2-4s | ~2-4s |
| TTS synthesis | ~500ms | ~500ms | ~500ms |
| Audio encoding | ~50ms | ~50ms | ~50ms |
| **Total** | **~7-11s** | **~3-5s** | **~3-5s** |

**Note:** Local STT on i3-7100U is the bottleneck. For conversational voice chat, Groq or GPU offload is strongly recommended.

## Error Handling

1. **Discord connection drops:** Reconnect with exponential backoff
2. **STT fails:** Fall back to Groq, then notify user
3. **TTS fails:** Fall back to text response in channel
4. **User leaves mid-response:** Cancel pending operations
5. **Multiple users speaking:** Queue or prioritize by config

## Security Considerations

1. **Audio data:** Never persist raw audio; transcribe and discard
2. **User consent:** Bot should announce when joining voice
3. **Rate limiting:** Limit transcription requests per user
4. **Channel permissions:** Respect Discord channel permissions
