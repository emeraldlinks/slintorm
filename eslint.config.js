import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // dist and node_modules are build output / dependencies.
    ignores: ["dist/**", "node_modules/**", "src/schema/**", "src/bin/cli.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: { project: false, ecmaVersion: "latest", sourceType: "module" },
    },
    rules: {
      // ── Correctness: these catch real defects. Kept as errors. ──────────────
      "no-fallthrough": "error",
      "no-self-compare": "error",
      "no-unsafe-optional-chaining": "error",
      "no-unmodified-loop-condition": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-dupe-class-members": "error",
      "no-duplicate-case": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-case-declarations": "error",
      "no-useless-escape": "error",
      "no-async-promise-executor": "error",
      "no-compare-neg-zero": "error",
      "no-cond-assign": "error",
      "no-const-assign": "error",
      "no-debugger": "error",
      "no-ex-assign": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-setter-return": "error",
      "no-unreachable": "error",
      "valid-typeof": "error",
      "use-isnan": "error",

      // ── Pre-existing patterns in this codebase. Warnings, not errors. ───────
      // `try { ... } catch {}` is used deliberately for best-effort paths:
      // tolerating a missing column on DROP, falling back to the raw string
      // when JSON.parse fails. Forbidding them outright would add noise without
      // finding bugs.
      "no-empty": "warn",
      "prefer-const": "warn",
      // Flags `let x = <init>` where every branch reassigns it. The
      // initializers here are defensive (they cover "no branch taken"), so
      // this is noise rather than a finding.
      "no-useless-assignment": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      // `meta?.foo!` is pervasive in the schema-metadata reads; flagging it is
      // useful but it is not a new finding.
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "@typescript-eslint/no-this-alias": "warn",

      // ── Hygiene ────────────────────────────────────────────────────────────
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-explicit-any": "off", // `any` at driver boundaries
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-console": "off",
    },
  },
  {
    // Tests may use non-null assertions and looser typing.
    files: ["src/**/*.test.ts", "src/bin/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-console": "off",
    },
  },
  {
    files: ["src/**/cli.ts"],
    rules: { "no-console": "off" },
  },
);