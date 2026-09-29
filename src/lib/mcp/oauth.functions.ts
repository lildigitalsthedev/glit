import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const approveMcpAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    clientId: z.string().min(1), redirectUri: z.string().url(),
    codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), resource: z.string().url(), state: z.string().max(500).optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("@/lib/ai/gate.server");
    await assertPro(context.userId);
    const { issueCode } = await import("./oauth.server");
    const code = await issueCode({ ...data, userId: context.userId });
    const target = new URL(data.redirectUri);
    target.searchParams.set("code", code);
    if (data.state) target.searchParams.set("state", data.state);
    return { redirect: target.toString() };
  });
