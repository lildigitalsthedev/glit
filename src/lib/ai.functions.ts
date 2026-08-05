import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAT_SYSTEM, EDIT_SYSTEM, GENERATE_SYSTEM } from "./ai/prompts";

/**
 * Bring Your Own AI + AI code generation / file editing.
 *
 * Every mutating function here is Pro-gated on the server (`assertPro`) —
 * the UI's Pro checks are convenience only. API keys are stored encrypted
 * and are never returned to the client: the frontend only ever sees a
 * masked hint like `••••4f2a`.
 */

export interface AiProviderDto {
  id: string;
  provider: string;
  label: string | null;
  keyHint: string;
  baseUrl: string | null;
  model: string | null;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
}

export const listAiProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiProviderDto[]> => {
    const { listProvidersForUser } = await import("./ai/store.server");
    return listProvidersForUser(context.userId);
  });

export const saveAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      provider: string;
      apiKey?: string;
      label?: string | null;
      baseUrl?: string | null;
      model?: string | null;
      enabled?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<AiProviderDto> => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { upsertProviderForUser } = await import("./ai/store.server");
    return upsertProviderForUser(context.userId, data);
  });

export const setAiProviderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string; enabled: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { upsertProviderForUser } = await import("./ai/store.server");
    await upsertProviderForUser(context.userId, {
      provider: data.provider,
      enabled: data.enabled,
    });
    return { ok: true };
  });

export const setDefaultAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { setDefaultProviderForUser } = await import("./ai/store.server");
    await setDefaultProviderForUser(context.userId, data.id);
    return { ok: true };
  });

export const deleteAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { deleteProviderForUser } = await import("./ai/store.server");
    await deleteProviderForUser(context.userId, data.id);
    return { ok: true };
  });

/** Cheap round-trip so users can confirm a key works before relying on it. */
export const testAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "ai_test", limit: 10, windowSeconds: 60 });
    const { resolveProviderForUser } = await import("./ai/store.server");
    const { chat } = await import("./ai/call.server");
    const credential = await resolveProviderForUser(context.userId, data.id);
    const reply = await chat({
      credential,
      system: "Reply with the single word: ok",
      prompt: "ping",
      maxTokens: 16,
    });
    return { ok: true, model: credential.model, reply: reply.slice(0, 80) };
  });

export const generateCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { prompt: string; path?: string; providerId?: string | null; context?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "ai_generate", limit: 20, windowSeconds: 300 });
    const { resolveProviderForUser } = await import("./ai/store.server");
    const { chat, stripCodeFences } = await import("./ai/call.server");

    const prompt = data.prompt.trim();
    if (!prompt) throw new Error("Describe what you want generated.");

    const credential = await resolveProviderForUser(context.userId, data.providerId ?? null);
    const parts = [
      data.path ? `Target file path: ${data.path}` : "No file path given; infer a suitable one.",
      data.context ? `Existing file contents for reference:\n${data.context.slice(0, 8000)}` : "",
      `Request: ${prompt}`,
    ].filter(Boolean);

    const raw = await chat({ credential, system: GENERATE_SYSTEM, prompt: parts.join("\n\n") });
    const code = stripCodeFences(raw);
    if (!code) throw new Error("The provider returned an empty response. Try again.");
    return { code, model: credential.model, provider: credential.provider };
  });

export const editFileWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      instruction: string;
      path: string;
      content: string;
      providerId?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "ai_edit", limit: 20, windowSeconds: 300 });
    const { resolveProviderForUser } = await import("./ai/store.server");
    const { chat, stripCodeFences } = await import("./ai/call.server");

    const instruction = data.instruction.trim();
    if (!instruction) throw new Error("Describe what should change.");
    if (!data.content) throw new Error("No file content to edit.");

    const credential = await resolveProviderForUser(context.userId, data.providerId ?? null);
    const prompt = [
      `File path: ${data.path || "unknown"}`,
      `Instruction: ${instruction}`,
      `Current file contents:\n${data.content}`,
    ].join("\n\n");

    const raw = await chat({ credential, system: EDIT_SYSTEM, prompt, maxTokens: 8192 });
    const code = stripCodeFences(raw);
    if (!code) throw new Error("The provider returned an empty response. Try again.");
    return { code, model: credential.model, provider: credential.provider };
  });

/**
 * AI Repository Chat (Pro, FEATURE 9).
 *
 * Resolves the caller's decrypted GitHub token for the given account
 * (RLS-scoped, so an account belonging to another user is never visible),
 * pulls a small, keyword-relevant slice of the repo via `buildRepoContext`,
 * and asks the user's chosen AI provider to answer strictly from that
 * context.
 */
export const chatWithRepo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      accountId: string;
      fullName: string;
      branch: string;
      question: string;
      history?: { role: "user" | "assistant"; content: string }[];
      providerId?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "ai_chat", limit: 20, windowSeconds: 300 });

    const question = data.question.trim();
    if (!question) throw new Error("Ask a question about the repository.");
    if (!data.accountId) throw new Error("Select a connected GitHub account first.");
    if (!data.fullName || !data.branch) throw new Error("Select a repository and branch first.");

    const { resolveProviderForUser } = await import("./ai/store.server");
    const { chat } = await import("./ai/call.server");
    const { loadAccountToken } = await import("./github/tokens.server");
    const { buildRepoContext } = await import("./ai/repo-context.server");

    const [{ token }, credential] = await Promise.all([
      loadAccountToken(context.supabase, data.accountId),
      resolveProviderForUser(context.userId, data.providerId ?? null),
    ]);

    const { context: repoContext, filesUsed } = await buildRepoContext({
      token,
      fullName: data.fullName,
      branch: data.branch,
      question,
    });

    const history = (data.history ?? [])
      .slice(-8)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const prompt = [
      `Repository: ${data.fullName} (branch: ${data.branch})`,
      repoContext,
      history ? `Conversation so far:\n${history}` : "",
      `Question: ${question}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const answer = await chat({ credential, system: CHAT_SYSTEM, prompt, maxTokens: 2048 });
    if (!answer) throw new Error("The provider returned an empty response. Try again.");

    return { answer, filesUsed, model: credential.model, provider: credential.provider };
  });
