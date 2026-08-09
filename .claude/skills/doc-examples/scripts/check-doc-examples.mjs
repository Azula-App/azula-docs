#!/usr/bin/env node
/**
 * Static checks for azula.app's documented shell.
 *
 * Execution (examples/run.sh) can only cover commands that bind no iroh
 * endpoint, which leaves the headline flows — `azula mcp`, `message send`,
 * `watch` — unrunnable. These three layers cover what execution cannot:
 *
 *   L1 sync    Every fenced block tagged `<!-- example: <id> -->` is
 *              byte-identical to examples/<id>.sh's published region — the
 *              text that actually ran. Every untagged `sh` block must be
 *              recorded in examples/illustrative.json with a reason, so an
 *              unverified block cannot appear silently.
 *
 *   L2 lint    Every `sh` block parses under `sh -n`, passes ShellCheck when
 *              it is installed, and survives an unassigned-variable scan that
 *              does not depend on ShellCheck being present.
 *
 *   L3 surface Every `azula …` invocation anywhere in the content — fenced
 *              block, inline span, or the command table — names a subcommand,
 *              flag and flag value the binary reports in its own `-h` output.
 *              This is the layer that catches CLI drift, and it is offline:
 *              clap binds nothing.
 *
 * Usage:
 *   check-doc-examples.mjs [--site <azula-site>] [--bin <azula>] [--require-binary]
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};

const HERE = resolve(new URL(".", import.meta.url).pathname);
const SITE = resolve(
  flag("--site") ??
    [
      join(HERE, "../../../../../azula-site"), // azula-docs/.claude/skills/doc-examples/scripts → parent checkout
      join(process.cwd(), "azula-site"),
      process.cwd(),
    ].find((p) => existsSync(join(p, "src/content"))) ??
    process.cwd(),
);
const CONTENT = join(SITE, "src/content");
const EXAMPLES = join(SITE, "examples");
const REQUIRE_BINARY = argv.includes("--require-binary");

const AZULA =
  flag("--bin") ??
  process.env.AZULA_BIN ??
  [
    join(SITE, "../azula-cli/target/release/azula"),
    join(SITE, "../azula-cli/target/debug/azula"),
    join(SITE, "../../azula-cli/target/release/azula"),
  ].find((p) => existsSync(p)) ??
  null;

const failures = [];
const fail = (where, message) => failures.push({ where, message });

// ------------------------------------------------------------------ sources

/** Every markdown page under src/content, as { rel, source }. */
function pages(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...pages(join(dir, entry.name), rel));
    else if (entry.name.endsWith(".md")) out.push({ rel, source: readFileSync(join(dir, entry.name), "utf8") });
  }
  return out;
}

const TAG = /^<!--\s*example:\s*([a-z0-9-]+)\s*-->$/;

/**
 * Fenced blocks, with the tag carried by the nearest preceding non-blank line.
 * An HTML comment is used rather than fence meta because `stripComments` in
 * src/lib/llms.ts removes HTML comments from the `.md` twins and
 * /llms-full.txt — so the tag never reaches a reader — whereas fence meta
 * would be served verbatim as part of the raw source the twin contract
 * requires.
 */
function parseBlocks(rel, source) {
  const lines = source.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^```(\w*)\s*$/.exec(lines[i]);
    if (!open) continue;
    const start = i;
    let end = i + 1;
    while (end < lines.length && !/^```\s*$/.test(lines[end])) end++;
    const body = lines.slice(start + 1, end).join("\n");

    let tag = null;
    for (let j = start - 1; j >= 0; j--) {
      if (lines[j].trim() === "") continue;
      tag = TAG.exec(lines[j].trim())?.[1] ?? null;
      break;
    }

    blocks.push({
      file: rel,
      line: start + 1, // 1-indexed line of the opening fence
      lang: open[1],
      body,
      tag,
      sha: createHash("sha256").update(body).digest("hex").slice(0, 16),
    });
    i = end;
  }
  return blocks;
}

const allBlocks = pages(CONTENT).flatMap((p) => parseBlocks(p.rel, p.source));
const shBlocks = allBlocks.filter((b) => b.lang === "sh");

// ------------------------------------------------------- L1: sync + allowlist

/**
 * An example's published region: the body of its `run_doc_region <<'EXAMPLE'`
 * heredoc. examples/_lib.sh reads the same text from stdin and executes it, so
 * this is literally what ran — not a copy kept in step with it.
 */
function publishedRegion(script) {
  const lines = script.split("\n");
  const begin = lines.findIndex((l) => /^run_doc_region\s*<<'EXAMPLE'\s*$/.test(l));
  if (begin === -1) return null;
  const end = lines.indexOf("EXAMPLE", begin + 1);
  if (end === -1) return null;
  return lines.slice(begin + 1, end).join("\n");
}

const exampleFiles = existsSync(EXAMPLES)
  ? readdirSync(EXAMPLES).filter((f) => f.endsWith(".sh") && !["_lib.sh", "run.sh"].includes(f))
  : [];

const allowlistPath = join(EXAMPLES, "illustrative.json");
const allowlist = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, "utf8")) : [];
const allowlistUsed = new Set();

for (const block of shBlocks) {
  if (block.tag) {
    const path = join(EXAMPLES, `${block.tag}.sh`);
    if (!existsSync(path)) {
      fail(`${block.file}:${block.line}`, `tagged \`example: ${block.tag}\` but examples/${block.tag}.sh does not exist`);
      continue;
    }
    const region = publishedRegion(readFileSync(path, "utf8"));
    if (region === null) {
      fail(`examples/${block.tag}.sh`, "has no `run_doc_region <<'EXAMPLE'` … `EXAMPLE` region to publish");
    } else if (region !== block.body) {
      fail(
        `${block.file}:${block.line}`,
        `does not match the region examples/${block.tag}.sh actually runs.\n` +
          `        published:\n${block.body.split("\n").map((l) => `          ${l}`).join("\n")}\n` +
          `        executed:\n${region.split("\n").map((l) => `          ${l}`).join("\n")}`,
      );
    }
    continue;
  }

  const entry = allowlist.find((e) => e.sha256 === block.sha);
  if (entry) {
    allowlistUsed.add(entry.sha256);
    continue;
  }
  fail(
    `${block.file}:${block.line}`,
    `\`sh\` block is neither tagged nor recorded as illustrative.\n` +
      `        first line: ${block.body.split("\n")[0]}\n` +
      `        If it can run offline, add examples/<id>.sh and tag the block with\n` +
      `        <!-- example: <id> -->. If it cannot (anything that binds an iroh\n` +
      `        endpoint), add this to examples/illustrative.json:\n` +
      `          { "sha256": "${block.sha}", "page": "${block.file}", "reason": "…" }`,
  );
}

for (const entry of allowlist) {
  if (!allowlistUsed.has(entry.sha256)) {
    fail(
      "examples/illustrative.json",
      `entry for ${entry.page} (${entry.sha256}) matches no block — the block was edited or removed.\n` +
        `        Re-read it and either update the hash or delete the entry.`,
    );
  }
}

// Every example must be published or explicitly declare itself unpublished.
const tagged = new Set(shBlocks.filter((b) => b.tag).map((b) => b.tag));
for (const file of exampleFiles) {
  const id = basename(file, ".sh");
  if (tagged.has(id)) continue;
  const source = readFileSync(join(EXAMPLES, file), "utf8");
  if (!/^#\s*unpublished:/m.test(source)) {
    fail(
      `examples/${file}`,
      "is referenced by no documentation block. Tag a block with\n" +
        `        <!-- example: ${id} --> or declare it with a \`# unpublished: <reason>\`\n` +
        "        comment if it exists purely for coverage.",
    );
  }
}

// ---------------------------------------------------------------- L2: lint

const hasShellcheck = (() => {
  try {
    execFileSync("shellcheck", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Names used but never assigned in the same block. Independent of ShellCheck's
 * SC2154, which is a heuristic with its own internal-variable list and may not
 * be installed at all — a reader pasting a snippet gets an empty value either
 * way, so this check has to stand on its own.
 */
const AMBIENT = new Set([
  "HOME", "PATH", "PWD", "OLDPWD", "SHELL", "TMPDIR", "USER", "LOGNAME", "TERM",
  "IFS", "LANG", "LC_ALL", "EDITOR", "HOSTNAME", "UID", "PS1", "RANDOM",
  "AZULA_SESSION", "AZULA_DATA_DIR",
]);

function unassignedVars(body) {
  const assigned = new Set();
  for (const m of body.matchAll(/(?:^|[;&|]\s*|\bexport\s+|\blocal\s+)([A-Za-z_][A-Za-z0-9_]*)=/g)) assigned.add(m[1]);
  for (const m of body.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g)) assigned.add(m[1]);
  for (const m of body.matchAll(/\bread\s+(?:-r\s+)?([A-Za-z_][A-Za-z0-9_ ]*)/g)) {
    for (const name of m[1].trim().split(/\s+/)) assigned.add(name);
  }

  const used = new Set();
  for (const m of body.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)[}:]/g)) used.add(m[1]);
  for (const m of body.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) used.add(m[1]);

  return [...used].filter((n) => !assigned.has(n) && !AMBIENT.has(n));
}

const scratch = mkdtempSync(join(tmpdir(), "azula-doccheck-"));
try {
  for (const block of shBlocks) {
    const file = join(scratch, "block.sh");
    writeFileSync(file, `#!/bin/sh\n${block.body}\n`);

    try {
      execFileSync("sh", ["-n", file], { stdio: "pipe" });
    } catch (e) {
      fail(`${block.file}:${block.line}`, `is not valid shell: ${String(e.stderr ?? e.message).trim()}`);
    }

    if (hasShellcheck) {
      try {
        execFileSync("shellcheck", ["--shell=sh", "--format=json1", file], { stdio: "pipe" });
      } catch (e) {
        const out = String(e.stdout ?? "");
        let comments = [];
        try {
          comments = JSON.parse(out).comments ?? [];
        } catch {
          /* shellcheck failed to run rather than reporting findings */
        }
        for (const c of comments) {
          // -1 for the `#!/bin/sh` line this check prepends.
          fail(`${block.file}:${block.line + c.line - 1}`, `shellcheck SC${c.code}: ${c.message}`);
        }
      }
    }

    for (const name of unassignedVars(block.body)) {
      fail(
        `${block.file}:${block.line}`,
        `references \`$${name}\`, which nothing in the block assigns — a reader who\n` +
          "        copies this snippet passes an empty value.",
      );
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// -------------------------------------------------------------- L3: surface

/** One node of the CLI tree, read from the binary's own `-h`. */
function loadNode(bin, path) {
  const help = execFileSync(bin, [...path, "-h"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const subs = new Set();
  const flags = new Set();
  const values = new Map();

  const commands = /\nCommands:\n([\s\S]*?)(?:\n\n|$)/.exec(help)?.[1] ?? "";
  for (const line of commands.split("\n")) {
    const name = /^ {2}([a-z][a-z0-9-]*)(?:\s|$)/.exec(line)?.[1];
    if (name && name !== "help") subs.add(name);
  }

  let lastFlag = null;
  for (const line of help.split("\n")) {
    // Handles both clap layouts: `  -x, --flag <V>  desc` and the two-line
    // form where a long description moves onto its own indented line.
    const m = /^\s+(?:-\w,\s+)?(--[a-z][a-z0-9-]*)/.exec(line);
    if (m) {
      flags.add(m[1]);
      lastFlag = m[1];
    }
    const pv = /\[possible values: ([^\]]+)\]/.exec(line);
    if (pv && lastFlag) values.set(lastFlag, new Set(pv[1].split(",").map((s) => s.trim())));
  }

  return { subs, flags, values, children: new Map() };
}

function childNode(bin, node, path, name) {
  if (!node.children.has(name)) node.children.set(name, loadNode(bin, [...path, name]));
  return node.children.get(name);
}

/**
 * Drop a trailing `# …` comment. The docs annotate command lists with aligned
 * comments (`azula terminal   # host one interactive shell inline`), and
 * without this the comment's first word reads as a subcommand. Only an
 * unquoted `#` counts, so `azula ui update /you '"#"'` survives.
 */
function stripComment(line) {
  let single = false;
  let double = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !double) single = !single;
    else if (c === '"' && !single) double = !double;
    else if (c === "#" && !single && !double && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/** Candidate `azula …` invocations: fenced-block lines and inline code spans. */
function invocations(rel, source) {
  const found = [];
  const lines = source.split("\n");
  let fenceLang = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      fenceLang = fenceLang === null ? fence[1] : null;
      continue;
    }
    if (fenceLang !== null) {
      if (fenceLang !== "sh") continue;
      // Split pipelines so `… | azula ui render -` is seen.
      for (const segment of stripComment(line).split("|")) {
        const t = segment.trim().replace(/^\$\s*/, "");
        if (/^azula\s/.test(t)) found.push({ file: rel, line: i + 1, text: t });
      }
      continue;
    }
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const t = m[1].trim();
      if (/^azula\s/.test(t)) found.push({ file: rel, line: i + 1, text: t });
    }
  }
  return found;
}

function tokenize(text) {
  return text
    // A markdown table cell escapes alternation as `new\|list`; the alternation
    // is meaningful, only the backslash belongs to markdown.
    .replace(/\\\|/g, "|")
    .replace(/[[\]]/g, " ")
    .replace(/…|\.\.\./g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const PLACEHOLDER = /^(<.*>|[A-Z][A-Z0-9_]*|.*\/.*|["'].*)$/;

function checkInvocation(bin, root, inv) {
  const tokens = tokenize(inv.text);
  if (tokens.shift() !== "azula") return;

  let node = root;
  const path = [];
  const where = () => `azula ${path.join(" ")}`.trim();

  while (tokens.length) {
    const token = tokens[0];
    if (token === "--") break;
    if (token.startsWith("-")) break;

    // `terminal [new|list|attach|kill]` — every alternative must be real.
    const alternatives = token.split("|");
    if (!alternatives.every((a) => node.subs.has(a))) {
      if (node.subs.has(token)) {
        /* unreachable, kept for clarity */
      } else if (alternatives.length > 1 || node.subs.size > 0) {
        const unknown = alternatives.filter((a) => !node.subs.has(a));
        // A bare placeholder argument (URL, NAME, FILE) is not a subcommand.
        if (unknown.every((u) => PLACEHOLDER.test(u))) break;
        fail(
          `${inv.file}:${inv.line}`,
          `unknown subcommand \`${where()} ${unknown.join(", ")}\`.\n` +
            `        the binary accepts: ${[...node.subs].sort().join(", ") || "(none)"}`,
        );
        return;
      } else break;
    }
    tokens.shift();
    path.push(token);
    node = childNode(bin, node, path.slice(0, -1), alternatives[0]);
  }

  while (tokens.length) {
    const token = tokens.shift();
    if (token === "--") break;
    if (!token.startsWith("--")) continue;
    const name = token.split("=")[0];
    if (!node.flags.has(name)) {
      fail(
        `${inv.file}:${inv.line}`,
        `unknown flag \`${name}\` for \`${where() || "azula"}\`.\n` +
          `        the binary accepts: ${[...node.flags].sort().join(", ") || "(none)"}`,
      );
      continue;
    }
    const allowed = node.values.get(name);
    const next = tokens[0];
    if (allowed && next && !next.startsWith("-") && !PLACEHOLDER.test(next)) {
      const bad = next.split("|").filter((v) => !allowed.has(v));
      if (bad.length) {
        fail(
          `${inv.file}:${inv.line}`,
          `\`${name}\` does not accept ${bad.map((b) => `\`${b}\``).join(", ")}.\n` +
            `        the binary accepts: ${[...allowed].sort().join(", ")}`,
        );
      }
      tokens.shift();
    }
  }
}

if (!AZULA || !existsSync(AZULA)) {
  const note =
    "no azula binary found — L3 (CLI surface) skipped. " +
    "Build one with `cargo build --release -p azula` in azula-cli, or pass --bin.";
  if (REQUIRE_BINARY) fail("check-doc-examples", note);
  else console.warn(`warning: ${note}`);
} else {
  const root = loadNode(AZULA, []);
  for (const page of pages(CONTENT)) {
    for (const inv of invocations(page.rel, page.source)) checkInvocation(AZULA, root, inv);
  }
}

// ------------------------------------------------------------------- report

const counts = `${shBlocks.length} sh block(s), ${exampleFiles.length} example(s)`;
if (failures.length === 0) {
  console.log(`ok  ${counts} — sync, lint and CLI surface all clean${hasShellcheck ? "" : " (shellcheck not installed)"}`);
  process.exit(0);
}

console.error(`FAIL  ${failures.length} problem(s) across ${counts}\n`);
for (const f of failures) console.error(`  ${f.where}\n      ${f.message}\n`);
if (!hasShellcheck) console.error("note: shellcheck is not installed; install it for fuller lint coverage.");
process.exit(1);
