// src/security.ts — Edge/Deno-compatible security transforms using Web Crypto API
//
// Implements @hash (PBKDF2), @encrypt (AES-256-GCM), and @secret annotations.
// Compatible with: Vercel Edge, Cloudflare Workers, Deno, Deno Deploy,
// browsers, Node.js 18+ (via globalThis.crypto, not node:crypto).
//
// Design principles:
//   - Zero npm dependencies — uses only Web Crypto API, TextEncoder, btoa/atob
//   - All crypto operations are async (Web Crypto API requirement)
//   - Self-describing storage format (algorithm$params$value) for future
//     algorithm upgrades without breaking existing data

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBufferSource(data: Uint8Array): BufferSource {
  return data as unknown as BufferSource;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ── PBKDF2 Password Hashing ──────────────────────────────────────────────
//
// Storage format: "pbkdf2$<base64salt>$<base64hash>"
//   - Salt: 16 random bytes
//   - Hash: 32 bytes (256 bits, SHA-256)
//   - Iterations: 100000 (OWASP recommended minimum for PBKDF2-HMAC-SHA256)

const HASH_ITERATIONS = 100_000;
const HASH_SALT_BYTES = 16;
const HASH_KEY_LENGTH = 256;

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(HASH_SALT_BYTES);
  crypto.getRandomValues(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toBufferSource(encoder.encode(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: toBufferSource(salt), iterations: HASH_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_KEY_LENGTH,
  );
  return `pbkdf2$${toBase64(salt)}$${toBase64(new Uint8Array(hash))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") {
    throw new Error("Unsupported hash format: " + (parts[0] || "unknown"));
  }
  const salt = fromBase64(parts[1]);
  const expectedHash = fromBase64(parts[2]);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toBufferSource(encoder.encode(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: toBufferSource(salt), iterations: HASH_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_KEY_LENGTH,
  );
  const actualHash = new Uint8Array(hash);
  let result = expectedHash.length ^ actualHash.length;
  for (let i = 0; i < Math.max(expectedHash.length, actualHash.length); i++) {
    result |= (expectedHash[i] || 0) ^ (actualHash[i] || 0);
  }
  return result === 0;
}

// ── AES-256-GCM Encryption ───────────────────────────────────────────────
//
// Storage format: "aes256gcm$<base64iv>$<base64ciphertext>$<base64authtag>"
//   - IV: 12 bytes (96 bits, NIST recommended for GCM)
//   - Auth tag: 16 bytes (128 bits, full GCM tag)
//   - Key: 32 bytes (256 bits), derived from master key + field salt

const ENCRYPT_IV_BYTES = 12;

export async function deriveEncryptionKey(
  masterKey: string,
  fieldSalt: string,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toBufferSource(encoder.encode(masterKey)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const rawKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toBufferSource(encoder.encode(fieldSalt)),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptField(
  plaintext: string,
  key: CryptoKey,
  iv?: Uint8Array,
): Promise<string> {
  const nonce = iv ?? new Uint8Array(ENCRYPT_IV_BYTES);
  if (!iv) crypto.getRandomValues(nonce);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBufferSource(nonce), tagLength: 128 },
    key,
    toBufferSource(encoder.encode(plaintext)),
  );
  const combined = new Uint8Array(ciphertext);
  const ctLen = combined.length - 16;
  const ct = combined.slice(0, ctLen);
  const tag = combined.slice(ctLen);
  return `aes256gcm$${toBase64(nonce)}$${toBase64(ct)}$${toBase64(tag)}`;
}

export async function decryptField(
  stored: string,
  key: CryptoKey,
): Promise<string> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "aes256gcm") {
    throw new Error("Unsupported encryption format: " + (parts[0] || "unknown"));
  }
  const iv = fromBase64(parts[1]);
  const ct = fromBase64(parts[2]);
  const tag = fromBase64(parts[3]);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct, 0);
  combined.set(tag, ct.length);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBufferSource(iv), tagLength: 128 },
    key,
    toBufferSource(combined),
  );
  return decoder.decode(plaintext);
}

// ── Meta helpers ─────────────────────────────────────────────────────────

export function isHashField(meta: any): boolean {
  return !!(meta?.hash || meta?.["@hash"]);
}

export function isEncryptField(meta: any): boolean {
  return !!(meta?.encrypt || meta?.["@encrypt"]);
}

export function isSecretField(meta: any): boolean {
  return !!(meta?.secret || meta?.["@secret"]);
}

// ── Write-time transforms (insert/update) ────────────────────────────────
// Applies @hash, @encrypt, @secret to field values before DB write.

export async function applySecurityOnWrite<T extends Record<string, any>>(
  item: T,
  schemaFields: Record<string, any> | undefined,
  encryptionKey?: string,
): Promise<T> {
  if (!schemaFields) return item;
  const data = item as Record<string, any>;
  for (const field of Object.keys(schemaFields)) {
    const meta = schemaFields[field]?.meta;
    if (!meta) continue;
    const value = data[field];
    if (value === undefined || value === null) continue;

    if (isSecretField(meta)) {
      data[field] = await hashPassword(String(value));
      continue;
    }

    if (isHashField(meta)) {
      const algo = meta.hash ?? meta["@hash"];
      if (algo === true || algo === "pbkdf2" || !algo) {
        data[field] = await hashPassword(String(value));
      }
      continue;
    }

    if (isEncryptField(meta)) {
      if (!encryptionKey) {
        console.warn(`[@encrypt] field "${field}" skipped - no encryptionKey configured`);
        continue;
      }
      const fieldKey = await deriveEncryptionKey(encryptionKey, field);
      data[field] = await encryptField(String(value), fieldKey);
      continue;
    }
  }
  return item;
}

// ── Read-time transforms (get / getAll / query results) ──────────────────
// Decrypts @encrypt fields after reading from DB.

export async function applySecurityOnRead(
  row: Record<string, any>,
  schemaFields: Record<string, any> | undefined,
  encryptionKey?: string,
): Promise<Record<string, any>> {
  if (!schemaFields || !encryptionKey) return row;
  for (const field of Object.keys(schemaFields)) {
    const meta = schemaFields[field]?.meta;
    if (!meta) continue;
    const value = row[field];
    if (value === undefined || value === null || typeof value !== "string") continue;

    if (isEncryptField(meta) || isSecretField(meta)) {
      if (isEncryptField(meta) && value.startsWith("aes256gcm$")) {
        try {
          const fieldKey = await deriveEncryptionKey(encryptionKey, field);
          row[field] = await decryptField(value, fieldKey);
        } catch (err) {
          console.warn(`[@encrypt] failed to decrypt field "${field}": ${err}`);
        }
      }
      continue;
    }
  }
  return row;
}
