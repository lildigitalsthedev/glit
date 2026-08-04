/**
 * Kept out of `ai.functions.ts` on purpose: server-function modules get
 * split at build time, which strips runtime siblings of the exported
 * functions. Importing these avoids a `ReferenceError` in production.
 */
export const GENERATE_SYSTEM = [
  "You are a senior engineer generating a single source file.",
  "Return ONLY the file's raw contents — no explanations, no markdown fences.",
  "Write complete, production-quality, idiomatic code with correct imports.",
  "Match the conventions implied by the file path and extension.",
].join(" ");

export const EDIT_SYSTEM = [
  "You are a senior engineer editing one existing source file.",
  "Apply the requested change and return ONLY the complete updated file contents.",
  "No explanations, no markdown fences, no partial diffs or ellipses.",
  "Preserve unrelated code, formatting and comments exactly as-is.",
].join(" ");