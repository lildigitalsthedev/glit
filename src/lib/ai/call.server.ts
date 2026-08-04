import { providerMeta } from "./catalog";
import type { ResolvedProvider } from "./store.server";

/**
 * One tiny chat wrapper over the three request shapes the supported
 * providers speak (OpenAI-style `/chat/completions`, Anthropic `/messages`,
 * and Gemini `generateContent`). Deliberately non-streaming: the app shows
 * the result for review before anything is pushed to GitHub.
 */
export async function chat({
  credential,
  system,
  prompt,
  maxTokens = 4096,
}: {
  credential: ResolvedProvider;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const wire = providerMeta(credential.provider)?.wire ?? "openai";
  const { apiKey, baseUrl, model } = credential;

  if (wire === "anthropic") {
    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = (await readJson(res)) as {
      content?: { type: string; text?: string }[];
    };
    return (json.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  }

  if (wire === "google") {
    const res = await fetch(
      `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
    );
    const json = (await readJson(res)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (json.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  const json = (await readJson(res)) as {
    choices?: { message?: { content?: string } }[];
  };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    // Surface the provider's own message where possible — it's what tells the
    // user their key is wrong, out of credit, or the model name is invalid.
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      const err = parsed.error;
      detail = (typeof err === "string" ? err : err?.message) ?? detail;
    } catch {
      /* non-JSON error body — fall back to the raw text */
    }
    throw new Error(`AI provider error (${res.status}): ${detail}`);
  }
  return JSON.parse(text) as unknown;
}

/**
 * Models love wrapping code in ```fences``` and prose. Strip that so what
 * lands in the editor is only the file's contents.
 */
export function stripCodeFences(raw: string): string {
  const text = raw.trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(text);
  if (fenced?.[1] !== undefined) return fenced[1].trim();
  const firstFence = /```[^\n]*\n([\s\S]*?)\n?```/.exec(text);
  if (firstFence?.[1] !== undefined) return firstFence[1].trim();
  return text;
}