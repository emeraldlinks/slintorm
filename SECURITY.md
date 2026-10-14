# Security Annotations

SlintORM provides three field-level security annotations: `@hash`, `@encrypt`, and `@secret`. They are implemented using the Web Crypto API and work in Node.js 18+, Vercel Edge, Cloudflare Workers, Deno, and browsers.

---

## Row-level security

### The design gap, stated honestly

SlintORM propagates the tenant to Postgres and then lets the **database** decide
what a session may see. That is the right shape — but note what is enforced
where:

- **Enforced by Postgres**: the policy itself. RLS rules are correct, auditable,
  and applied per statement regardless of what the application does.
- **Enforced by SlintORM**: that the right `rls.*` setting reaches the
  connection. This is application state, so it carries application risk.

That split is why the RLS bugs this project had were all on the SlintORM side of
the line, and none on the Postgres side.

What is now handled:

- Context is per-request via `AsyncLocalStorage`, so concurrent requests cannot
  overwrite each other's tenant (`orm.runWithAuthContext()` is the safe form).
- The session variable is **reset** when a context key is dropped. Previously it
  survived, so a request with no context inherited the previous request's
  tenant — a fail-open leak.
- `set_config` and the query it scopes are serialised, so context cannot
  interleave between two requests.
- `rls: true` **throws** if it cannot actually be applied — with a custom `exec`,
  or on a non-Postgres driver — instead of reporting itself active while doing
  nothing.
- `poolSize > 1` **throws** when combined with `rls: true`. A pool can hand a
  query a connection that never received the tenant context.

### Recommendation

For multi-tenant applications, prefer this shape:

```ts
// 1. Policies live in Postgres and are the real control.
//    CREATE POLICY tenant_isolation ON orders
//      USING (tenant_id = current_setting('rls.tenant_id', true));

// 2. The application DB user must NOT have BYPASSRLS. Superusers bypass RLS,
//    so use a dedicated role — never the owner.

// 3. Set identity from a VERIFIED session, never from a raw request header.
orm.runWithAuthContext({ tenant_id: session.tenantId }, async () => {
  return db.Order.query().get();
});
```

Always test that isolation actually works by attempting to read another
tenant's row and asserting it returns nothing. A policy that silently matches
everything looks identical to one that works.

---

## Reporting a vulnerability

Do not open a public issue for a security bug. Email the maintainer directly
(see the repository's `package.json` `author` / `bugs` fields). Please include a
reproduction, the affected version, and the impact.

---

## @hash — password hashing

### Syntax

```typescript
// @hash
password?: string;
```

### Behavior

- On **write**: the value is hashed with **PBKDF2-HMAC-SHA256 at 600,000
  iterations** and a random 16-byte salt. Stored format:
  `pbkdf2$<iterations>$<base64-salt>$<base64-hash>`.
- On **read**: the raw hash string is returned, augmented with a `.verify()` method for comparing against the original plaintext.

```typescript
const user = await Users.get({ id: 1 });
const ok = await user.password.verify("correct-horse-battery-staple");
// true if password matches, false otherwise
```

> **On iteration count and algorithm.** Earlier releases documented "100k
> iterations" and a 3-part storage format; neither matched the implementation.
> Both are now stated accurately above.
>
> An earlier default was a memory-hard "Balloon" hash that took **136 seconds**
> per operation — roughly 417× slower than PBKDF2 at 600k, which made any
> signup or login route an unauthenticated denial-of-service vector. It was also
> a homegrown implementation rather than the published algorithm, so it was not
> interoperable or auditable. **It has been removed.** PBKDF2 at 600k is the
> only algorithm. Legacy `balloon$…` hashes still verify correctly, so existing
> rows keep working — re-hash them on next successful login.

### Generated type

When using the generated schema types (via `ModelMap` or `orm.DB.*`), the field type is augmented:

```typescript
password?: string & { verify(plaintext: string): Promise<boolean> };
```

This means `.verify()` is only available on `@hash` fields. Non-hash `string` fields like `name` and `email` remain plain `string`.

### Usage example

```typescript
// Insert with raw password — hashed automatically
await Users.insert({ name: "Test", password: "my-password" });

// Later, verify against the stored hash
const user = await Users.get({ name: "Test" });
if (user?.password && await user.password.verify("my-password")) {
  // password matches
}
```

### How it works

```typescript
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", password, "PBKDF2", ...);
const hash = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
  key, 256
);
// stored as: pbkdf2$<salt>$<hash>
```

Verification extracts the salt from the stored value and re-derives the hash, using a **timing-safe comparison** to prevent timing attacks.

---

## @encrypt — field encryption

### Syntax

```typescript
// Default: exposes raw encrypted value with .decrypt()
// @encrypt
encrypted?: string;

// Auto-decrypt on read (transparent, returns plain string)
// @encrypt:(decrypt=auto)
autoDecrypted?: string;
```

### Behavior

| Variant | Read value | Access raw ciphertext |
|---|---|---|
| `@encrypt` | Raw `aes256gcm$...` string with `.decrypt()` | `toString()` returns the raw value |
| `@encrypt:(decrypt=auto)` | Plain `string` (auto-decrypted) | Not available |

### Configuration

`@encrypt` requires an `encryptionKey` (min 32 characters) passed to the ORM constructor:

```typescript
const orm = new ORMManager({
  encryptionKey: "your-32-char-min-encryption-key-here",
});
```

### Default mode — raw value with `.decrypt()`

```typescript
const key = "some-32-char-minimum-encryption-key!";

const orm = new ORMManager({ encryptionKey: key });
const Users = await orm.defineModel<User>("users", "User");

// Insert — auto-encrypted before storage
await Users.insert({ name: "Test", encrypted: "sensitive-data" });

// Read — get the raw aes256gcm$... value
const user = await Users.get({ name: "Test" });
console.log(user.encrypted);
// → "aes256gcm$iv$ciphertext$tag"  (raw encrypted value)

// Decrypt on demand
const plain = await user.encrypted.decrypt();
// → "sensitive-data"
```

### Auto-decrypt mode

```typescript
// @encrypt:(decrypt=auto)
autoDecrypted?: string;

const user = await Users.get({ name: "Test" });
console.log(user.autoDecrypted);
// → "sensitive-data"  (automatically decrypted)
```

### Generated type

Default `@encrypt`:

```typescript
encrypted?: string & { decrypt(): Promise<string> };
```

`@encrypt:(decrypt=auto)`:

```typescript
autoDecrypted?: string;
```

### How it works

1. **Key derivation**: A per-field AES-256 key is derived from the master `encryptionKey` using PBKDF2 with the field name as salt:

   ```
   fieldKey = PBKDF2(masterKey, fieldName, 100k iterations) → AES-256-GCM key
   ```

2. **Encryption** (on write):

   ```
   iv = random 12 bytes
   ciphertext = AES-256-GCM-encrypt(plaintext, fieldKey, iv)
   stored = aes256gcm$base64(iv)$base64(ciphertext)$base64(authTag)
   ```

3. **Decryption** (on `.decrypt()` or auto-decrypt):

   ```
   iv, ciphertext, tag = parse(stored)
   plaintext = AES-256-GCM-decrypt(ciphertext, fieldKey, iv, tag)
   ```

### Security notes

- Each field gets its own derived key (different salt = different key)
- AES-256-GCM provides authenticated encryption (tampering is detected on read)
- If no `encryptionKey` is configured, `@encrypt` fields are skipped with a warning
- The `encryptionKey` should be stored in environment variables, not in code

---

## @secret — @hash + @omitjson combined

### Syntax

```typescript
// @secret
secretNote?: string;
```

### Behavior

`@secret` is a shorthand for `@hash` + `@omitjson`:
- **On write**: the value is PBKDF2-hashed (same as `@hash`)
- **On read**: the hash is returned with `.verify()` (same as `@hash`)
- **JSON output**: the field is stripped from `JSON.stringify()` / `.toJSON()` (same as `@omitjson`)

```typescript
const user = await Users.get({ id: 1 });
await user.secretNote.verify("my-secret");
// true if matches

JSON.stringify(user); // secretNote not included
```

---

## Summary

| Annotation | Write | Read | JSON |
|---|---|---|---|
| `@hash` | PBKDF2 hash | Hash with `.verify()` | Included |
| `@encrypt` | AES-256-GCM encrypt | Raw ciphertext with `.decrypt()` | Included |
| `@encrypt:(decrypt=auto)` | AES-256-GCM encrypt | Auto-decrypted plain string | Included |
| `@secret` | PBKDF2 hash | Hash with `.verify()` | Stripped (`@omitjson`) |

## Type safety

When using the generated schema types (via `ModelMap` or `orm.DB.*`), the TypeScript interfaces carry `.verify()` on `@hash` fields and `.decrypt()` on `@encrypt` fields — no imports, no casts, no extra types needed.

```typescript
import { schema } from "./schema/generated";
import ORMManager from "slintorm";

const orm = new ORMManager({
  schema,
  encryptionKey: process.env.ENCRYPTION_KEY,
});

// orm.DB.User uses the generated User interface (with verify + decrypt)
const user = await orm.DB.User.get({ id: 1 });
await user.password.verify("pw");      // type-safe, only on @hash
await user.encrypted.decrypt();          // type-safe, only on @encrypt
```
