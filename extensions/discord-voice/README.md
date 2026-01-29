# Discord Voice Extension (Phase 1)

MVP Discord voice support for Clawdbot with Piper TTS playback.

## Features (Phase 1)
- Join/leave voice channels
- Speak text via Piper TTS

## Development

```bash
pnpm install
pnpm run build
```

## Configuration

This extension expects Piper and ffmpeg to be available. Configure paths via plugin config:

- `piperPath` (default: `/home/nuc/clawd/tools/piper/piper`)
- `piperModelPath` (default: `/home/nuc/clawd/tools/piper/voices/en_US-lessac-medium.onnx`)
- `ffmpegPath` (default: `ffmpeg`)

## Tools

- `voice_channel` with actions: `join`, `leave`, `speak`, `status`
