import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMcpKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listKeys } = await import("./mcp/keys.server");
    return listKeys(context.userId);
  });

export const createMcpKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ name: z.string().max(60) }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { createKey } = await import("./mcp/keys.server");
    return { key: await createKey(context.userId, data.name) };
  });

export const deleteMcpKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { deleteKey } = await import("./mcp/keys.server");
    await deleteKey(context.userId, data.id);
    return { ok: true };
  });
