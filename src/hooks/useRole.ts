import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/roles.functions";
import type { AppRole } from "@/lib/permissions";

/**
 * The shared "what role does this person have?" check. Backed by the
 * `user_roles` table, which is read-only from the client — the role
 * returned here always reflects what's actually stored server-side, never
 * something a client could have tampered with.
 *
 * `isOwner` / `isAdmin` / `isDeveloper` / `isUser` mirror the helpers in
 * `@/lib/permissions` and should be used for all UI-visibility decisions
 * throughout the app (e.g. showing the Owner Dashboard or Developer
 * Dashboard links) — remember these are UI-only checks; the real
 * enforcement always happens again on the server.
 */
export function useRole() {
  const getMyRoleFn = useServerFn(getMyRole);
  const query = useQuery({ queryKey: ["role"], queryFn: () => getMyRoleFn() });

  return {
    role: (query.data?.role ?? "user") as AppRole,
    subscriptionPlan: query.data?.subscriptionPlan ?? "free",
    developerMode: query.data?.developerMode ?? false,
    isOwner: query.data?.isOwner ?? false,
    isAdmin: query.data?.isAdmin ?? false,
    isDeveloper: query.data?.isDeveloper ?? false,
    isUser: query.data?.isUser ?? false,
    isLoading: query.isLoading,
  };
}
