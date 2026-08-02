// Server-only. Uses the service-role Supabase client, which bypasses RLS —
// never import this file from anything that ships to the browser. Route
// files and *.functions.ts files should only reach it via a dynamic
// `await import("./roles.server")` inside a handler, same pattern used for
// `client.server.ts` elsewhere in this codebase.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AppRole = "user" | "admin" | "owner";
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

  // Keep the existing `user_preferences.plan` flag (already used throughout
  // the app for `isPro` gating) in sync so the Owner is never restricted by
  // billing anywhere that already checks `usePlan()`.
  await supabaseAdmin
    .from("user_preferences")
    .upsert(
      { user_id: userId, plan: "pro", plan_updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

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
 * Owner-only: promotes a "user" to "admin" or demotes an "admin" back to
 * "user". Deliberately cannot touch the "owner" role in either direction —
 * ownership transfer is a separate, more sensitive future feature.
 */
export async function setUserRole(targetUserId: string, nextRole: "admin" | "user"): Promise<RoleRecord> {
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
  return toRoleRecord(data);
}
