// Server-only. Uses the service-role Supabase client, which bypasses RLS —
// never import this file from anything that ships to the browser. Route
// files and *.functions.ts files should only reach it via a dynamic
// `await import("./roles.server")` inside a handler, same pattern used for
// `client.server.ts` elsewhere in this codebase.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { type AppRole, isDeveloper } from "@/lib/permissions";

export type { AppRole };
export type SubscriptionPlan = "free" | "pro";

export interface RoleRecord {
  userId: string;
  role: AppRole;
  subscriptionPlan: SubscriptionPlan;
  developerMode: boolean;
}

function toRoleRecord(row: {
  user_id: string;
  role: string;
  subscription_plan: string;
  developer_mode: boolean;
}): RoleRecord {
  return {
    userId: row.user_id,
    role: row.role as AppRole,
    subscriptionPlan: row.subscription_plan as SubscriptionPlan,
    developerMode: row.developer_mode,
  };
}

/**
 * Ensures the given user has a `user_roles` row, and — exactly once ever —
 * promotes the account matching `INITIAL_OWNER_EMAIL` to Owner the first
 * time it logs in after this feature ships (accounts created before the
 * `user_roles` trigger existed won't have a row yet either, so this also
 * backfills those).
 *
 * This is intentionally idempotent and safe to call on every login: once an
 * owner exists anywhere in the table, the INITIAL_OWNER_EMAIL branch never
 * fires again, and every other call just reads/creates the plain "user" row.
 */
export async function ensureRoleForUser(userId: string, email: string | null | undefined): Promise<RoleRecord> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role, subscription_plan, developer_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const initialOwnerEmail = process.env["INITIAL_OWNER_EMAIL"];
  const isDesignatedOwnerEmail =
    !!initialOwnerEmail && !!email && email.toLowerCase() === initialOwnerEmail.toLowerCase();

  if (existing) {
    // Already has a row. If this is the designated owner email and no owner
    // exists yet anywhere (e.g. the owner row was created by the signup
    // trigger as a normal "user" before this login), promote it now.
    if (existing.role !== "owner" && isDesignatedOwnerEmail) {
      const { data: ownerExists, error: ownerCheckError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "owner")
        .maybeSingle();
      if (ownerCheckError) throw new Error(ownerCheckError.message);

      if (!ownerExists) {
        return promoteToOwner(userId);
      }
    }
    return toRoleRecord(existing);
  }

  // No row yet (shouldn't normally happen once the signup trigger is in
  // place, but covers pre-existing accounts). Decide role at creation time.
  if (isDesignatedOwnerEmail) {
    const { data: ownerExists, error: ownerCheckError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "owner")
      .maybeSingle();
    if (ownerCheckError) throw new Error(ownerCheckError.message);
    if (!ownerExists) {
      return promoteToOwner(userId);
    }
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: userId })
    .select("user_id, role, subscription_plan, developer_mode")
    .single();
  if (createError) throw new Error(createError.message);
  return toRoleRecord(created);
}

/** Promotes a single account to Owner with unlimited Pro. Runs exactly once per project (see the partial unique index on role = 'owner'). */
async function promoteToOwner(userId: string): Promise<RoleRecord> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .upsert(
      { user_id: userId, role: "owner", subscription_plan: "pro" },
      { onConflict: "user_id" },
    )
    .select("user_id, role, subscription_plan, developer_mode")
    .single();
  if (error) throw new Error(error.message);
  // `subscription_plan: "pro"` above (and `isOwner()` in `usePlan`/
  // `assertPro`) already covers "Owner is never restricted by billing" —
  // no second flag to keep in sync since `user_preferences.plan` was
  // removed. See `src/lib/paystack/subscriptions.server.ts`.
  return toRoleRecord(data);
}

export async function getRole(userId: string): Promise<RoleRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role, subscription_plan, developer_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRoleRecord(data) : null;
}

export interface ManagedUser {
  userId: string;
  email: string | null;
  role: AppRole;
  subscriptionPlan: SubscriptionPlan;
  createdAt: string | null;
  lastSignInAt: string | null;
}

/** Owner-only: lists every account with its role, for the Owner Dashboard. */
export async function listAllUsersWithRoles(): Promise<ManagedUser[]> {
  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role, subscription_plan")
    .order("user_id", { ascending: true });
  if (roleError) throw new Error(roleError.message);

  const roleByUserId = new Map((roleRows ?? []).map((row) => [row.user_id, row]));

  const users: ManagedUser[] = [];
  let page = 1;
  const perPage = 200;
  // Supabase's admin listUsers is paginated; a real production build with
  // many thousands of accounts would want a dedicated search endpoint, but
  // this keeps the Owner Dashboard simple and correct for now.
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    for (const user of data.users) {
      const roleRow = roleByUserId.get(user.id);
      users.push({
        userId: user.id,
        email: user.email ?? null,
        role: (roleRow?.role as AppRole | undefined) ?? "user",
        subscriptionPlan: (roleRow?.subscription_plan as SubscriptionPlan | undefined) ?? "free",
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return users;
}

/**
 * Owner-only: moves a user between "user", "developer" and "admin".
 * Deliberately cannot touch the "owner" role in either direction —
 * ownership transfer is a separate, more sensitive future feature. This one
 * function covers every Owner-level role change described in the role
 * system: creating a Developer (user -> developer), removing/demoting one
 * (developer -> user), promoting a Developer to Admin (developer -> admin),
 * and ordinary Admin promotion/demotion (user <-> admin).
 */
export async function setUserRole(
  targetUserId: string,
  nextRole: "admin" | "developer" | "user",
): Promise<RoleRecord> {
  const { data: target, error: targetError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetError) throw new Error(targetError.message);
  if (!target) throw new Error("User not found.");
  if (target.role === "owner") throw new Error("The Owner role cannot be changed here.");

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .update({ role: nextRole })
    .eq("user_id", targetUserId)
    .select("user_id, role, subscription_plan, developer_mode")
    .single();
  if (error) throw new Error(error.message);

  // Leaving the Developer role entirely (e.g. demoted straight to "user")
  // also switches off their personal Developer Mode toggle, since that
  // toggle is meaningless — and shouldn't linger silently enabled — for
  // someone who no longer has Developer Dashboard access.
  if (nextRole === "user" && data.developer_mode) {
    const { data: reset, error: resetError } = await supabaseAdmin
      .from("user_roles")
      .update({ developer_mode: false })
      .eq("user_id", targetUserId)
      .select("user_id, role, subscription_plan, developer_mode")
      .single();
    if (resetError) throw new Error(resetError.message);
    return toRoleRecord(reset);
  }

  return toRoleRecord(data);
}

/**
 * Self-service: lets a Developer or the Owner flip their own "Developer
 * Mode" toggle. This never changes anyone's role — it only controls whether
 * developer-only UI affordances are switched on for the caller's own
 * account — so it's safe to allow the caller to target only themselves.
 * Anyone who isn't currently a Developer or the Owner is rejected, so a
 * plain user can't use this as a backdoor into developer UI.
 */
export async function setDeveloperMode(userId: string, enabled: boolean): Promise<RoleRecord> {
  const caller = await getRole(userId);
  if (!caller || !isDeveloper(caller.role)) {
    throw new Error("Forbidden: Developer access required.");
  }

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .update({ developer_mode: enabled })
    .eq("user_id", userId)
    .select("user_id, role, subscription_plan, developer_mode")
    .single();
  if (error) throw new Error(error.message);
  return toRoleRecord(data);
}
