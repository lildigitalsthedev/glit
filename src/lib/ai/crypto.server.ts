import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for user-supplied AI provider API keys. Same construction as
 * the GitHub token crypto, but keyed off its own secret so the two blast
 * radii stay separate.
 */
function key(): Buffer {
  const raw = process.env["AI_KEY_ENC_KEY"];
  if (!raw) throw new Error("AI_KEY_ENC_KEY is not set");
  return createHash("sha256").update(raw).digest();
}

export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptApiKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Masked, safe-to-display remnant of a key, e.g. `••••4f2a`. */
export function keyHint(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`;
}