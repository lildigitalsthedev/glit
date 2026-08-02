import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPreferences } from "@/lib/workspace.functions";

/**
 * The shared "is this user on GitPush Pro?" check.
 *
 * This reads off the same `["prefs"]` query every other screen in the app
 * already populates, so calling `usePlan()` doesn't trigger an extra
 * network request — it just reads `plan` off of whatever's already
 * cached/loading.
 *
 * Every Pro-gated feature (multiple accounts, AI tools, prompt library,
 * etc.) should check `isPro` here rather than re-deriving plan state on
 * its own, so plan logic stays in one place.
 */
export function usePlan() {
  const prefsFn = useServerFn(getPreferences);
  const prefs = useQuery({ queryKey: ["prefs"], queryFn: () => prefsFn() });
  const plan = prefs.data?.plan ?? "free";

  return {
    plan,
    isPro: plan === "pro",
    isLoading: prefs.isLoading,
  };
}
