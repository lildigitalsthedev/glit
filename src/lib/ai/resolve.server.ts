import type { ResolvedProvider } from "./store.server";

/**
 * The single credential-resolution path every AI server function goes
 * through. Bridges two separate stores:
 *   - `ai/store.server` — a user's own BYO keys (`ai_providers`)
 *   - `workspaces/ai-providers.server` — the workspace's shared team keys
 *     (`workspace_ai_providers`, Feature 8), usable by anyone with the
 *     `keys:use` capability (Owner/Admin/Developer — never Viewer)
 *
 * `providerId` prefixed with `"team:"` explicitly selects a shared team
 * key by id. Otherwise this tries the caller's personal default first —
 * BYO stays authoritative when someone has their own key configured — and
 * only falls back to the workspace's default team key if they don't. If
 * neither exists, the original (more specific) personal-provider error is
 * what surfaces, since "add your own key" is the more actionable message
 * for someone in a workspace with no team key either.
 */
export async function resolveAiCredential(args: {
  userId: string;
  workspaceId: string;
  providerId?: string | null;
}): Promise<ResolvedProvider> {
  const { userId, workspaceId, providerId } = args;

  if (providerId?.startsWith("team:")) {
    const { resolveTeamProvider } = await import("../workspaces/ai-providers.server");
    return resolveTeamProvider(workspaceId, userId, providerId.slice("team:".length));
  }

  // Feature 10: Workspace Settings → Security. When an Owner/Admin has
  // turned this on, personal BYO keys are skipped entirely for everyone in
  // the workspace — every AI call goes through the vetted, monitored team
  // key instead, even if the caller has their own key configured.
  const { getWorkspaceAiKeyPolicy } = await import("../workspaces/store.server");
  const { requireTeamAiKeys } = await getWorkspaceAiKeyPolicy(workspaceId);
  if (requireTeamAiKeys) {
    const { resolveTeamProvider } = await import("../workspaces/ai-providers.server");
    return resolveTeamProvider(workspaceId, userId, null);
  }

  const { resolveProviderForUser } = await import("./store.server");
  try {
    return await resolveProviderForUser(userId, providerId ?? null);
  } catch (personalError) {
    const { resolveTeamProvider } = await import("../workspaces/ai-providers.server");
    try {
      return await resolveTeamProvider(workspaceId, userId, null);
    } catch {
      throw personalError;
    }
  }
}
