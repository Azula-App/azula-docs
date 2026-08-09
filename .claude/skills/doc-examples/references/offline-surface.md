# Which `azula` commands bind an endpoint

An example may only use commands from the **safe** table. Everything else calls
`endpoint::bind_endpoint_with_secret`, which is:

```rust
let endpoint = Endpoint::builder(presets::N0).secret_key(secret).bind().await?;
info!("bringing endpoint online…");
endpoint.online().await;
```

`presets::N0` means n0's public relays plus DNS discovery, and `online()` has
**no timeout**. Without network it does not fail — it hangs. That is why the
rule is "offline only" rather than "offline preferred": a bad example wedges the
run instead of reporting a failure.

(`presets::Minimal` — no relays, loopback only — exists in the CLI but is
`#[cfg(test)]`-only, which is how the in-process suite covers every ALPN. It is
not reachable from the command line, so examples cannot use it.)

## Safe: binds nothing

| Command | Why | Source |
|---|---|---|
| `--help`, `--version`, `<sub> -h` | Pure clap | `cli/mod.rs:187` |
| `status [--json]` | "computed purely from disk, binding no endpoint"; reads the machine key with `load_machine_secret_if_exists`, never creates one | `core/status.rs` |
| `devices [--json]` | Registry file read | `cli/legacy.rs:221` |
| `pair <URL>` | **Synchronous** `fn` — decodes the link, appends to `devices.json`. "No network access is performed" | `cli/legacy.rs:183`, `link.rs:16` |
| `qr <CODE>` | `parse_ticket` + `render_qr`, pure string work | `cli/legacy.rs:283` |
| `invites` | Reads `invites.json` | `cli/legacy.rs:367` |
| `terminal list [--json]` | Walks the runtime dir, checks `pid_alive` | `cli/terminal_cmd.rs:492` |
| `ui catalog [--json]` | Prints a compile-time constant | `cli/ui.rs:196` |
| `run --handoff never -- CMD` | Returns before any bind. No TTY needed: falls back to 50x200 when stdout isn't a terminal ("the common CI case"), and stdin is never forwarded | `cli/run_cmd.rs:140`, `:238`, `:179` |
| `ui render` **with invalid input** | "Validation runs before any endpoint is bound or device dialed — nothing is sent on rejection", exit 2 | `cli/ui.rs:101-117` |

## Unsafe: binds, hangs without network

| Command | Note |
|---|---|
| `mcp`, `message send/recv`, `watch`, `file send` | All via `core::establish` |
| `ui render` with **valid** input, `ui update`, `ui delete` | Reaches `establish` at `cli/ui.rs:131` |
| `terminal` (host), `terminal new`, `terminal attach` | |
| `run --handoff on-error\|always` | Binds to hold the handoff session |
| `invite` (mint) | `bind_server_endpoint` + `online()`, `cli/legacy.rs:319` |
| `link` | Binds, then **blocks** waiting for a root-holding device to send a `LinkGrant`. The CLI only ever plays the new-device role, so it can't be driven from a second CLI | `link.rs:35` |
| `relay` | Long-running server |

## State isolation

`_lib.sh` redirects all of these. A command that reads state not on this list
would escape the workspace.

| Variable | Default |
|---|---|
| `AZULA_KEY_DIR` | `~/.azula/<name>.key` |
| `AZULA_SESSIONS_DIR` | `~/.azula/sessions/` |
| `AZULA_INVITES_DIR` | `~/.azula/invites.json` |
| `AZULA_STATE_DIR` | `$TMPDIR/azula/bridge.json` |
| `AZULA_RUNTIME_DIR` | `$TMPDIR/azula/sessions` |
| `AZULA_MAILBOX_DIR`, `AZULA_LINK_DIR`, `AZULA_RECEIVED_DIR` | under `~/.azula` |

Two that are **not** simple overrides:

- **`AZULA_REGISTRY_DIR` is left unset on purpose.** `override_dir`
  (`registry.rs:60-70`) short-circuits *both* the project and global paths into
  one directory distinguished only by filename, bypassing the git-root walk and
  `$HOME` resolution that `docs/cli.md` documents. Isolation comes from `HOME`
  plus cwd instead; `project_path` only tests `dir.join(".git").exists()`
  (`registry.rs:80`), so `mkdir .git` is enough — no git binary needed.
- **`TMPDIR` is load-bearing.** `session_statuses` (`core/status.rs:104-106`)
  scans `std::env::temp_dir()` for ephemeral session keys with no override
  available, so without redirecting `TMPDIR` a `status` example would report
  sessions belonging to whatever else is running.

### Re-checking the isolation guarantee

```bash
before=$(find ~/.azula -type f 2>/dev/null | sort | shasum)
azula-site/examples/run.sh > /dev/null 2>&1
after=$(find ~/.azula -type f 2>/dev/null | sort | shasum)
[ "$before" = "$after" ] && echo "PASS: ~/.azula unchanged" || echo "FAIL"
```

## Output determinism

Fresh-state output has no timestamps or random ids:

| Command | Output |
|---|---|
| `status --json` | `{"machine_identity":{"present":false},"devices":[],"sessions":[]}` |
| `devices --json` | `[]` |
| `terminal list --json` | `[]` |

But **key order is not a contract**: `devices --json` is built with `json!`
(alphabetical, since `serde_json` here has no `preserve_order`), while
`status --json` derives from structs (declaration order). Use `assert_json`.

And `azula run` output carries PTY line-discipline bytes —
`\r\n ^D\b\b hello\r\n` for `echo hello` — so it can only be matched as a
substring after stripping CR, which `assert_out` does.
