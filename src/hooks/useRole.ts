import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/roles.functions";

/**
 * The shared "what role does this person have?" check. Backed by the
 * `user_roles` table, which is read-only from the client — the role
 * returned here always reflects what's actually stored server-side, never
 * something a client could have tampered with.
 */
export function useRole() {
  const getMyRoleFn = useServerFn(getMyRole);
  const query = useQuery({ queryKey: ["role"], queryFn: () => getMyRoleFn() });

  return {
    role: query.data?.role ?? "user",
    subscriptionPlan: query.data?.subscriptionPlan ?? "free",
    developerMode: query.data?.developerMode ?? false,
    isOwner: query.data?.isOwner ?? false,
    isAdmin: query.data?.isAdmin ?? false,
    isLoading: query.isLoading,
  };
}
