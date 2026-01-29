# Hardware Reality Check

## NUC Specifications

| Component | Spec | Notes |
|-----------|------|-------|
| CPU | Intel i3-7100U @ 2.4GHz | 2 cores, 4 threads (Kaby Lake, 7th gen) |
| RAM | 8GB DDR4 | ~5GB available after system/services |
| GPU | Intel HD Graphics 620 | No CUDA, minimal compute capability |
| Storage | SSD | Adequate for models |
| Network | Gigabit Ethernet + WiFi | Low latency to Discord |

## CPU Performance Context

The i3-7100U is a **low-power mobile CPU** from 2017. For reference:

| CPU | Cores/Threads | Single-Thread Score | Multi-Thread Score |
|-----|---------------|--------------------|--------------------|
| i3-7100U | 2/4 | ~1,200 | ~2,800 |
| i7-12700K | 12/20 | ~4,000 | ~27,000 |
| Apple M1 | 8/8 | ~3,500 | ~15,000 |

The i3-7100U is roughly **3-4x slower single-threaded** and **10x slower multi-threaded** than modern desktop CPUs.

---

## Whisper Performance Analysis

### Published Benchmarks

From faster-whisper README (i7-12700K, 8 threads):

| Model | Precision | Time for 13min audio | Effective Speed |
|-------|-----------|---------------------|-----------------|
| tiny | int8 | ~45s | ~17x real-time |
| small | int8 | 1m42s | ~7.6x real-time |
| medium | int8 | ~4m | ~3.2x real-time |

### Scaled Estimates for i3-7100U

Assuming 3-4x slower than i7-12700K (conservative):

| Model | Estimated Time (13min) | Estimated Time (3s utterance) | Usable? |
|-------|------------------------|-------------------------------|---------|
| tiny.en | ~3m | ~4-6s | ⚠️ Marginal |
| tiny.en-q5_0 | ~2m | ~3-4s | ⚠️ Marginal |
| base.en | ~6m | ~8-12s | ❌ Too slow |
| small.en | ~15m | ~20-30s | ❌ Way too slow |

**Conclusion:** Even the tiny model takes 4-6 seconds to process 3 seconds of speech. This means **~2x slower than real-time** — not suitable for conversational voice chat.

### Real-World Test (Recommended)

Before committing, run this benchmark on the NUC:

```bash
# Install whisper.cpp
cd ~/clawd/tools
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build && cmake --build build -j
./models/download-ggml-model.sh tiny.en

# Create test audio (3 seconds)
ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -ar 16000 -ac 1 test.wav

# Or use a real speech sample
# Download: https://github.com/ggml-org/whisper.cpp/raw/master/samples/jfk.wav

# Benchmark
time ./build/bin/whisper-cli -m models/ggml-tiny.en.bin -f samples/jfk.wav
```

Expected result: 10-15 seconds for the 11-second JFK sample (slower than real-time).

---

## Memory Budget

| Component | Memory Usage | Notes |
|-----------|--------------|-------|
| System + Clawdbot | ~2.5GB | Baseline |
| Discord client | ~200MB | Already running |
| whisper.cpp tiny | ~273MB | If using local STT |
| Piper TTS | ~100MB | Lightweight |
| Audio buffers | ~50MB | Per active session |
| **Total** | ~3.1GB | Leaves ~4.5GB headroom |

**Verdict:** Memory is **not a constraint** for this workload.

---

## STT Options Analysis

### Option 1: Local whisper.cpp (tiny.en)

| Metric | Value | Verdict |
|--------|-------|---------|
| Latency | 4-6s per 3s utterance | ❌ Too slow |
| Accuracy | Good for clear speech | ✅ |
| Offline | Yes | ✅ |
| Memory | ~273MB | ✅ |

**Use case:** Offline fallback only. Not suitable as primary.

### Option 2: Groq Whisper API

| Metric | Value | Verdict |
|--------|-------|---------|
| Latency | ~200-500ms | ✅ Excellent |
| Accuracy | Excellent (large-v3) | ✅ |
| Offline | No | ❌ |
| Cost | Free tier available | ✅ |

**Use case:** Primary STT provider. Fast enough for conversation.

### Option 3: Remote GPU (endeavour)

| Metric | Value | Verdict |
|--------|-------|---------|
| Latency | ~300-500ms | ✅ Excellent |
| Accuracy | Excellent | ✅ |
| Availability | Only when endeavour is on | ⚠️ |
| Memory | N/A (runs on endeavour) | ✅ |

**Use case:** Secondary option when endeavour is available. Keeps data local.

---

## TTS Analysis

### Piper on i3-7100U

Piper is designed for low-power devices (Raspberry Pi). Performance on i3-7100U:

| Metric | Value | Verdict |
|--------|-------|---------|
| Synthesis speed | 50-100ms per sentence | ✅ Excellent |
| Quality | Good (neural TTS) | ✅ |
| Memory | ~100MB | ✅ |

**Verdict:** Piper works great on the NUC. No concerns.

### Benchmark

```bash
# Install and test Piper
cd ~/clawd/tools/piper
echo "Hello, this is a test of the Piper text to speech system." | \
  time ./piper --model voices/en_US-lessac-medium.onnx --output-raw > /dev/null
```

Expected: < 200ms for that sentence.

---

## Recommended Configuration

### Primary Setup (Requires Internet)

```yaml
stt:
  provider: groq
  # Fast, accurate, free tier
  
tts:
  provider: piper
  # Local, fast, free
```

### With endeavour Available

```yaml
stt:
  provider: whisper-remote
  remoteUrl: http://endeavour:8000/transcribe
  # Fallback to groq if endeavour offline
  
tts:
  provider: piper
```

### Fully Offline (Degraded Experience)

```yaml
stt:
  provider: whisper-local
  whisperModel: tiny.en-q5_0
  # Expect 4-6s latency per utterance
  
tts:
  provider: piper
```

---

## Fallback Chain

```
STT Priority:
1. Groq API (if configured) — fast, accurate
2. Remote GPU (if available) — fast, local
3. Local whisper.cpp — slow but works offline

TTS Priority:
1. Piper (local) — fast, free
2. ElevenLabs (if configured) — premium quality
```

---

## Upgrade Paths

If voice chat becomes important, consider:

### Option A: Add GPU to NUC

Not practical — NUC doesn't have PCIe slots.

### Option B: Dedicated Voice Server

Run voice processing on endeavour full-time or a dedicated mini PC with GPU.

### Option C: Always-On GPU Instance

Cloud GPU (e.g., RunPod) for STT. Adds cost but guarantees performance.

### Option D: Better Edge Devices

Newer Intel CPUs (12th gen+) have significantly better performance. An Intel N100 mini PC (~$150) would be ~2x faster.

---

## Summary

| Component | On NUC | Recommendation |
|-----------|--------|----------------|
| TTS (Piper) | ✅ Works great | Use local Piper |
| STT (local) | ❌ Too slow | Don't rely on it |
| STT (Groq) | ✅ Fast | Use as primary |
| STT (GPU) | ✅ Fast | Use when available |
| VAD | ✅ Works | Use Silero VAD |
| Audio processing | ✅ Works | Standard tooling |

**Bottom line:** The NUC can run voice chat, but real-time STT requires offloading to Groq or a GPU. Local Whisper is fallback-only.
