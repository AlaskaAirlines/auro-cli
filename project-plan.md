# Auro Version Bot — Project Plan

Add two new commands to `auro-cli` that scan the `Alaska-ECommerce` GitHub org for repos using outdated Auro components and auto-create Azure DevOps User Story tickets recommending upgrades.

Source-of-truth handoff doc: [`../auro-docs/auro-migration-handoff.md`](../auro-docs/auro-migration-handoff.md)
Detailed approval'd plan: `~/.claude/plans/enchanted-honking-eclipse.md`

---

## Decisions (locked)

- **Home:** `auro-cli` — extend with two new subcommands. Reuses the `azure-devops-node-api`, `@octokit/rest`, `commander`, `inquirer`, `ora`, and `chalk` deps already installed; reuses the org/project/area path conventions already wired in `src/scripts/ado/index.ts`.
- **Safety defaults:** `auro version-tickets` defaults to `--dry-run` and `--min-majors=2`. Live writes require explicit `--apply`. Lowering the threshold requires explicit `--min-majors=1`.
- **Migration guide enrichment:** Auto-fetch `CHANGELOG.md` from `AlaskaAirlines/<pkg>` and inline only the entries between pinned and latest. Falls back to a plain hyperlink when the CHANGELOG is missing or unparseable.

---

## Phase status

| # | Phase | Status |
|---|---|---|
| 1 | Foundations — types, semver helpers, npm registry fetch, cache I/O | ✅ Done |
| 2 | Content generators — story-body template + CHANGELOG fetch/slice | ✅ Done |
| 3 | `auro version-scan` command | ✅ Done |
| 4 | Refactor existing ADO helper for reuse | ✅ Done |
| 5 | `auro version-tickets` command | ✅ Done |
| 6 | README + `.env.example` + final verification | ✅ Done |

---

## Phase 1 — Foundations ✅

Pure utilities. No CLI wiring yet.

**Added:**
- `src/scripts/version-bot/types.ts` — `SemverParts`, `PackageScan`, `RepoEntry`, `ScanCache`, `UpgradeCandidate`. Cache shape mirrors handoff exactly.
- `src/scripts/version-bot/npm-registry.ts` — `npmLatest(pkg)` (10 s timeout, returns `null` on any failure), `parseSemver`, `majorsBehind(pinned, latest)`.
- `src/scripts/version-bot/cache.ts` — read/write helpers for both output files. Originally stored under `~/.auro/version-bot/` via the existing `withHomeDir` util; later refactored to default to project-local `./.cache/version-bot/` (see "Post-initiative work" below). Tolerates corrupted JSON by falling back to a fresh cache.

**Verified:** `npm run build` ✓, `biome check` ✓.

---

## Phase 2 — Content generators ✅

Pure modules consumed by the tickets command later.

**Added:**
- `src/scripts/version-bot/template.ts` — `buildStoryTitle(c)` and `buildStoryBody({ candidate, changelogHtml, changelogUrl })`. Risks/benefits sections are static; migration section uses the inlined changelog when present, otherwise a plain link.
- `src/scripts/version-bot/changelog.ts` — `fetchChangelogSlice(pkg, pinned, latest)`. Uses Octokit `repos.getContent` against `AlaskaAirlines/<short-pkg-name>`. Parses both `# [version]` and `## [version]` headers (semantic-release uses `#` for minor/major bumps, `##` for patches). Slices to `(pinned, latest]`. Renders sub-headings as `<h5>`, bullets as `<li>`, inline backticks as `<code>`, and inline `[label](url)` markdown links as `<a>` tags. In-process cache by `(pkg, pinned, latest)` triple. Returns `null` on any failure.

**Verified:** build ✓, lint ✓, smoke test against real `auro-button` CHANGELOG (73 sections parsed, 8 sliced for `(11.3.0, 11.5.1]`, rendered HTML preserves issue links + inline code).

---

## Phase 3 — `auro version-scan` command ✅

The slow scan step. Producer of both JSON outputs.

**Added:**
- `src/scripts/version-bot/scan.ts` — `runScan({ org, force })` orchestrator. Uses Octokit `paginate.iterator` to list non-archived/non-fork repos in the target org, fetches root `package.json` per repo via `repos.getContent`, and extracts `@aurodesignsystem/*` + `@alaskaairux/*` deps from `dependencies` + `devDependencies`. Builds an archived-package set from `AlaskaAirlines` so retired packages are dropped from candidates (not from the cache). `pushed_at` short-circuit skips repos that haven't changed since the last scan unless `--force` is set. After the cache write, fans out one `npmLatest` lookup per distinct package, then emits `UpgradeCandidate[]` for every (repo, pkg) pair >= 1 major behind. Returns a summary `{ reposScanned, reposSkipped, reposErrored, candidatesFound, cachePath, candidatesPath }` for the command layer to render.
- `src/commands/version-scan.ts` — `commander` registration with `--org <name>` (default `Alaska-ECommerce`) and `--force`. Renders the summary with `chalk` and exits 1 on failure.

**Modified:**
- `src/index.ts` — added `import "#commands/version-scan.ts";`.

**Verified:** `npm run build` ✓, `biome check src/scripts/version-bot/scan.ts src/commands/version-scan.ts` ✓ (no diagnostics), `auro --help` lists `version-scan`, `auro version-scan --help` shows both flags with correct defaults. End-to-end run against the live org deferred to first real `version-tickets` test (Phase 5) so we don't churn the cache.

---

## Phase 4 — Refactor existing ADO helper ✅

No behavior change to the existing `auro ado` command. Pure refactor so Phase 5 doesn't duplicate ADO connection code.

**Modified:**
- `src/scripts/ado/index.ts` — `createADOWorkItem` is now exported and accepts `{ title, descriptionHtml, tags? }` instead of a `GitHubIssue` object. The org URL, project name, and `E_Retain_Content\Auro Design System` area path remain hard-coded inside the helper. Tags are appended to the JSON Patch only when the array is non-empty (Phase 5 will use `auro`, `version-upgrade`, `majors-behind-<n>`). The GitHub-issue-specific description (`GitHub Issue: <a ...>...</a>`) moved up into the `createADOItem` caller, which now builds the input shape and calls the new helper.

**Verified:** `auro ado --help` is byte-identical to before (same `-g, --gh-issue` flag, same description). esbuild bundle succeeds. The pre-existing `syncDotGithubDir.ts` tsc errors are unchanged from HEAD and unrelated to this refactor. Live `auro ado --gh-issue <issue>` smoke test deferred to the next time Lindsey/the team runs the existing flow — surface area is unchanged.

---

## Phase 5 — `auro version-tickets` command ✅

The mutating step. Defaults are conservative; opt-in flags widen scope.

**Added:**
- `src/scripts/version-bot/create-tickets.ts` — `runCreateTickets({ minMajors, apply, limit?, repo? })`. Reads `auro-upgrade-candidates.json` via `readUpgradeCandidates()`, applies filters in order (`majorsBehind >= minMajors`, then `repo` match, then `limit` slice), and for each candidate fetches the changelog slice (Phase 2), builds title + body (Phase 2), and either prints a dry-run summary or calls `createADOWorkItem` (Phase 4). Every ticket is tagged `auro`, `version-upgrade`, `majors-behind-<n>`. Returns `{ totalCandidates, afterFilter, applied, dryRun, failed }`.
- `src/commands/version-tickets.ts` — `commander` registration. Options: `--min-majors <n>` (default `"2"`, parsed and validated `>= 1`), `--apply` (default `false` → dry-run), `--limit <n>`, `--repo <name>`. Renders chalk summary; non-zero exit on parse/run failures.

**Modified:**
- `src/index.ts` — added `import "#commands/version-tickets.ts";`.

**Safety defaults applied:**
- Without `--apply`, no ADO writes happen — period. Dry-run prints title, tag list, whether the changelog was inlined, and body length.
- Default `--min-majors=2` keeps low-impact upgrades out of the queue. Lowering to `1` is explicit (`--min-majors=1`); the parser refuses `< 1`.
- `--limit` + `--repo` provide bounded blast radius for the first live run (per the "open items" list).

**Verified:** bundle ✓, biome check ✓ (after one auto-format pass), `auro --help` lists `version-tickets`, `auro version-tickets --help` shows all four flags with correct defaults. End-to-end dry run + first `--apply --limit=1 --repo=<safe>` deferred to Phase 6 verification with Lindsey present (per "open items" list).

---

## Phase 6 — Docs + env example ✅

**Modified:**
- `README.md` — added two new entries under Commands matching the existing `auro dev` block style. Each entry covers what the command does, the env vars it needs, the option list with defaults, and 2–3 worked examples (including the bounded `--apply --limit 1 --repo` first-live-run pattern from the open-items list).
- `src/commands/version-scan.ts` — `--org` default is now `process.env.ECOM_ORG ?? "Alaska-ECommerce"` so the env var works as a per-shell override and the CLI flag still wins when both are set. The help text calls this out: `(overrides ECOM_ORG env var)`.

**Added:**
- `.env.example` — documents `GH_TOKEN` (used by `ado`, `version-scan`, and `version-tickets`), `ADO_TOKEN` (used by `ado` and `version-tickets --apply`), and `ECOM_ORG` (optional default for `version-scan --org`). Each var has a comment explaining which command(s) need it and the scopes/usage.

**Verified:** bundle ✓, biome check on the changed command file ✓, `auro version-scan --help` shows the new help text, `ECOM_ORG=TestOrg-FromEnv auro version-scan --help` correctly shows `default: "TestOrg-FromEnv"` (env override path works), README entries describe the same flags as the live help output.

---

## Post-initiative work (added after the 6 phases shipped)

These weren't part of the original phase plan but landed in the same branch as supporting infrastructure for QA + multi-user setup.

**Test scenarios (committed):**
- `test-fixtures/version-bot/` — three seeded `auro-upgrade-candidates.json` fixtures (clean upgrade, link fallback, mixed thresholds) + a README walking the auro-docs §2.4 validation checklist adapted for version-bot's actual field surface.
- `--candidates <file>` and `--preview-dir <dir>` flags on `version-tickets` — let scenarios run against a fixture file and emit styled HTML previews without touching the real cache or ADO.
- `src/scripts/version-bot/html-preview.ts` — renders each candidate's body wrapped in a styled HTML shell (banner, tag pills, CHANGELOG-status badge, repo metadata) so reviewers can open one file per candidate in a browser.
- `.gitignore` — `test-fixtures/version-bot/preview-output/` ignored.

**Multi-user setup (committed):**
- `dotenv ^17.4.2` runtime dep + `import "dotenv/config"` as the first import in `src/index.ts` (must run before command imports — `version-scan` reads `ECOM_ORG` at option-registration time).
- `.env` added to `.gitignore`.
- README "First time setup" section walking new contributors through PAT generation, `.env` workflow, and how the same env-var contract works for CI.
- `scripts/check-tokens.js` + `npm run check-tokens` — read-only diagnostic that pings GitHub `/user` and ADO `/_apis/wit/workitemtypes` to validate both PATs without echoing token values.

**Build unblock (committed):**
- `src/scripts/syncDotGithubDir.ts` — pre-existing tsc errors (TS2578 unused `@ts-expect-error` + TS7016 missing types for `auro-library` `.mjs`) were blocking `npm run build`. Swapped to `@ts-ignore` and collapsed the import onto one line so the directive covers the `from "..."` line where TS7016 fires. No behavior change.

**Path refactor (committed):**
- `src/scripts/version-bot/cache.ts` — default output dir moved from `~/.auro/version-bot/` to project-local `./.cache/version-bot/`. All path/read/write helpers accept an optional `dir` override. Buggy `relativeToHome` (which mistakenly stripped the `.auro` segment when displaying paths) replaced with `displayPath` that returns cwd-relative paths. The `~/.auro/` choice was an outlier vs. the rest of `auro-cli`, which already writes per-project artifacts under the project (`dist/`, `auroDocs/`, etc.).
- `src/commands/version-scan.ts` — added `--output-dir <dir>` flag; passed through to `runScan`.
- `src/commands/version-tickets.ts` — `--candidates` help text updated to reference the new default path. The flag itself was already in place.
- `README.md` + `CONTEXT.md` + `test-fixtures/version-bot/README.md` — file location references updated. `.cache/` is already in `auro-cli/.gitignore`, so `.cache/version-bot/` is automatically untracked.

---

## Remaining work to reach QA-ready

### Tier 1 — Block-prevention (must do before any `--apply`)

| # | Item | Why |
|---|---|---|
| 1 | Run live `version-scan` against `Alaska-ECommerce` | Pagination, cache write/read, archived-package detection from `AlaskaAirlines`, and rate-limit behavior are all unexercised against a 100+ repo org. |
| 2 | Exercise `ADO_TOKEN` write path | Diagnostic confirms read scope only. Whether the PAT can create a work item under `E_Retain_Content\Auro Design System` is unproven until the first `--apply` run. |
| 3 | Eyeball a real ADO-rendered ticket | HTML preview is browser-rendered; ADO has its own rendering quirks (sometimes strips/re-escapes HTML). The auro-docs §2.4 checklist is meant for ADO's renderer. |
| 4 | Resolve [open items with Lindsey](#open-items-to-confirm-with-lindsey-before-first-live---apply-run) | PAT scope, first-run bounds, default sprint/owner/priority. |

### Tier 2 — Field-contract gaps vs `auro-docs/adoautocreate.md`

Documented in `test-fixtures/version-bot/README.md` "Known gaps" section. Each shipped without after deliberate scope-narrowing.

| Gap | Cost of not closing | Estimated work |
|---|---|---|
| `Microsoft.VSTS.Common.AcceptanceCriteria` not set | Every ticket needs AC added by hand after creation | 1 small edit to `createADOWorkItem` + Phase 5 caller; need a default AC bullet list |
| No dedupe before write | Re-running `--apply` on the same candidates JSON creates duplicate work items | Medium — WIQL query against `System.Tags` containing `version-upgrade` + repo + package |
| No iteration / owner / priority | All tickets inherit project defaults | Tiny if hardcoded; small if exposed as flags. Blocked on Lindsey's call |
| One-ticket-at-a-time enforcement | Convention only (`--limit 1`) | Could harden by defaulting `--limit` to 1 and requiring opt-out, but trades safety for ergonomics on bulk runs |

### Tier 3 — Operational / hardening

| Item | Notes |
|---|---|
| Commit + PR for everything since the last commit | Working tree has Phase 6 docs, scenarios, dotenv, token-check, tsc fix all unstaged. Reviewer will want this in reviewable chunks |
| GitHub Actions cron + bot service account | Sketched (not built). Requires a service-account PAT for both GitHub and ADO before any code lands |
| Token rotation runbook | 90-day PAT expiry will catch you. Short doc on rotation without downtime is useful before automation |

---

## Out of scope for Phase 1 (this initiative)

- Sprint / iteration / owner / story-point assignment on created tickets — left to project defaults until Lindsey decides the convention.
- `auro-formkit`-style monorepo per-package CHANGELOGs — fall back to the link when the parser doesn't recognize the structure; revisit only if it shows up in real upgrade targets.
- CI scheduling — this is a maintainer-run on-demand CLI for now.

## Open items to confirm with Lindsey before first live `--apply` run

(See handoff `auro-docs/auro-migration-handoff.md:432-440`.)

1. Running user has PAT permission to create work items under `E_Retain_Content\Auro Design System`.
2. First live run should be bounded by `--repo` or `--limit` to keep blast radius small.
3. Default sprint / owner / priority — currently inherits project defaults.
