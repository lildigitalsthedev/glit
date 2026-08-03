/**
 * Single source of truth for GitPush's role hierarchy.
 *
 * Owner
 * ├── Admin
 * ├── Developer
 * └── User
 *
 * This file is intentionally free of any Supabase/service-role imports so it
 * is safe to pull into both server code (roles.server.ts, *.functions.ts)
 * and client components (useRole.ts, route guards, UI visibility checks).
 * The actual role value itself always comes from the server — see
 * roles.server.ts's comment on `user_roles` for why the client can never
 * tamper with it — these helpers just answer "given this role, can they do
 * X?" consistently everywhere instead of scattering `role === "..."` string
 * comparisons across the app.
 */

export type AppRole = "user" | "developer" | "admin" | "owner";

export const APP_ROLES: readonly AppRole[] = ["user", "developer", "admin", "owner"] as const;

/** True only for the single account holding the Owner role. */
export function isOwner(role: AppRole | string | null | undefined): boolean {
  return role === "owner";
}

/**
 * True for Admins and the Owner. Admins manage users/reports/moderation;
 * the Owner can access every feature, so it's included here too.
 */
export function isAdmin(role: AppRole | string | null | undefined): boolean {
  return role === "admin" || role === "owner";
}

/**
 * True for Developers and the Owner. Developers get development/debugging
 * tools (feature flags, logs, cache, diagnostics) without business or
 * security-sensitive administration — Admin does NOT imply Developer, since
 * dev tooling and business administration are deliberately separate lanes.
 */
export function isDeveloper(role: AppRole | string | null | undefined): boolean {
  return role === "developer" || role === "owner";
}

/**
 * True only for the plain "user" role. Unlike the other helpers this is a
 * literal check, not a hierarchy check — "user" is the base tier with no
 * elevated capabilities to inherit into.
 */
export function isUser(role: AppRole | string | null | undefined): boolean {
  return role === "user";
}
