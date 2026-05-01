import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM symmetric encryption for QBO credentials at rest.
 *
 * The key is sourced from the `QBO_CREDENTIAL_ENCRYPTION_KEY` environment
 * variable. We accept either a base64-encoded 32-byte key, or any other
 * string which we hash with SHA-256 to derive a 32-byte key. This keeps the
 * developer ergonomics sane (paste any passphrase) while still producing a
 * cryptographically valid key.
 *
 * Format on the wire: base64(iv || authTag || ciphertext)
 *   iv      = 12 bytes (96-bit, GCM standard)
 *   authTag = 16 bytes (128-bit)
 *   ciphertext = remaining bytes
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(): Buffer {
  const raw = process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"];
  if (!raw || raw.length === 0) {
    throw new Error(
      "QBO_CREDENTIAL_ENCRYPTION_KEY is not set. " +
        "Set it to a long random string (at least 32 chars) so QBO credentials can be encrypted at rest.",
    );
  }
  // Try base64 32-byte first.
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  } catch {
    /* fall through */
  }
  // Fallback: hash any input to a deterministic 32-byte key.
  return createHash("sha256").update(raw, "utf8").digest();
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) cachedKey = deriveKey();
  return cachedKey;
}

/** Returns true iff QBO_CREDENTIAL_ENCRYPTION_KEY is configured. */
export function encryptionAvailable(): boolean {
  const raw = process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"];
  return typeof raw === "string" && raw.length > 0;
}

/** Reset the cached key. Used by tests after mutating the env var. */
export function _resetEncryptionKeyForTest(): void {
  cachedKey = null;
}

export function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptString(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("Encrypted payload is too short to be valid.");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Helpers that gracefully handle null/empty values (round-trip null). */
export function encryptNullable(value: string | null | undefined): string | null {
  if (!value) return null;
  return encryptString(value);
}

export function decryptNullable(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return decryptString(value);
}

/**
 * Returns a "masked" preview of a decrypted secret for the admin UI:
 * "••••••" + last 4 chars (or just "••••••" for very short values).
 */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "••••••";
  return `••••••${value.slice(-4)}`;
}
