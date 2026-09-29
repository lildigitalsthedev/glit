import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * GitPush MCP server (Streamable HTTP, stateless JSON responses).
 * Authenticated by a personal access key: `Authorization: Bearer gp_...`.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

type RpcMsg = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(msg: RpcMsg, userId: string) {
  const { TOOLS } = await import("@/lib/mcp/tools.server");
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({
    jsonrpc: "2.0",
    id: msg.id ?? null,
    error: { code, message },
  });

  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: (msg.params?.["protocolVersion"] as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "gitpush", version: "1.0.0" },
        instructions:
          "Use GitPush to browse the user's GitHub repositories and push code. Prefer push_files for multi-file changes (one commit).",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: z.toJSONSchema(t.schema),
        })),
      });
    case "tools/call": {
      const name = msg.params?.["name"] as string;
      const tool = (TOOLS as Record<string, (typeof TOOLS)[keyof typeof TOOLS]>)[name];
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      const parsed = tool.schema.safeParse(msg.params?.["arguments"] ?? {});
      if (!parsed.success) {
        return ok({ isError: true, content: [{ type: "text", text: parsed.error.message }] });
      }
      try {
        const { assertPro } = await import("@/lib/ai/gate.server");
        await assertPro(userId);
        const { assertRateLimit } = await import("@/lib/rate-limit.server");
        await assertRateLimit(userId, { bucket: "mcp", limit: 60, windowSeconds: 60 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const out = await (tool.run as any)(userId, parsed.data);
        const text = typeof out === "string" ? out : JSON.stringify(out, null, 2);
        return ok({ content: [{ type: "text", text }] });
      } catch (e) {
        return ok({
          isError: true,
          content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
        });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => new Response("Method Not Allowed", { status: 405, headers: CORS }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const raw = auth.replace(/^Bearer\s+/i, "").trim();
        const { verifyKey } = await import("@/lib/mcp/keys.server");
        const userId = raw ? await verifyKey(raw) : null;
        if (!userId) {
          return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid or missing GitPush access key" } }, 401);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
        }

        const msgs = (Array.isArray(body) ? body : [body]) as RpcMsg[];
        const results = [];
        for (const m of msgs) {
          if (m.id === undefined || m.id === null) continue; // notification
          results.push(await handle(m, userId));
        }
        if (!results.length) return new Response(null, { status: 202, headers: CORS });
        return json(Array.isArray(body) ? results : results[0]);
      },
    },
  },
});
