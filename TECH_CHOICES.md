# Technology Choices

## 1. Discord Voice Integration

### @discordjs/voice

**Status:** ✅ Recommended

The official voice library for discord.js. Mature, well-documented, actively maintained.

**Installation:**
```bash
npm install @discordjs/voice @discordjs/opus sodium-native
```

**Key Features:**
- Join/leave voice channels
- Receive audio streams from users (Opus → PCM)
- Play audio to channels
- Built-in connection state management
- Supports multiple connections per bot

**Receiving Audio:**
```typescript
import { VoiceReceiver, EndBehaviorType } from '@discordjs/voice';

const receiver = connection.receiver;

receiver.speaking.on('start', (userId) => {
  const stream = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 800 }
  });
  
  // stream emits Opus packets
  stream.on('data', (chunk) => { /* process */ });
  stream.on('end', () => { /* utterance complete */ });
});
```

**Dependencies:**
- `@discordjs/opus` - Native Opus codec (best performance)
- `sodium-native` - Encryption for voice
- `ffmpeg` - Audio format conversion

### Alternative: Eris

Not recommended — less mature voice support than discord.js.

---

## 2. Speech-to-Text (STT)

### Option A: whisper.cpp (Local)

**Status:** ⚠️ Usable with caveats on i3-7100U

C++ implementation of OpenAI Whisper, optimized for CPU.

**Installation:**
```bash
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build -DGGML_BLAS=1
cmake --build build -j
./models/download-ggml-model.sh tiny.en
```

**Model Recommendations for i3-7100U:**

| Model | Size | Memory | Speed (3s audio) | Accuracy |
|-------|------|--------|------------------|----------|
| tiny.en | 75 MB | ~273 MB | ~3-4s | Good for clear speech |
| tiny.en-q5_0 | ~40 MB | ~150 MB | ~2-3s | Slightly lower |
| base.en | 142 MB | ~388 MB | ~6-8s | Better accuracy |

**Verdict:** `tiny.en-q5_0` for best speed/quality on NUC. Still slower than real-time.

**Node.js Bindings:**
- `whisper-node` - Basic bindings
- `@nicepkg/whisper-node` - More features
- `whisper.cpp` npm package - Official WASM (slower)

Better approach: Spawn whisper.cpp CLI as subprocess for each transcription.

### Option B: faster-whisper (Local, Python)

**Status:** ✅ Recommended if Python is acceptable

4x faster than original Whisper, optimized with CTranslate2.

**Installation:**
```bash
pip install faster-whisper
```

**CPU Benchmark (i7-12700K, similar workload):**
- `small` model, int8: 1m42s for 13min audio (~7.6x real-time)
- Scaled to i3-7100U: estimate ~3-4x real-time for tiny model

**Advantage:** Better quantization, faster inference than whisper.cpp on CPU.

**Usage (HTTP wrapper):**
```python
from faster_whisper import WhisperModel

model = WhisperModel("tiny.en", device="cpu", compute_type="int8")

def transcribe(audio_path):
    segments, _ = model.transcribe(audio_path)
    return " ".join(s.text for s in segments)
```

### Option C: Groq Whisper API (Cloud)

**Status:** ✅ Recommended as primary or fallback

Groq offers Whisper API with blazing-fast inference (~25x real-time).

**Pricing:** Free tier available (limited requests/day)

**Latency:** ~200-500ms for 3s audio

**API:**
```bash
curl -X POST "https://api.groq.com/openai/v1/audio/transcriptions" \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -F file=@audio.wav \
  -F model=whisper-large-v3
```

**Advantages:**
- Fast enough for real-time conversation
- No local compute needed
- High accuracy (large-v3 model)

**Disadvantages:**
- Requires internet
- Rate limits on free tier
- Not fully local

### Option D: Remote GPU (endeavour)

**Status:** ✅ Good option when endeavour is online

Run faster-whisper on RTX 3070 via simple HTTP API.

**Performance:** ~15-25x real-time (near-instant for short utterances)

**Setup:**
```python
# On endeavour: simple FastAPI server
from fastapi import FastAPI, UploadFile
from faster_whisper import WhisperModel

app = FastAPI()
model = WhisperModel("base.en", device="cuda", compute_type="float16")

@app.post("/transcribe")
async def transcribe(file: UploadFile):
    # Save, transcribe, return text
    ...
```

**Advantages:**
- Very fast
- Local network (low latency)
- Good accuracy with larger models

**Disadvantages:**
- Requires endeavour to be on
- Extra service to manage

### STT Recommendation

**Primary:** Groq Whisper API (fast, reliable, free tier)
**Fallback 1:** endeavour GPU when online
**Fallback 2:** Local whisper.cpp tiny.en-q5_0 (for offline use)

The i3-7100U can't do real-time STT comfortably. Accept latency or offload.

---

## 3. Text-to-Speech (TTS)

### Option A: Piper (Local)

**Status:** ✅ Strongly Recommended

Fast, high-quality local TTS designed for low-power devices.

**Installation:**
```bash
# Download binary
wget https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz
tar -xzf piper_amd64.tar.gz

# Download voice model
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

**Usage:**
```bash
echo "Hello, this is a test." | ./piper --model en_US-lessac-medium.onnx --output_file out.wav
```

**Voice Recommendations:**

| Voice | Quality | Speed | Notes |
|-------|---------|-------|-------|
| en_US-lessac-medium | ★★★★☆ | Fast | Good default, natural |
| en_US-amy-medium | ★★★★☆ | Fast | Female, clear |
| en_GB-alan-medium | ★★★☆☆ | Fast | British male |

**Performance on i3-7100U:**
- ~50-100ms per sentence
- Well within real-time requirements

**Node.js Integration:**
```typescript
import { spawn } from 'child_process';

function synthesize(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const piper = spawn('./piper', [
      '--model', 'en_US-lessac-medium.onnx',
      '--output-raw'
    ]);
    
    const chunks: Buffer[] = [];
    piper.stdout.on('data', (chunk) => chunks.push(chunk));
    piper.on('close', () => resolve(Buffer.concat(chunks)));
    piper.stdin.write(text);
    piper.stdin.end();
  });
}
```

### Option B: Coqui TTS (Local)

**Status:** ⚠️ More resource intensive

Higher quality but slower and more memory-hungry.

Not recommended for i3-7100U due to resource constraints.

### Option C: ElevenLabs (Cloud)

**Status:** ✅ Available but costs credits

Already integrated in Clawdbot. Use as fallback for premium quality.

### TTS Recommendation

**Primary:** Piper with `en_US-lessac-medium`
**Fallback:** ElevenLabs (if user prefers quality over cost)

---

## 4. Voice Activity Detection (VAD)

### Option A: Silero VAD

**Status:** ✅ Recommended

Accurate neural VAD, runs efficiently on CPU.

**Installation:**
```bash
npm install @ricky0123/vad-node
```

**Usage:**
```typescript
import { Vad } from '@ricky0123/vad-node';

const vad = await Vad.create();
vad.process(audioBuffer); // Returns speech probability
```

### Option B: Simple Energy-Based VAD

**Status:** ⚠️ Simpler but less accurate

Calculate RMS energy, threshold for speech detection.

```typescript
function detectSpeech(samples: Float32Array, threshold = 0.01): boolean {
  const rms = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
  return rms > threshold;
}
```

### VAD Recommendation

**Primary:** Silero VAD (accurate, handles noise well)
**Simple fallback:** Energy-based (for debugging/testing)

---

## 5. Audio Processing

### FFmpeg

**Status:** ✅ Required

Essential for audio format conversion.

**Key Operations:**
```bash
# Opus → PCM 16kHz mono (for Whisper)
ffmpeg -i input.opus -ar 16000 -ac 1 -f s16le output.pcm

# PCM → Opus 48kHz stereo (for Discord)
ffmpeg -f s16le -ar 22050 -ac 1 -i input.pcm -ar 48000 -ac 2 -c:a libopus output.opus
```

### prism-media

Already used by @discordjs/voice. Handles Opus encoding/decoding.

---

## Summary Table

| Component | Primary Choice | Fallback | Notes |
|-----------|---------------|----------|-------|
| Discord Voice | @discordjs/voice | - | Only real option |
| STT | Groq API | endeavour GPU → whisper.cpp | CPU too slow for real-time |
| TTS | Piper (local) | ElevenLabs | Saves API credits |
| VAD | Silero VAD | Energy-based | Accurate speech detection |
| Audio | FFmpeg + prism-media | - | Standard tooling |
