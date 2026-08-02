import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_FEATURE_LENGTH = 2000;

export const submitFeatureRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { gitpushUsername: string; email: string; feature: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const gitpushUsername = data.gitpushUsername.trim();
    const email = data.email.trim();
    const feature = data.feature.trim();

    if (!gitpushUsername) throw new Error("Enter your GitPush username.");
    if (!email) throw new Error("Enter an email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (!feature) throw new Error("Describe the feature you'd like to see.");
    if (feature.length > MAX_FEATURE_LENGTH) {
      throw new Error(`Keep the feature description under ${MAX_FEATURE_LENGTH} characters.`);
    }

    const { error } = await context.supabase.from("feature_requests").insert({
      user_id: context.userId,
      gitpush_username: gitpushUsername,
      email,
      feature,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
