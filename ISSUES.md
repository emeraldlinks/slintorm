# SlintORM — Known Issues

## ESM serverless bundlers rewrite CJS `require("events")` (fixed in 1.10.1)

**Symptom:** On Vercel/Netlify/etc. serverless functions, the Postgres/MySQL
driver load fails with:

```
Failed to connect to Postgres.
The pg driver IS installed — this is not a missing-package problem.
...
Fix: keep pg (or its package) external in the bundler — e.g. esbuild
`packages: "external"`, or add it to `serverExternalPackages`.
...
Original error: Dynamic require of "events" is not supported
```

**Root cause:** Bundlers that inline a CJS driver into an ESM handler rewrite
the driver's internal `require("events")` into esbuild's throwing `__require`
shim. The package is installed and the host has TCP sockets; the bundler is
the problem.

**Fix (1.10.1):** SlintORM now retries driver loading through
`createRequire` anchored at the deployment root when the bundler shim throws,
and reports the cause as a bundling problem instead of an edge-runtime TCP
limitation.

**Workaround (if still affected):** Keep the driver external so Node loads it
from `node_modules`:
- esbuild: `packages: "external"`
- Frameworks with a `serverExternalPackages` option: add `pg`/`mysql2`

See `SERVERLESS.md` for the recommended PostgREST edge path, which avoids
node-postgres entirely.
