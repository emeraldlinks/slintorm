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

// ── Balloon hashing (legacy — verify only) ───────────────────────────────
// See the note above hashBalloon(): removed as a creation path in favour of
// PBKDF2, retained solely so v1.9.x hashes still validate.

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

// ── Balloon hashing (legacy — verify only) ─────────────────────────────────
//
// Balloon was the default in v1.9.x. It has been REMOVED as a way to create
// hashes, for three reasons:
//
//   1. Cost. Measured at 136,432 ms per hash — ~417x slower than PBKDF2 at
//      600k iterations. Because the algorithm is a chain of ~59,000 sequential
//      `await crypto.subtle.digest()` calls, each yielding to the event loop,
//      a single signup or login stalled the whole process for over two minutes.
//      That is an unauthenticated DoS on any route using it.
//   2. It was not the published algorithm. The mix index was derived from
//      H(block[i] || t || i || d) instead of the specification's
//      H(prev_count || count || m || d), and the extract step was a sequential
//      fold rather than a dependency-graph walk — unaudited and
//      non-interoperable.
//   3. It bought nothing. At the default space=65536 the working set is 64 KB,
//      entirely cache-resident, so the memory-hardness it was chosen for is
//      negligible.
//
// Verification is KEPT so that hashes written by v1.9.x still validate. Without
// it, upgrading would lock every existing user out. Re-hash on next successful
// login to migrate them.

async function hashBalloon(
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

  // A malformed or truncated stored hash must return false, never throw. The
  // values come straight from the database, and `new Array(NaN)` throws
  // "Invalid array length" — which would take down a login route on a single
  // corrupt row instead of rejecting the password.
  if (!Number.isFinite(space) || !Number.isFinite(time) || !Number.isFinite(delta)) return false;
  if (space < 3 || time < 1 || delta < 1) return false;

  let salt: Uint8Array, expected: Uint8Array;
  try {
    salt = fromBase64(parts[4]);
    expected = fromBase64(parts[5]);
  } catch {
    return false;
  }
  if (!salt.length || !expected.length) return false;

  let computedHash: Uint8Array;
  try {
    const computed = await hashBalloon(password, salt, space, time, delta);
    computedHash = fromBase64(computed.split("$")[5]!);
  } catch {
    return false;
  }

  let match = expected.length ^ computedHash.length;
  for (let i = 0; i < Math.max(expected.length, computedHash.length); i++) {
    match |= (expected[i] || 0) ^ (computedHash[i] || 0);
  }
  return match === 0;
}

/** @deprecated Balloon hashing has been removed as a creation path. */
export interface LegacyBalloonOptions {
  algo: "balloon";
  space?: number;
  time?: number;
  delta?: number;
}

/**
 * Hash a password for storage.
 *
 * DEFAULT is PBKDF2-SHA256 at 600,000 iterations (~330 ms on Node 22).
 *
 * This was previously Balloon hashing at space=65536/time=3/delta=3, which
 * MEASURED AT 136 SECONDS per hash on the audit host — roughly 417x slower
 * than PBKDF2-600k. Because hashBalloon is a chain of ~59,000 sequential
 * `await crypto.subtle.digest()` calls, each yielding to the event loop, a
 * single signup or login stalled the entire process for over two minutes, and
 * concurrent requests were a trivial unauthenticated DoS.
 *
 * It was also not the published Balloon algorithm: the mix index was derived
 * from H(block[i] || t || i || d) rather than the specification's
 * H(prev_count || count || m || d), and the extract step was a sequential fold
 * rather than a dependency-graph walk — unaudited and non-interoperable. At
 * space=65536 the working set is 64 KB, entirely cache-resident, so it bought
 * negligible memory-hardness while charging two minutes.
 *
 /**
 * Hash a password for storage.
 *
 * PBKDF2-HMAC-SHA256 at 600,000 iterations is the only algorithm (~310 ms).
 *
 * This previously defaulted to a Balloon implementation that measured 136,432
 * ms per hash and was neither the published algorithm nor auditable. Balloon
 * has been removed entirely; existing `balloon$…` hashes still VERIFY (see
 * verifyBalloon) so upgrading does not lock anyone out, but no new Balloon
 * hashes can be written.
 */
export async function hashPassword(password: string, options?: number): Promise<string> {
  // The parameter is typed `number`, but TypeScript erases types at runtime —
  // a JS caller (or legacy code passing `{ algo: "balloon" }`) would otherwise
  // fall through to the default and silently get a different algorithm.
  if (options !== undefined && typeof options !== "number") {
    throw new Error(
      `hashPassword(): expected an iteration count or nothing, got ` +
      `${JSON.stringify(options)}. Balloon hashing has been removed; pass a ` +
      `number of PBKDF2 iterations, or omit the argument for the default ` +
      `(${HASH_ITERATIONS}).`,
    );
  }
  const iters = options ?? HASH_ITERATIONS;
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
/**
 * Encrypt with AES-256-GCM.
 *
 * `aad` (additional authenticated data) binds the ciphertext to a context that
 * is not itself encrypted — typically the table, and where the primary key is
 * known, the row. Without it, AES-GCM only proves the bytes were not tampered
 * with: anyone able to write to the database can copy a valid ciphertext from
 * one row into another and it will decrypt and authenticate cleanly. The tag
 * says "untampered", not "belongs to this record".
 *
 * Formats:
 *   aes256gcm$iv$ct$tag                 legacy, no AAD
 *   aes256gcm$iters$iv$ct$tag           no AAD
 *   aes256gcmv2$iters$iv$ct$tag$aad     AAD bound (new writes)
 *
 * The v2 prefix is explicit so previously-stored data keeps decrypting.
 */
export async function encryptFieldFull(
  plaintext: string,
  masterKey: string,
  fieldName: string,
  iterations?: number,
  aad?: string,
): Promise<string> {
  const iters = iterations ?? HASH_ITERATIONS;
  const key = await deriveEncryptionKey(masterKey, fieldName, iters);
  const nonce = new Uint8Array(ENCRYPT_IV_BYTES);
  crypto.getRandomValues(nonce);
  const aadBytes = aad != null ? encoder.encode(aad) : undefined;

  const params: AesGcmParams = {
    name: "AES-GCM",
    iv: toBufferSource(nonce),
    tagLength: 128,
    ...(aadBytes ? { additionalData: toBufferSource(aadBytes) } : {}),
  };

  const ciphertext = await crypto.subtle.encrypt(
    params as any,
    key,
    toBufferSource(encoder.encode(plaintext)),
  );
  const combined = new Uint8Array(ciphertext);
  const ctLen = combined.length - 16;
  const ct = combined.slice(0, ctLen);
  const tag = combined.slice(ctLen);

  if (aad != null) {
    return `aes256gcmv2$${iters}$${toBase64(nonce)}$${toBase64(ct)}$${toBase64(tag)}$${toBase64(aadBytes!)}`;
  }
  return `aes256gcm$${iters}$${toBase64(nonce)}$${toBase64(ct)}$${toBase64(tag)}`;
}

type AesGcmParams = {
  name: string;
  iv: BufferSource;
  tagLength: number;
  additionalData?: BufferSource;
};

// Combined decrypt: parse iterations from format, derive key, decrypt
export async function decryptFieldFull(
  stored: string,
  masterKey: string,
  fieldName: string,
  aad?: string,
): Promise<string> {
  const parts = stored.split("$");

  if (parts[0] === "aes256gcmv2") {
    if (parts.length !== 6) {
      throw new Error(
        `Expected 'aes256gcmv2$iters$iv$ct$tag$aad' (6 parts), got ${parts.length}`,
      );
    }
    const iters = parseInt(parts[1], 10);
    const key = await deriveEncryptionKey(masterKey, fieldName, iters);
    // Prefer the AAD recorded in the blob; if the caller supplied one, they
    // must match, otherwise the tag check fails (which is the point).
    const aadBytes = aad != null ? encoder.encode(aad) : fromBase64(parts[5]);

    const ct = fromBase64(parts[3]);
    const tag = fromBase64(parts[4]);
    const combined = new Uint8Array(ct.length + tag.length);
    combined.set(ct, 0);
    combined.set(tag, ct.length);

    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toBufferSource(fromBase64(parts[2])),
        tagLength: 128,
        additionalData: toBufferSource(aadBytes),
      } as any,
      key,
      toBufferSource(combined),
    );
    return decoder.decode(plaintext);
  }

  if (parts[0] !== "aes256gcm") {
    throw new Error(
      `Expected 'aes256gcmv2$...' or 'aes256gcm$...' format, got '${parts[0] || "unknown"}'`,
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

const KNOWN_ALGOS = new Set(["pbkdf2", "balloon"]);

function parseAnnotationValue(metaValue: string | boolean): AnnotationOpts {
  if (typeof metaValue !== "string") return {};
  const parenMatch = metaValue.match(/^\(([^)]*)\)$/);
  if (!parenMatch) return {};
  const result: Record<string, string> = {};
  for (const part of parenMatch[1].split(",")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) {
      result[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    } else {
      // A bare positional token. Previously DISCARDED, so the natural
      // `@hash(pbkdf2)` silently fell through to the default — and therefore
      // to the 136-second Balloon path. Treat a known algorithm name as the
      // algorithm; anything else is left alone so it fails visibly below.
      const token = part.trim().toLowerCase();
      if (KNOWN_ALGOS.has(token)) result.algo = token;
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

/** Identity used to bind an @encrypt ciphertext to its record. */
export interface EncryptionContext {
  /** Table the row lives in. Always known. */
  table?: string;
  /** Primary key value, when known at the time of the write. */
  rowId?: string | number | null;
}

/**
 * Build the AAD for a field. Binding the table at minimum means a ciphertext
 * copied from `ssn` in one table cannot be replayed into `ssn` in another.
 * When the primary key is known the binding is per-record.
 *
 * Limitation: on INSERT with an auto-increment key the PK is not yet assigned,
 * so the binding is table-level only. Rows written that way remain relocatable
 * between rows of the same table. Use a UUID/application-assigned PK if you
 * need per-record binding on first write.
 */
function buildAad(field: string, ctx?: EncryptionContext): string | undefined {
  if (!ctx?.table) return undefined;
  const pk = ctx.rowId;
  return pk == null ? `col:${ctx.table}:${field}` : `row:${ctx.table}:${field}:${pk}`;
}

export async function applySecurityOnWrite(
  item: Record<string, unknown>,
  schemaFields: Record<string, unknown> | undefined,
  encryptionKey?: string,
  ctx?: EncryptionContext,
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

      // Resolve the requested algorithm. The DEFAULT is pbkdf2; balloon must
      // be named explicitly. Previously the else-branch meant every unrecognised
      // or absent value fell into balloon.
      const bare =
        typeof algo === "string" ? algo.trim().toLowerCase() : undefined;
      const requested = opts.algo ?? (bare && KNOWN_ALGOS.has(bare) ? bare : "pbkdf2");

      if (requested === "balloon") {
        throw new Error(
          `[@hash] field "${field}": Balloon hashing has been removed.\n\n` +
          `It measured 136 seconds per hash (~417x slower than PBKDF2 at 600k ` +
          `iterations), making any signup or login route an unauthenticated ` +
          `denial-of-service vector. It was also not the published Balloon ` +
          `algorithm, so it was unaudited and non-interoperable, and at the ` +
          `default space=65536 its 64 KB working set was entirely cache-resident ` +
          `— the memory-hardness it was chosen for was negligible.\n\n` +
          `New passwords are hashed with PBKDF2-HMAC-SHA256 at 600,000 ` +
          `iterations (~310 ms). Drop the argument:\n` +
          `  // @hash                    -> PBKDF2 at 600k\n` +
          `  // @hash(pbkdf2,iterations=N) -> a different cost\n\n` +
          `Existing \`balloon$\` hashes still VERIFY, so nobody is locked out. ` +
          `Re-hash on next successful login to migrate them:\n` +
          `  if (await user.password.verify(input)) {\n` +
          `    await user.update({ password: input });   // writes pbkdf2 now\n` +
          `  }`,
        );
      } else if (requested === "pbkdf2") {
        item[field] = await hashPassword(String(value), opts.iterations);
      } else {
        throw new Error(
          `[@hash] field "${field}": unknown algorithm ${JSON.stringify(requested)}. ` +
          `Use @hash, @hash(pbkdf2), @hash(pbkdf2,iterations=600000), or @hash(balloon).`,
        );
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
      item[field] = await encryptFieldFull(
        String(value), encryptionKey, field, opts.iterations, buildAad(field, ctx),
      );
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

function attachEncryptDecrypt(
  value: string,
  encryptionKey: string,
  fieldName: string,
  aad?: string,
): string {
  const raw = value;
  const result: EncryptedField = {
    toString() { return raw; },
    valueOf() { return raw; },
    [Symbol.toPrimitive](hint: string): string | number { return hint === "number" ? NaN : raw; },
    async decrypt(): Promise<string> {
      return decryptFieldFull(raw, encryptionKey, fieldName, aad);
    },
  };
  return result as unknown as string;
}

export async function applySecurityOnRead(
  row: Record<string, unknown>,
  schemaFields: Record<string, unknown> | undefined,
  encryptionKey?: string,
  ctx?: EncryptionContext,
): Promise<Record<string, unknown>> {
  if (!schemaFields) return row;
  for (const field of Object.keys(schemaFields)) {
    const meta = schemaFields[field] as Record<string, unknown> | undefined;
    const metaObj = meta?.meta as FieldMeta | undefined;
    if (!metaObj) continue;
    const value = row[field];
    if (value === undefined || value === null || typeof value !== "string") continue;

    if (isEncryptField(metaObj as unknown as Record<string, unknown>) && encryptionKey && /^aes256gcm(v2)?\$/.test(value)) {
      const metaVal = metaObj?.encrypt ?? metaObj?.["@encrypt"];
      const isAuto = typeof metaVal === "string" && (metaVal === "auto" || metaVal.includes("decrypt=auto"));
      const aad = buildAad(field, ctx);
      if (isAuto) {
        try {
          row[field] = await decryptFieldFull(value, encryptionKey, field, aad);
        } catch (err) {
          console.warn(`[@encrypt] failed to decrypt field "${field}": ${err}`);
        }
      } else {
        row[field] = attachEncryptDecrypt(value, encryptionKey, field, aad);
      }
    }

    if (isHashField(metaObj as unknown as Record<string, unknown>)) {
      row[field] = attachHashVerify(row[field] as string);
    }
  }
  return row;
}
