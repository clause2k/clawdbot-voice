# Open Questions & Decisions

## Design Decisions Needed

### 1. Activation Model

**Question:** How should the bot decide when to respond in voice?

**Options:**
- **A) Always respond** — Bot responds to every utterance
- **B) Wake word** — Bot only responds after hearing "Hey Clause" or similar
- **C) Push-to-talk equivalent** — User explicitly triggers listening
- **D) Mention-based** — Bot responds when @mentioned in voice (not really possible)

**Recommendation:** Start with **A) Always respond** for simplicity. Add wake word later if needed.

**Trade-offs:**
- Always respond: Simple, but may respond to crosstalk
- Wake word: Requires additional STT processing for detection

---

### 2. Multi-User Handling

**Question:** How should the bot handle multiple people talking?

**Options:**
- **A) First come, first served** — Process first speaker, queue others
- **B) Interleave** — Transcribe all, respond to each
- **C) Aggregate** — Wait for pause, respond to combined context
- **D) Priority list** — Certain users get priority

**Recommendation:** Start with **A) First come, first served**. Simplest to implement.

---

### 3. Barge-In Behavior

**Question:** What happens if user interrupts the bot mid-response?

**Options:**
- **A) Stop immediately** — Cut off response, listen to user
- **B) Finish sentence** — Complete current sentence, then listen
- **C) Ignore** — Finish full response before listening
- **D) Configurable** — Let user choose

**Recommendation:** **A) Stop immediately** feels most natural.

---

### 4. Session Lifetime

**Question:** When should a voice session end?

**Options:**
- Everyone leaves the channel → End session
- Bot is asked to leave → End session
- Timeout after N minutes of inactivity → End session
- Manual only → Session persists until explicit leave

**Recommendation:** Combine:
- Auto-leave after 5 minutes of no speech
- Max session of 60 minutes
- Manual leave command always works

---

### 5. Conversation Context

**Question:** Should voice conversations share context with text conversations?

**Options:**
- **A) Separate** — Voice has its own context
- **B) Shared** — Voice and text share the same session
- **C) Linked** — Separate but can reference each other

**Recommendation:** **B) Shared** — Use the existing Discord session. Voice is just another input modality.

---

### 6. Error Feedback

**Question:** How should the bot communicate errors in voice?

**Options:**
- Speak error messages ("Sorry, I couldn't understand that")
- Play error sounds
- Send text message to channel
- Combination

**Recommendation:** Speak brief errors, send details to text channel.

---

### 7. STT Provider Selection

**Question:** Should provider selection be automatic or manual?

**Options:**
- **A) Manual** — User configures one provider
- **B) Automatic fallback** — Try providers in order
- **C) Adaptive** — Learn which works best

**Recommendation:** **B) Automatic fallback** with configurable priority.

---

## Technical Risks

### Risk 1: Discord Audio Quality

**Risk:** Discord's Opus compression may degrade audio quality, affecting STT accuracy.

**Mitigation:**
- Use 48kHz stereo (Discord default) — good quality
- Test with various microphones
- Groq/Whisper handle compressed audio well

**Likelihood:** Low

### Risk 2: Latency Perception

**Risk:** Even with fast STT, total round-trip may feel slow to users.

**Mitigation:**
- Stream TTS as it generates (start playing before full synthesis)
- Provide audio feedback during processing (typing indicator equivalent)
- Optimize each step

**Likelihood:** Medium

### Risk 3: Cross-Talk False Triggers

**Risk:** Bot responds to background conversations or other people.

**Mitigation:**
- VAD helps filter noise
- Wake word option (future)
- User-specific listening (only respond to certain users)

**Likelihood:** Medium

### Risk 4: Discord API Rate Limits

**Risk:** High volume of voice events might hit rate limits.

**Mitigation:**
- Voice uses different endpoints than text
- Rate limits are generous for voice
- Implement queuing if needed

**Likelihood:** Low

### Risk 5: Whisper Hallucinations

**Risk:** Whisper may hallucinate text when given silence or noise.

**Mitigation:**
- Good VAD filtering before STT
- Minimum utterance length (don't transcribe < 0.5s)
- Filter known hallucination patterns

**Likelihood:** Medium

### Risk 6: Resource Contention

**Risk:** Voice processing competes with other Clawdbot tasks.

**Mitigation:**
- STT offloaded to Groq (no local CPU)
- Piper is lightweight
- Audio buffers are small

**Likelihood:** Low

---

## Out of Scope for V1

1. **Video/Screen sharing** — Audio only
2. **Recording/Transcription logs** — Privacy concerns, implement later
3. **Multiple simultaneous sessions** — Start with one voice channel at a time
4. **Custom voice training** — Use pre-built Piper voices
5. **Real-time translation** — Future feature
6. **Music/sound effects** — Focus on conversation
7. **Stage channels** — Different from voice channels
8. **Direct calls** — Focus on server voice channels

---

## Questions for Oli

1. **Priority:** Is this a "nice to have" or something you'd use daily?

2. **Latency tolerance:** Would 3-5 second response time be acceptable, or does it need to feel instant?

3. **Groq usage:** OK to use Groq free tier as primary STT? Or prefer fully local?

4. **Voice preference:** Any specific Piper voice you'd want? (Can demo a few)

5. **Activation:** Always-on listening, or prefer wake word?

6. **Multi-user:** Will others use this, or just you?

7. **endeavour:** How often is endeavour on? Worth setting up GPU STT there?

---

## Next Steps

1. **Confirm direction** — Review these docs, answer questions above
2. **Set up prerequisites** — Install Piper, test Groq API
3. **Build Phase 1** — TTS-only MVP
4. **Iterate** — Add STT, then full conversation

Ready to proceed when you are!
