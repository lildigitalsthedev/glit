import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RepoSearchResult } from "@/lib/github/repo-search.server";

export type { RepoSearchResult, RepoFileNameMatch, RepoContentMatch } from "@/lib/github/repo-search.server";

/**
 * "Find in files" for the currently checked-out branch. Rate-limited more
 * tightly than an ordinary read (`listRepoTree`/`readRepoFile`) since one
 * call here can fan out into dozens of GitHub API requests server-side —
 * see repo-search.server.ts for the file-count/size caps that bound that.
 */
export const searchRepository = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; branch: string; query: string }) => data)
  .handler(async ({ data, context }): Promise<RepoSearchResult> => {
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "repo_search", limit: 60, windowSeconds: 3600 });
    const { loadAccountToken } = await import("./github/tokens.server");
    const { searchRepositoryContents } = await import("./github/repo-search.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    return searchRepositoryContents({
      token,
      fullName: data.fullName,
      branch: data.branch,
      query: data.query,
    });
  });
