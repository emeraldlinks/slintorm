# Security Annotations

SlintORM provides three field-level security annotations: `@hash`, `@encrypt`, and `@secret`. They are implemented using the Web Crypto API and work in Node.js 18+, Vercel Edge, Cloudflare Workers, Deno, and browsers.

---

## @hash — password hashing

### Syntax

```typescript
// @hash
password?: string;
```

### Behavior

- On **write**: the value is hashed using PBKDF2 (SHA-256, 100k iterations) with a random 16-byte salt. The stored format is `pbkdf2$<base64-salt>$<base64-hash>`.
- On **read**: the raw hash string is returned, augmented with a `.verify()` method for comparing against the original plaintext.

```typescript
const user = await Users.get({ id: 1 });
const ok = await user.password.verify("correct-horse-battery-staple");
// true if password matches, false otherwise
```

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
