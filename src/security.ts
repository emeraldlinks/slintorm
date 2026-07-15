// src/security.ts — Edge/Deno-compatible security transforms using Web Crypto API
//
// Implements @hash (Balloon hashing, PBKDF2), @encrypt (AES-256-GCM), and
// @secret annotations.  Compatible with: Vercel Edge, Cloudflare Workers,
// Deno, Deno Deploy, browsers, Node.js 18+ (via globalThis.crypto).

export interface FieldMeta {
  hash?: string | boolean;
  "@hash"?: string | boolean;
  encrypt?: string | boolean;
  "@encrypt"?: string | boolean;
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

const HASH_ITERATIONS = 600_000;
const HASH_SALT_BYTES = 16;
const HASH_KEY_LENGTH = 256;

// ── Balloon Hashing (default) ──────────────────────────────────────────
// Memory-hard hashing using SHA-256 as the inner hash (Web Crypto API).
// Format: balloon$space$time$delta$salt$hash
const BALLOON_DELTA = 3;

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLen = 0;
  for (const arr of arrays) totalLen += arr.length;
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) { out.set(arr, offset); offset += arr.length; }
  return out;
}

function toUint32LE(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = n & 0xff;
  buf[1] = (n >> 8) & 0xff;
  buf[2] = (n >> 16) & 0xff;
  buf[3] = (n >> 24) & 0xff;
  return buf;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", toBufferSource(data));
  return new Uint8Array(hash);
}

export async function hashBalloon(
  password: string,
  salt: Uint8Array,
  space: number,
  time: number,
  delta: number,
): Promise<string> {
  const sCost = Math.max(3, Math.floor(space / 32));
  const pwBytes = encoder.encode(password);
  const block = new Array<Uint8Array>(sCost);
  // Collapse step: fill buffer
  block[0] = await sha256(concatBytes(pwBytes, salt, toUint32LE(0)));
  for (let i = 1; i < sCost; i++) {
    block[i] = await sha256(concatBytes(block[i - 1], toUint32LE(i)));
  }
  // Mix step (deterministic — other index derived from H(block[i] || t || i))
  for (let t = 0; t < time; t++) {
    for (let i = 0; i < sCost; i++) {
      const prev = i === 0 ? block[sCost - 1] : block[i - 1];
      block[i] = await sha256(xorBytes(block[i], prev));
      for (let d = 0; d < delta; d++) {
        const mixInput = concatBytes(block[i], toUint32LE(t), toUint32LE(i), toUint32LE(d));
        const mixHash = await sha256(mixInput);
        const idxOther = new DataView(mixHash.buffer, mixHash.byteOffset, 4).getUint32(0, true) % sCost;
        block[i] = await sha256(xorBytes(block[i], await sha256(concatBytes(block[i], block[idxOther], toUint32LE(i), toUint32LE(d)))));
      }
    }
  }
  // Extract step
  let result = block[0];
  for (let i = 1; i < sCost; i++) {
    result = await sha256(xorBytes(result, block[i]));
  }
  return `balloon$${space}$${time}$${delta}$${toBase64(salt)}$${toBase64(result)}`;
}

async function verifyBalloon(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "balloon") return false;
  const space = parseInt(parts[1], 10);
  const time = parseInt(parts[2], 10);
  const delta = parseInt(parts[3], 10);
  const salt = fromBase64(parts[4]);
  const expected = fromBase64(parts[5]);
  const computed = await hashBalloon(password, salt, space, time, delta);
  const computedParts = computed.split("$");
  const computedHash = fromBase64(computedParts[5]);
  let match = expected.length ^ computedHash.length;
  for (let i = 0; i < Math.max(expected.length, computedHash.length); i++) {
    match |= (expected[i] || 0) ^ (computedHash[i] || 0);
  }
  return match === 0;
}

interface BalloonOptions {
  algo: "balloon";
  space?: number;
  time?: number;
  delta?: number;
}

export async function hashPassword(password: string, options?: number | BalloonOptions): Promise<string> {
  if (options === undefined || (typeof options === "object" && options.algo === "balloon")) {
    const salt = new Uint8Array(HASH_SALT_BYTES);
    crypto.getRandomValues(salt);
    const opts = options as BalloonOptions | undefined;
    return hashBalloon(password, salt, opts?.space ?? 65536, opts?.time ?? 3, opts?.delta ?? BALLOON_DELTA);
  }
  const iters = typeof options === "number" ? options : HASH_ITERATIONS;
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
    { name: "PBKDF2", salt: toBufferSource(salt), iterations: iters, hash: "SHA-256" },
    keyMaterial,
    HASH_KEY_LENGTH,
  );
  return `pbkdf2$${iters}$${toBase64(salt)}$${toBase64(new Uint8Array(hash))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const prefix = stored.split("$")[0];
  if (prefix === "balloon") {
    return verifyBalloon(password, stored);
  }
  if (prefix !== "pbkdf2") {
    throw new Error(
      `Expected 'balloon$...' or 'pbkdf2$...' format, got '${prefix || "unknown"}'`,
    );
  }
  const parts = stored.split("$");
  const iters = parts.length === 4 ? parseInt(parts[1], 10) : HASH_ITERATIONS;
  const saltIdx = parts.length === 4 ? 2 : 1;
  const hashIdx = parts.length === 4 ? 3 : 2;
  if (parts.length !== 3 && parts.length !== 4) {
    throw new Error(
      `Expected 'pbkdf2$iterations$salt$hash' (new) or 'pbkdf2$salt$hash' (legacy), ` +
      `got ${parts.length} parts`,
    );
  }
  const salt = fromBase64(parts[saltIdx]);
  const expectedHash = fromBase64(parts[hashIdx]);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toBufferSource(encoder.encode(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: toBufferSource(salt), iterations: iters, hash: "SHA-256" },
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

const KEY_CACHE = new Map<string, CryptoKey>();

export async function deriveEncryptionKey(
  masterKey: string,
  fieldSalt: string,
  iterations?: number,
): Promise<CryptoKey> {
  const iters = iterations ?? HASH_ITERATIONS;
  const cacheKey = `${masterKey}:${fieldSalt}:${iters}`;
  const cached = KEY_CACHE.get(cacheKey);
  if (cached) return cached;
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
      iterations: iters,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  KEY_CACHE.set(cacheKey, key);
  return key;
}

export function clearKeyCache(): void {
  KEY_CACHE.clear();
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
  if (parts[0] !== "aes256gcm") {
    throw new Error(
      `Expected 'aes256gcm$iv$ct$tag' format, got '${parts[0] || "unknown"}'`,
    );
  }
  const ivIdx = parts.length === 5 ? 2 : 1;
  const ctIdx = parts.length === 5 ? 3 : 2;
  const tagIdx = parts.length === 5 ? 4 : 3;
  if (parts.length !== 4 && parts.length !== 5) {
    throw new Error(
      `Expected 'aes256gcm$iv$ct$tag' (legacy) or 'aes256gcm$iters$iv$ct$tag' (new), ` +
      `got ${parts.length} parts`,
    );
  }
  const iv = fromBase64(parts[ivIdx]);
  const ct = fromBase64(parts[ctIdx]);
  const tag = fromBase64(parts[tagIdx]);
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

// Combined encrypt: derive key + encrypt, storing iterations in format
export async function encryptFieldFull(
  plaintext: string,
  masterKey: string,
  fieldName: string,
  iterations?: number,
): Promise<string> {
  const iters = iterations ?? HASH_ITERATIONS;
  const key = await deriveEncryptionKey(masterKey, fieldName, iters);
  const nonce = new Uint8Array(ENCRYPT_IV_BYTES);
  crypto.getRandomValues(nonce);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBufferSource(nonce), tagLength: 128 },
    key,
    toBufferSource(encoder.encode(plaintext)),
  );
  const combined = new Uint8Array(ciphertext);
  const ctLen = combined.length - 16;
  const ct = combined.slice(0, ctLen);
  const tag = combined.slice(ctLen);
  return `aes256gcm$${iters}$${toBase64(nonce)}$${toBase64(ct)}$${toBase64(tag)}`;
}

// Combined decrypt: parse iterations from format, derive key, decrypt
export async function decryptFieldFull(
  stored: string,
  masterKey: string,
  fieldName: string,
): Promise<string> {
  const parts = stored.split("$");
  if (parts[0] !== "aes256gcm") {
    throw new Error(
      `Expected 'aes256gcm$iters$iv$ct$tag' format, got '${parts[0] || "unknown"}'`,
    );
  }
  const iters = parts.length === 5 ? parseInt(parts[1], 10) : HASH_ITERATIONS;
  const ivIdx = parts.length === 5 ? 2 : 1;
  const ctIdx = parts.length === 5 ? 3 : 2;
  const tagIdx = parts.length === 5 ? 4 : 3;
  if (parts.length !== 4 && parts.length !== 5) {
    throw new Error(
      `Expected 'aes256gcm$iters$iv$ct$tag' (new) or 'aes256gcm$iv$ct$tag' (legacy), ` +
      `got ${parts.length} parts`,
    );
  }
  const key = await deriveEncryptionKey(masterKey, fieldName, iters);
  const iv = fromBase64(parts[ivIdx]);
  const ct = fromBase64(parts[ctIdx]);
  const tag = fromBase64(parts[tagIdx]);
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

// Extract iterations from an encrypt-format string
export function parseEncryptIterations(stored: string): number {
  const parts = stored.split("$");
  if (parts[0] !== "aes256gcm") return HASH_ITERATIONS;
  return parts.length === 5 ? parseInt(parts[1], 10) : HASH_ITERATIONS;
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

interface AnnotationOpts {
  iterations?: number;
  algo?: string;
  space?: number;
  time?: number;
  delta?: number;
}

function parseAnnotationValue(metaValue: string | boolean): AnnotationOpts {
  if (typeof metaValue !== "string") return {};
  const parenMatch = metaValue.match(/^\(([^)]*)\)$/);
  if (!parenMatch) return {};
  const result: Record<string, string> = {};
  for (const part of parenMatch[1].split(",")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) {
      result[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  }
  return {
    ...(result.iterations ? { iterations: parseInt(result.iterations, 10) } : {}),
    ...(result.algo ? { algo: result.algo } : {}),
    ...(result.space ? { space: parseInt(result.space, 10) } : {}),
    ...(result.time ? { time: parseInt(result.time, 10) } : {}),
    ...(result.delta ? { delta: parseInt(result.delta, 10) } : {}),
  };
}

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
      const opts = parseAnnotationValue(algo as string);
      if (algo === "pbkdf2" || opts.algo === "pbkdf2") {
        item[field] = await hashPassword(String(value), opts.iterations);
      } else {
        item[field] = await hashPassword(String(value), { algo: "balloon", space: opts.space, time: opts.time, delta: opts.delta });
      }
      continue;
    }

    if (isEncryptField(metaObj as unknown as Record<string, unknown>)) {
      if (!encryptionKey) {
        throw new Error(
          `[@encrypt] field "${field}" requires encryptionKey in ORMManager config. ` +
          `Set encryptionKey (min 32 chars) or remove the @encrypt annotation.`,
        );
      }
      const metaVal = metaObj.encrypt ?? metaObj["@encrypt"];
      const opts = parseAnnotationValue(metaVal as string | boolean);
      item[field] = await encryptFieldFull(String(value), encryptionKey, field, opts.iterations);
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

export interface EncryptedField {
  toString(): string;
  valueOf(): string;
  [Symbol.toPrimitive](hint: string): string | number;
  decrypt(): Promise<string>;
}

function attachEncryptDecrypt(value: string, encryptionKey: string, fieldName: string): string {
  const raw = value;
  const result: EncryptedField = {
    toString() { return raw; },
    valueOf() { return raw; },
    [Symbol.toPrimitive](hint: string): string | number { return hint === "number" ? NaN : raw; },
    async decrypt(): Promise<string> {
      return decryptFieldFull(raw, encryptionKey, fieldName);
    },
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
      const metaVal = metaObj?.encrypt ?? metaObj?.["@encrypt"];
      const isAuto = typeof metaVal === "string" && (metaVal === "auto" || metaVal.includes("decrypt=auto"));
      if (isAuto) {
        try {
          row[field] = await decryptFieldFull(value, encryptionKey, field);
        } catch (err) {
          console.warn(`[@encrypt] failed to decrypt field "${field}": ${err}`);
        }
      } else {
        row[field] = attachEncryptDecrypt(value, encryptionKey, field);
      }
    }

    if (isHashField(metaObj as unknown as Record<string, unknown>)) {
      row[field] = attachHashVerify(row[field] as string);
    }
  }
  return row;
}
