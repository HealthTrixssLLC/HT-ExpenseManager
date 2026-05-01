/* eslint-disable no-console */
/**
 * Encryption round-trip unit test for QBO credential storage.
 *
 * Run with: pnpm --filter @workspace/api-server run test:encryption
 *
 * Verifies:
 *   - encryptString / decryptString round-trip is lossless
 *   - encryptNullable / decryptNullable preserve null
 *   - tampering with the ciphertext is detected (AES-GCM auth tag)
 *   - using the wrong key fails to decrypt
 *   - maskSecret produces the expected admin-UI preview
 *   - the helper throws when the env var is missing
 */
import assert from "node:assert/strict";

// Make sure the env var is set BEFORE importing the encryption module so
// the cached key is derived from a known value.
process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"] =
  "test-key-for-encryption-round-trip-suite-please-replace-in-prod";

const enc = await import("../src/lib/encryption.js");
const {
  encryptString,
  decryptString,
  encryptNullable,
  decryptNullable,
  maskSecret,
  encryptionAvailable,
  _resetEncryptionKeyForTest,
} = enc;

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

console.log("encryption.ts round-trip suite\n");

test("encryptionAvailable() returns true when env var is set", () => {
  assert.equal(encryptionAvailable(), true);
});

test("ASCII round-trip", () => {
  const plain = "ABw1lMaR4SHnSyNiHHr5tw3VYpO5dIwwDpsxRYXgT9pZGzqM7tt";
  const ct = encryptString(plain);
  assert.notEqual(ct, plain, "ciphertext should differ from plaintext");
  assert.equal(decryptString(ct), plain);
});

test("Unicode + emoji round-trip", () => {
  const plain = "✅ Healthtrix — αβγ — 健康 — 🚀💼";
  const ct = encryptString(plain);
  assert.equal(decryptString(ct), plain);
});

test("Empty string round-trip", () => {
  const ct = encryptString("");
  assert.equal(decryptString(ct), "");
});

test("Two encryptions of the same plaintext yield different ciphertexts", () => {
  const plain = "secret-client-secret-value";
  const a = encryptString(plain);
  const b = encryptString(plain);
  assert.notEqual(a, b, "IVs should be random per-call");
  assert.equal(decryptString(a), plain);
  assert.equal(decryptString(b), plain);
});

test("encryptNullable + decryptNullable preserve null", () => {
  assert.equal(encryptNullable(null), null);
  assert.equal(encryptNullable(undefined), null);
  assert.equal(encryptNullable(""), null);
  assert.equal(decryptNullable(null), null);
  assert.equal(decryptNullable(undefined), null);
  assert.equal(decryptNullable(""), null);
});

test("encryptNullable / decryptNullable round-trip a real value", () => {
  const value = "Lh3-CASE-SeCrEt!@#";
  const ct = encryptNullable(value);
  assert.notEqual(ct, null);
  assert.equal(decryptNullable(ct), value);
});

test("Tampering with ciphertext is rejected by the auth tag", () => {
  const plain = "tamper-me-please";
  const ct = encryptString(plain);
  // Flip one byte in the middle of the base64 payload.
  const buf = Buffer.from(ct, "base64");
  buf[buf.length - 4] ^= 0x01;
  const tampered = buf.toString("base64");
  assert.throws(() => decryptString(tampered));
});

test("Truncated payloads are rejected", () => {
  assert.throws(() => decryptString(""));
  assert.throws(() => decryptString("AAAA"));
});

test("Decrypting with the wrong key fails", () => {
  const plain = "wrong-key-test";
  const ct = encryptString(plain);
  // Swap the key, reset the cache, then expect a failure.
  const original = process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"];
  process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"] = "completely-different-key-XYZ";
  _resetEncryptionKeyForTest();
  try {
    assert.throws(() => decryptString(ct));
  } finally {
    process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"] = original;
    _resetEncryptionKeyForTest();
  }
});

test("Missing env var throws on first encrypt", () => {
  const original = process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"];
  delete process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"];
  _resetEncryptionKeyForTest();
  try {
    assert.equal(encryptionAvailable(), false);
    assert.throws(() => encryptString("nope"));
  } finally {
    process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"] = original;
    _resetEncryptionKeyForTest();
  }
});

test("maskSecret returns last-4 preview for normal-length secrets", () => {
  assert.equal(maskSecret(null), null);
  assert.equal(maskSecret(""), null);
  assert.equal(maskSecret("ab"), "••••••");
  assert.equal(maskSecret("ABCDEFGHIJ"), "••••••GHIJ");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
