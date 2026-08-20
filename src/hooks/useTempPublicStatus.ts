import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRepoTemporaryPublicStatus, type TempPublicStatus } from "@/lib/github-share.functions";

/**
 * Polls the server for whether `fullName` currently has an active
 * temporary-public window. Polling (rather than a client-side countdown
 * alone) is what lets the UI notice a server-side revert — from the cron
 * sweep, another tab ending it early, or someone else on the team — even
 * though the countdown itself renders locally between polls for a smooth
 * ticking display.
 */
export function useTempPublicStatus(accountId: string | null, fullName: string | null) {
  const fn = useServerFn(getRepoTemporaryPublicStatus);
  return useQuery<TempPublicStatus | null>({
    queryKey: ["temp-public-status", accountId, fullName],
    queryFn: () => fn({ data: { accountId: accountId!, fullName: fullName! } }),
    enabled: Boolean(accountId && fullName),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && (data.status === "active" || data.status === "reverting") ? 5000 : 20000;
    },
  });
}
