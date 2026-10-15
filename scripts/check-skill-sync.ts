/**
 * Fails if any INSTALLED copy of the slintorm skill differs from this repo.
 *
 * Why this exists: the 8+ agent copies under $HOME are plain copies, not links,
 * so editing the repo (the source of truth) leaves them stale with nothing to
 * notice. That happened once already. This makes it loud.
 *
 * Deliberately NOT a symlink strategy: `install.sh` fetches from
 * raw.githubusercontent.com, so for anyone but this machine there is no local
 * directory to link to.
 *
 *   npx tsx scripts/check-skill-sync.ts          # report + exit 1 if stale
 *   npx tsx scripts/check-skill-sync.ts --fix   # re-run install.sh --force
 *
 * Exits 0 with a skip when no copy is installed, so it is safe in CI.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const REPO_SKILL = ".opencode/skills/slintorm";

const LOCATIONS = [
  ["Claude Code",   path.join(os.homedir(), ".claude/skills")],
  ["OpenCode",      path.join(os.homedir(), ".config/opencode/skills")],
  ["Antigravity",   path.join(os.homedir(), ".gemini/antigravity/skills")],
  ["Pi",            path.join(os.homedir(), ".pi/skills")],
  ["Copilot CLI",   path.join(os.homedir(), ".copilot/skills")],
  ["Kilo",          path.join(os.homedir(), ".kilo/skills")],
  ["Qwen",          path.join(os.homedir(), ".qwen/skills")],
  ["Codex",         path.join(os.homedir(), ".codex/skills")],
];

/** install.sh is installed alongside the skill but has no repo counterpart in
 *  the skill dir — compare only files the repo actually owns. */
const IGNORE = new Set(["install.sh"]);

function repoFiles(dir: string, base = ""): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) for (const [k, v] of repoFiles(dir, rel)) out.set(k, v);
    else if (!IGNORE.has(e.name)) out.set(rel, fs.readFileSync(path.join(dir, rel)));
  }
  return out;
}

const installed = LOCATIONS.filter(([, base]) => {
  const p = path.join(base, "slintorm");
  return fs.existsSync(p);
});

if (installed.length === 0) {
  console.log("\n  No installed copy of the slintorm skill found — nothing to check.\n");
  process.exit(0);
}

if (process.argv.includes("--fix")) {
  console.log("\n  Re-running the installer with --force …\n");
  execFileSync("sh", ["install.sh", "--force"], { stdio: "inherit" });
}

const want = repoFiles(REPO_SKILL);
console.log(`\n  Comparing ${installed.length} installed copy/copies against ${REPO_SKILL}\n`);

let stale = 0;
for (const [name, base] of installed) {
  const dest = path.join(base, "slintorm");
  const have = fs.lstatSync(dest).isSymbolicLink()
    ? repoFiles(fs.realpathSync(dest))
    : repoFiles(dest);

  const diffs: string[] = [];
  for (const [rel, buf] of want) {
    if (!have.has(rel)) diffs.push(`missing  ${rel}`);
    else if (!have.get(rel)!.equals(buf)) diffs.push(`changed  ${rel}`);
  }
  for (const rel of have.keys()) if (!want.has(rel)) diffs.push(`extra    ${rel}`);

  if (diffs.length === 0) {
    console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(13)} ${dest}`);
  } else {
    stale++;
    console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(13)} ${dest}`);
    for (const d of diffs) console.log(`      ${d}`);
  }
}

if (stale) {
  console.log(`\n  \x1b[31m${stale} stale copy/copies.\x1b[0m Fix with:`);
  console.log(`      npx tsx scripts/check-skill-sync.ts --fix\n`);
  process.exit(1);
}
console.log(`\n  \x1b[32mAll installed copies match the repo.\x1b[0m\n`);