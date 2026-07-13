// src/security.ts — Edge/Deno-compatible security transforms using Web Crypto API
//
// Implements @hash (PBKDF2), @encrypt (AES-256-GCM), and @secret annotations.
// Compatible with: Vercel Edge, Cloudflare Workers, Deno, Deno Deploy,
// browsers, Node.js 18+ (via globalThis.crypto, not node:crypto).

export interface FieldMeta {
  hash?: string | boolean;
  "@hash"?: string | boolean;
  encrypt?: boolean;
  "@encrypt"?: boolean;
  secret?: boolean;
  "@secret"?: boolean;
  mask?: string | boolean;
  "@mask"?: string | boolean;
  omitjson?: boolean;
  "@omitjson"?: boolean;
  omitdb?: boolean;
  "@omitdb"?: boolean;
  [key: string]: unknown;
}

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

export function isHashField(meta: Record<string, unknown>): boolean {
  return !!(meta?.hash || meta?.["@hash"]);
}

export function isEncryptField(meta: Record<string, unknown>): boolean {
  return !!(meta?.encrypt || meta?.["@encrypt"]);
}

export function isSecretField(meta: Record<string, unknown>): boolean {
  return !!(meta?.secret || meta?.["@secret"]);
}

// ── Write-time transforms (insert/update) ────────────────────────────────
// Applies @hash, @encrypt, @secret to field values before DB write.

export async function applySecurityOnWrite(
  item: Record<string, unknown>,
  schemaFields: Record<string, unknown> | undefined,
  encryptionKey?: string,
): Promise<Record<string, unknown>> {
  if (!schemaFields) return item;
  for (const field of Object.keys(schemaFields)) {
    const meta = schemaFields[field] as Record<string, unknown> | undefined;
    const metaObj = meta?.meta as FieldMeta | undefined;
    if (!metaObj) continue;
    const value = item[field];
    if (value === undefined || value === null) continue;

    if (isSecretField(metaObj as unknown as Record<string, unknown>)) {
      item[field] = await hashPassword(String(value));
      continue;
    }

    if (isHashField(metaObj as unknown as Record<string, unknown>)) {
      const algo = metaObj.hash ?? metaObj["@hash"];
      if (algo === true || algo === "pbkdf2" || !algo) {
        item[field] = await hashPassword(String(value));
      }
      continue;
    }

    if (isEncryptField(metaObj as unknown as Record<string, unknown>)) {
      if (!encryptionKey) {
        console.warn(`[@encrypt] field "${field}" skipped - no encryptionKey configured`);
        continue;
      }
      const fieldKey = await deriveEncryptionKey(encryptionKey, field);
      item[field] = await encryptField(String(value), fieldKey);
      continue;
    }
  }
  return item;
}

// ── Read-time transforms (get / getAll / query results) ──────────────────
// Decrypts @encrypt fields and attaches .verify() to @hash fields.

export interface HashField {
  toString(): string;
  valueOf(): string;
  [Symbol.toPrimitive](hint: string): string | number;
  verify(plaintext: string): Promise<boolean>;
}

function attachHashVerify(value: string): string {
  const hash = value;
  const result: HashField = {
    toString() { return hash; },
    valueOf() { return hash; },
    [Symbol.toPrimitive](hint: string): string | number { return hint === "number" ? NaN : hash; },
    verify(plaintext: string) { return verifyPassword(plaintext, hash); },
  };
  return result as unknown as string;
}

export async function applySecurityOnRead(
  row: Record<string, unknown>,
  schemaFields: Record<string, unknown> | undefined,
  encryptionKey?: string,
): Promise<Record<string, unknown>> {
  if (!schemaFields) return row;
  for (const field of Object.keys(schemaFields)) {
    const meta = schemaFields[field] as Record<string, unknown> | undefined;
    const metaObj = meta?.meta as FieldMeta | undefined;
    if (!metaObj) continue;
    const value = row[field];
    if (value === undefined || value === null || typeof value !== "string") continue;

    if (isEncryptField(metaObj as unknown as Record<string, unknown>) && encryptionKey && value.startsWith("aes256gcm$")) {
      try {
        const fieldKey = await deriveEncryptionKey(encryptionKey, field);
        row[field] = await decryptField(value, fieldKey);
      } catch (err) {
        console.warn(`[@encrypt] failed to decrypt field "${field}": ${err}`);
      }
    }

    if (isHashField(metaObj as unknown as Record<string, unknown>)) {
      row[field] = attachHashVerify(row[field] as string);
    }
  }
  return row;
}
