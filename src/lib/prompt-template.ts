const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** The four variables Feature 5 asks every prompt to support, in the order they should be offered when filling one out. */
export const KNOWN_PROMPT_VARIABLES = ["repo", "branch", "language", "feature"] as const;

/** Every distinct `{{name}}` placeholder in a prompt body, in first-seen order. */
export function extractPromptVariables(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** Substitutes every `{{name}}` with `values[name]`, leaving unmatched placeholders untouched so the caller can tell what's still missing. */
export function renderPromptTemplate(body: string, values: Record<string, string>): string {
  return body.replace(VARIABLE_PATTERN, (full, name: string) => {
    const value = values[name];
    return value && value.trim() ? value : full;
  });
}
