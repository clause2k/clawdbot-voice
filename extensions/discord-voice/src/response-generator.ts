import crypto from "node:crypto";

import { loadCoreAgentDeps, type CoreConfig } from "./core-bridge.js";
import type { VoiceConfig } from "./config.js";

export type VoiceResponseParams = {
  voiceConfig: VoiceConfig;
  coreConfig: CoreConfig;
  guildId: string;
  channelId: string;
  userId: string;
  transcript: Array<{ speaker: "user" | "bot"; text: string }>;
  userMessage: string;
};

export type VoiceResponseResult = {
  text: string | null;
  error?: string;
};

type SessionEntry = {
  sessionId: string;
  updatedAt: number;
};

export async function generateVoiceResponse(
  params: VoiceResponseParams,
): Promise<VoiceResponseResult> {
  const {
    voiceConfig,
    coreConfig,
    guildId,
    channelId,
    userId,
    transcript,
    userMessage,
  } = params;

  if (!coreConfig) {
    return { text: null, error: "Core config unavailable for voice response" };
  }

  let deps: Awaited<ReturnType<typeof loadCoreAgentDeps>>;
  try {
    deps = await loadCoreAgentDeps();
  } catch (err) {
    return {
      text: null,
      error:
        err instanceof Error
          ? err.message
          : "Unable to load core agent dependencies",
    };
  }
  const cfg = coreConfig;

  const sessionKey = `voice:discord:${guildId}:${channelId}:${userId}`;
  const agentId = "main";

  const storePath = deps.resolveStorePath(cfg.session?.store, { agentId });
  const agentDir = deps.resolveAgentDir(cfg, agentId);
  const workspaceDir = deps.resolveAgentWorkspaceDir(cfg, agentId);

  await deps.ensureAgentWorkspace({ dir: workspaceDir });

  const sessionStore = deps.loadSessionStore(storePath);
  const now = Date.now();
  let sessionEntry = sessionStore[sessionKey] as SessionEntry | undefined;

  if (!sessionEntry) {
    sessionEntry = {
      sessionId: crypto.randomUUID(),
      updatedAt: now,
    };
    sessionStore[sessionKey] = sessionEntry;
    await deps.saveSessionStore(storePath, sessionStore);
  }

  const sessionId = sessionEntry.sessionId;
  const sessionFile = deps.resolveSessionFilePath(sessionId, sessionEntry, {
    agentId,
  });

  const modelRef =
    voiceConfig.responseModel?.trim() ||
    `${deps.DEFAULT_PROVIDER}/${deps.DEFAULT_MODEL}`;
  const slashIndex = modelRef.indexOf("/");
  const provider =
    slashIndex === -1 ? deps.DEFAULT_PROVIDER : modelRef.slice(0, slashIndex);
  const model = slashIndex === -1 ? modelRef : modelRef.slice(slashIndex + 1);

  const thinkLevel = deps.resolveThinkingDefault({ cfg, provider, model });

  const identity = deps.resolveAgentIdentity(cfg, agentId);
  const agentName = identity?.name?.trim() || "assistant";

  const basePrompt =
    voiceConfig.responseSystemPrompt?.trim() ||
    `You are ${agentName}, a helpful voice assistant in a Discord voice channel. Keep responses concise and conversational (1-2 sentences max). Be natural and friendly. You have access to tools - use them when helpful.`;

  let extraSystemPrompt = basePrompt;
  if (transcript.length > 0) {
    const history = transcript
      .map((entry) =>
        `${entry.speaker === "bot" ? "You" : "User"}: ${entry.text}`,
      )
      .join("\n");
    extraSystemPrompt = `${basePrompt}\n\nConversation so far:\n${history}`;
  }

  const timeoutMs =
    voiceConfig.responseTimeoutMs && voiceConfig.responseTimeoutMs > 0
      ? voiceConfig.responseTimeoutMs
      : deps.resolveAgentTimeoutMs({ cfg });
  const runId = `voice:discord:${channelId}:${Date.now()}`;

  try {
    const result = await deps.runEmbeddedPiAgent({
      sessionId,
      sessionKey,
      messageProvider: "voice",
      sessionFile,
      workspaceDir,
      config: cfg,
      prompt: userMessage,
      provider,
      model,
      thinkLevel,
      verboseLevel: "off",
      timeoutMs,
      runId,
      lane: "voice",
      extraSystemPrompt,
      agentDir,
    });

    const texts = (result.payloads ?? [])
      .filter((p) => p.text && !p.isError)
      .map((p) => p.text?.trim())
      .filter(Boolean);

    const text = texts.join(" ") || null;

    if (!text && result.meta?.aborted) {
      return { text: null, error: "Response generation was aborted" };
    }

    return { text };
  } catch (err) {
    console.error(`[discord-voice] Response generation failed:`, err);
    return { text: null, error: String(err) };
  }
}
