import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type AppRole, isAdmin, isDeveloper, isOwner, isUser } from "@/lib/permissions";

export interface MyRole {
  role: AppRole;
  subscriptionPlan: "free" | "pro";
  developerMode: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isDeveloper: boolean;
  isUser: boolean;
}

/**
 * Reads (and, exactly once ever, initializes) the current user's role.
 * Every authenticated screen that needs to know "is this person the Owner /
 * an Admin / a Developer?" should go through this — never a client-side
 * flag — since the underlying `user_roles` table can't be written to from
 * the browser at all.
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
      isOwner: isOwner(record.role),
      isAdmin: isAdmin(record.role),
      isDeveloper: isDeveloper(record.role),
      isUser: isUser(record.role),
    };
  });

export interface ManagedUserDto {
  userId: string;
  email: string | null;
  role: AppRole;
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
    if (!caller || !isOwner(caller.role)) {
      throw new Error("Forbidden: Owner access required.");
    }
    return listAllUsersWithRoles();
  });

/**
 * Owner Dashboard only. Moves a user between "user", "developer" and
 * "admin" — covers creating/removing Developers, promoting a Developer to
 * Admin, and ordinary Admin promotion/demotion. Cannot target the Owner,
 * and cannot target yourself.
 */
export const setManagedUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { targetUserId: string; role: "admin" | "developer" | "user" }) => data)
  .handler(async ({ data, context }) => {
    const { getRole, setUserRole } = await import("./roles.server");
    const caller = await getRole(context.userId);
    if (!caller || !isOwner(caller.role)) {
      throw new Error("Forbidden: Owner access required.");
    }
    if (data.targetUserId === context.userId) {
      throw new Error("You can't change your own role.");
    }
    const updated = await setUserRole(data.targetUserId, data.role);
    return { ok: true, role: updated.role };
  });

/**
 * Self-service Developer Mode toggle, available from the Developer
 * Dashboard. Only ever changes the caller's own row, and only works if the
 * caller is already a Developer or the Owner — it cannot be used to grant
 * anyone a role they don't already have.
 */
export const setMyDeveloperMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enabled: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { setDeveloperMode } = await import("./roles.server");
    const updated = await setDeveloperMode(context.userId, data.enabled);
    return { ok: true, developerMode: updated.developerMode };
  });
