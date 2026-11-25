# AGENTS.md

## Commands

- Use `pnpm` only; the repo pins `pnpm@11.2.2` and requires Node `>=22`.
- Install with `pnpm install --frozen-lockfile` when matching CI.
- Verify with targeted checks only: the test file you touched (one per run), `pnpm run typecheck`, and `oxfmt` and `oxlint` on the changed files. Do not run the whole suite, `pnpm run lint`, `pnpm run format:check` or `pnpm run build`; CI runs `check:lsp-output-schemas`, `lint`, `typecheck`, `test`, `build`, `format:check`, then `npm pack --dry-run --json`.
- Run one test file with `pnpm test tests/unit/config.test.ts`; append `-t "name"` for a focused Vitest case.
- Local dev uses `pnpm run dev` from `src/index.ts`; packaged/local MCP hosts must use `node /absolute/path/to/checkout/dist/index.js` after `pnpm run build`.
- Pre-commit runs `lint-staged` (`pnpm run lint:staged`: `oxfmt --check` and `oxlint` on staged files only). There is no pre-push hook; typecheck, tests and build are left to CI.

## Generated Files

- Do not edit `src/tools/generated/*` by hand. Regenerate with `pnpm run generate:lsp-output-schemas` and commit the generated diff with any LSP library or generator changes.
- `pnpm run check:lsp-output-schemas` regenerates schemas and fails on tracked or untracked diffs under `src/tools/generated`.

## Architecture Notes

- This is a single Node/TypeScript ESM package named `language-server-mcp`; the installed binary is `language-server-mcp` and points to `dist/index.js`.
- `src/index.ts` only starts the stdio MCP server; `src/mcp/stdio.ts`, `src/mcp/server.ts`, and `src/tools/registerTools.ts` wire runtime behavior.
- Tool calls go through a configured registry facade. User config loads at startup; project config loads lazily per normalized `workspaceRoot` and is cached for that MCP process.
- Project config changes in `.lsp-mcp.json` or `.lsp-mcp.jsonc` are not watched. Restart the MCP process, or recreate the configured registry when embedding, before expecting config changes to apply.
- LSP sessions are local stdio child processes, started lazily per normalized workspace root and `serverId`, reused across calls, and shut down after the configured idle timeout.
- File-targeted tool input positions are 1-based; the implementation converts them to LSP 0-based positions.

## Safety And Tool Behavior

- Edit-producing tools return edits by default. They write files only when `apply: true` is passed.
- `apply: true` requires `serverId` when multiple servers match, and applied edits are workspace-bound unless `security.allowExternalFiles` is true.
- `lsp_execute_command` and code-action commands are enabled by default but can be disabled globally or restricted per server in config.
- Built-in managed downloads are enabled by default for supported servers and cache under `$XDG_CACHE_HOME/lsp-mcp` or `~/.cache/lsp-mcp`; rust, go, and clangd require system installs or explicit commands.
- Raw LSP tools pass arbitrary methods and params through to trusted local LSP processes; do not assume sandboxing beyond this project's workspace-bound read/edit checks.
