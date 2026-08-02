import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MyRole {
  role: "user" | "admin" | "owner";
  subscriptionPlan: "free" | "pro";
  developerMode: boolean;
  isOwner: boolean;
  isAdmin: boolean;
}

/**
 * Reads (and, exactly once ever, initializes) the current user's role.
 * Every authenticated screen that needs to know "is this person the Owner /
 * an Admin?" should go through this — never a client-side flag — since the
 * underlying `user_roles` table can't be written to from the browser at all.
 */
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyRole> => {
    const { ensureRoleForUser } = await import("./roles.server");
    const record = await ensureRoleForUser(context.userId, context.claims.email as string | undefined);
    return {
      role: record.role,
      subscriptionPlan: record.subscriptionPlan,
      developerMode: record.developerMode,
      isOwner: record.role === "owner",
      isAdmin: record.role === "admin" || record.role === "owner",
    };
  });

export interface ManagedUserDto {
  userId: string;
  email: string | null;
  role: "user" | "admin" | "owner";
  subscriptionPlan: "free" | "pro";
  createdAt: string | null;
  lastSignInAt: string | null;
}

/** Owner Dashboard only. Re-checks the caller's role on the backend — never trusts the client. */
export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUserDto[]> => {
    const { getRole, listAllUsersWithRoles } = await import("./roles.server");
    const caller = await getRole(context.userId);
    if (!caller || caller.role !== "owner") {
      throw new Error("Forbidden: Owner access required.");
    }
    return listAllUsersWithRoles();
  });

/** Owner Dashboard only. Promotes a user to admin or demotes an admin to user. Cannot target the Owner, and cannot target yourself. */
export const setManagedUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { targetUserId: string; role: "admin" | "user" }) => data)
  .handler(async ({ data, context }) => {
    const { getRole, setUserRole } = await import("./roles.server");
    const caller = await getRole(context.userId);
    if (!caller || caller.role !== "owner") {
      throw new Error("Forbidden: Owner access required.");
    }
    if (data.targetUserId === context.userId) {
      throw new Error("You can't change your own role.");
    }
    const updated = await setUserRole(data.targetUserId, data.role);
    return { ok: true, role: updated.role };
  });
