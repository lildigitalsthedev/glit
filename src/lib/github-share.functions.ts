import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ShareRole } from "@/lib/github/share-links.server";
import type { TempPublicStatus } from "@/lib/github/temp-public.server";
import type { AccessLinkSummary } from "@/lib/github/share-links.server";

export type { ShareRole, AccessLinkSummary } from "@/lib/github/share-links.server";
export type { TempPublicStatus } from "@/lib/github/temp-public.server";
export { SHARE_ROLES, SHARE_ROLE_LABELS, SHARE_ROLE_DESCRIPTIONS } from "@/lib/github/share-links.server";

/**
 * All owner-side actions for both sharing features require `repos:manage`
 * — the same capability that already gates rename/archive/visibility —
 * since starting a temporary-public window or minting an access link is
 * exactly that kind of repository-management action.
 */
async function requireManage(userId: string) {
  const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
  return requireActiveWorkspaceCapability(userId, "repos:manage");
}

// ---------------------------------------------------------------------
// Feature 1: Temporary Public Repository
// ---------------------------------------------------------------------

export const makeRepoTemporarilyPublic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; seconds: number }) => data)
  .handler(async ({ data, context }): Promise<TempPublicStatus> => {
    const { workspaceId } = await requireManage(context.userId);
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_repo_admin", limit: 10, windowSeconds: 3600 });
    const { makeTemporarilyPublic } = await import("./github/temp-public.server");
    return makeTemporarilyPublic({
      supabase: context.supabase,
      workspaceId,
      accountId: data.accountId,
      fullName: data.fullName,
      userId: context.userId,
      seconds: data.seconds,
    });
  });

export const extendRepoTemporaryPublic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; addSeconds: number }) => data)
  .handler(async ({ data, context }): Promise<TempPublicStatus> => {
    const { workspaceId } = await requireManage(context.userId);
    const { extendTemporaryPublic } = await import("./github/temp-public.server");
    return extendTemporaryPublic({
      workspaceId,
      accountId: data.accountId,
      fullName: data.fullName,
      userId: context.userId,
      addSeconds: data.addSeconds,
    });
  });

export const endRepoTemporaryPublicNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string }) => data)
  .handler(async ({ data, context }): Promise<{ fullName: string; isPrivate: boolean }> => {
    const { workspaceId } = await requireManage(context.userId);
    const { endTemporaryPublicNow } = await import("./github/temp-public.server");
    return endTemporaryPublicNow({
      supabase: context.supabase,
      workspaceId,
      accountId: data.accountId,
      fullName: data.fullName,
      userId: context.userId,
    });
  });

/**
 * Polled by the countdown UI (every few seconds while a repo's info panel
 * or the share dialog is open). Doesn't require `repos:manage` — any
 * workspace member who can see the repo should be able to see that it's
 * temporarily public, only starting/extending/ending it is manager-only.
 */
export const getRepoTemporaryPublicStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string }) => data)
  .handler(async ({ data, context }): Promise<TempPublicStatus | null> => {
    const { getActiveWorkspaceId, requireCapability } = await import("./workspaces/store.server");
    const workspaceId = await getActiveWorkspaceId(context.userId);
    await requireCapability(context.userId, workspaceId, "workspace:view");
    const { getTemporaryPublicStatus } = await import("./github/temp-public.server");
    return getTemporaryPublicStatus({ accountId: data.accountId, fullName: data.fullName });
  });

// ---------------------------------------------------------------------
// Feature 2: Expiring / Limited-Use Access Links
// ---------------------------------------------------------------------

export const createRepoAccessLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      accountId: string;
      fullName: string;
      role: ShareRole;
      maxUses: number | null;
      expiresInSeconds: number;
      allowDownload: boolean;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<{ link: AccessLinkSummary; shareUrl: string }> => {
    const { workspaceId } = await requireManage(context.userId);
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "share_link_create", limit: 30, windowSeconds: 3600 });
    const { createAccessLink } = await import("./github/share-links.server");
    const { link, token } = await createAccessLink({
      workspaceId,
      accountId: data.accountId,
      fullName: data.fullName,
      userId: context.userId,
      role: data.role,
      maxUses: data.maxUses,
      expiresInSeconds: data.expiresInSeconds,
      allowDownload: data.allowDownload,
    });
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = new URL(getRequest().url).origin;
    return { link, shareUrl: `${origin}/share/${token}` };
  });

export const listRepoAccessLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fullName?: string } | undefined) => data)
  .handler(async ({ data, context }): Promise<AccessLinkSummary[]> => {
    const { getActiveWorkspaceId, requireCapability } = await import("./workspaces/store.server");
    const workspaceId = await getActiveWorkspaceId(context.userId);
    await requireCapability(context.userId, workspaceId, "activity:view");
    const { listAccessLinks } = await import("./github/share-links.server");
    return listAccessLinks(workspaceId, data?.fullName);
  });

export const revokeRepoAccessLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { linkId: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { workspaceId } = await requireManage(context.userId);
    const { revokeAccessLink } = await import("./github/share-links.server");
    await revokeAccessLink({ workspaceId, linkId: data.linkId, userId: context.userId });
    return { ok: true };
  });

export const extendRepoAccessLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { linkId: string; addSeconds: number }) => data)
  .handler(async ({ data, context }): Promise<AccessLinkSummary> => {
    const { workspaceId } = await requireManage(context.userId);
    const { extendAccessLink } = await import("./github/share-links.server");
    return extendAccessLink({ workspaceId, linkId: data.linkId, userId: context.userId, addSeconds: data.addSeconds });
  });

export const updateRepoAccessLinkMaxUses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { linkId: string; maxUses: number | null }) => data)
  .handler(async ({ data, context }): Promise<AccessLinkSummary> => {
    const { workspaceId } = await requireManage(context.userId);
    const { updateAccessLinkMaxUses } = await import("./github/share-links.server");
    return updateAccessLinkMaxUses({
      workspaceId,
      linkId: data.linkId,
      userId: context.userId,
      maxUses: data.maxUses,
    });
  });
