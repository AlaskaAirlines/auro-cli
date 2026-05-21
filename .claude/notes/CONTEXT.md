# Auro Version Bot — Project Context

This is the long-form companion to [`project-plan.md`](./project-plan.md). The
plan tracks **what shipped per phase**; this doc tracks **why decisions were
made and how the pieces fit together**, so a future contributor (or future
you, six months from now) can pick this up without re-reading the chat
transcript.

If you are looking for the **per-command UX**, that lives in
[`README.md`](./README.md). If you are looking for the **manual ticket-creation
loop**, that lives in [`../auro-docs/adoautocreate.md`](../auro-docs/adoautocreate.md).
The auro-cli implementation sits between those two: it uses the same ADO
contract as the manual loop, but exposes it as a batch CLI tool.

---

## Goal

Add two new subcommands to `auro-cli` that automate the
[Auro Version Bot](https://auro.alaskaair.com) upgrade-ticket workflow Lindsey
documented in `auro-docs/auro-migration-handoff.md`:

1. **`auro version-scan`** — crawl a GitHub org (default `Alaska-ECommerce`),
   find every consumer repo using `@aurodesignsystem/*` or `@alaskaairux/*`,
   and emit a flat list of `(repo, package, pinned, latest, majorsBehind)`
   upgrade candidates.
2. **`auro version-tickets`** — read that list and create one Azure DevOps
   User Story per candidate under `E_Retain_Content\Auro Design System`.
   Defaults to dry-run; `--apply` enables real writes.

The handoff doc described this as a standalone Node script. We chose to fold
it into `auro-cli` to reuse existing dependencies (`octokit`, `azure-devops-
node-api`, `commander`, `ora`, `chalk`) and the existing `auro ado` flow.

---

## Layered architecture

The work is split into six phases that map onto a layered design. Lower
layers are pure / reusable; upper layers compose them.

```
                ┌──────────────────────────────┐
   Phase 5      │   src/commands/version-      │
   (orchestrate)│   tickets.ts                 │
                └─────────────┬────────────────┘
                              │
                ┌─────────────▼────────────────┐
                │   src/scripts/version-bot/   │
                │   create-tickets.ts          │   ← reads candidate JSON,
                │                              │     filters, dry-runs or
                │                              │     calls Phase 4 helper
                └──┬───────────┬───────────┬───┘
                   │           │           │
   Phase 2 ────────▼─┐     Phase 1 ────────▼─┐  Phase 4 ───────▼──┐
   (content gen)     │     (utilities)       │  (ADO refactor)    │
   - template.ts     │     - cache.ts        │  - createADOWork-  │
   - changelog.ts    │     - npm-registry.ts │    Item refactored │
                     │     - types.ts        │    in src/scripts/ │
                     │                       │    ado/index.ts    │
                     └───────────────────────┘                    │
                                                                  ▼
                                                           Azure DevOps API

   Phase 3 ─────────────────────────────────┐
   (the other producer command)             │
   src/commands/version-scan.ts             │   ← writes the candidate
   src/scripts/version-bot/scan.ts          │     JSON that Phase 5 reads

   Phase 6 ─────────────────────────────────┐
   (docs / setup)                           │
   README.md, .env.example                  │
   src/commands/version-scan.ts (env var)   │
```

Why this shape:

- **Phases 1–2 are pure modules** — no CLI surface, no I/O beyond
  `npmLatest` / `fetchChangelogSlice`. Testable in isolation; reusable from
  any future caller.
- **Phase 3 (`version-scan`) and Phase 5 (`version-tickets`) are independent
  commands** that communicate by file. The candidate JSON is the contract.
  This means a maintainer can hand-edit the JSON between scan and tickets
  (e.g. drop a problematic row), or run them on different schedules later.
- **Phase 4 was a dedicated refactor** of the existing `auro ado` flow
  rather than folded into Phase 5 — see [Decision 3](#decision-3-phase-4-as-its-own-no-op-refactor).

---

## Key architectural decisions

### Decision 1: cache stores raw state, candidates JSON is the filtered output

`auro-deps-by-ecommerce-repo.json` records every Auro dep declared by every
consumer repo, **including** packages whose source repo is archived in
`AlaskaAirlines`. `auro-upgrade-candidates.json` is the curated list — repos
filtered for `>= 1 majorsBehind`, archived packages excluded, npm-resolvable
only.

**Why:** the cache is meant to be a faithful audit-able snapshot. If we
filtered at write time, we'd lose the ability to answer questions like
"which repos still depend on a now-archived package?" The candidate list is
where we apply judgement; the cache is where we record reality.

**Implication:** `version-tickets` consumes the candidates list and trusts
it's already filtered. It does not re-check archive status or do its own
threshold logic against the raw cache.

### Decision 2: `pushed_at` short-circuit, with `--force` as the escape hatch

`version-scan` skips re-fetching a repo's `package.json` when the cached
`pushedAt` matches the current `pushed_at` and `--force` is not set.

**Why:** initial scan against a 100+ repo org takes 3–5 min. Most repos
won't have changed between runs. Without the short-circuit, every re-run
costs the full time. With it, only repos with new pushes since the last
scan are re-fetched.

**Implication:** the cache file format must be stable across runs.
`ScanCache.repos` is keyed by repo name; entries persist across scans and
are updated in place when their `pushedAt` changes.

### Decision 3: Phase 4 as its own no-op refactor

The original `createADOWorkItem` was a private function inside
`src/scripts/ado/index.ts` shaped around a `GitHubIssue` argument. Phase 5
needed to create work items too, but with titles/bodies built from upgrade
candidates instead of GitHub issues.

We could have either (a) copy-pasted the connection setup into Phase 5, or
(b) folded the refactor into Phase 5's commit. We did neither.

Phase 4 was its own commit with one explicit goal: change the helper's
signature from `(issue: GitHubIssue) => WorkItem` to
`(input: { title, descriptionHtml, tags? }) => WorkItem`, export it, and
update the existing `auro ado` caller to build the input shape. **No
behavior change for users.** Phase 5 then imported and called it.

**Why:** review surface. The Phase 4 diff is small, easy to verify is
behavior-preserving, and easy to revert if needed. Phase 5's diff is purely
additive — new files, new command, no edits to existing logic. If we'd
bundled them, a reviewer would have to mentally separate "what's renaming"
from "what's new" in one big diff.

The hardcoded values (`orgUrl`, `projectName`, `areaPath`) intentionally
stayed inside the helper. They describe the ADO destination, not the
input — every caller hits the same project. Pushing them to the call site
would force every caller to know ADO topology.

### Decision 4: dotenv at the CLI entry, not per-command

`src/index.ts` line 1: `import "dotenv/config"`. This runs before any
command file imports.

**Why this matters:** `src/commands/version-scan.ts` reads
`process.env.ECOM_ORG` at option-registration time, which fires during
import. If dotenv loaded later (e.g. inside an action handler), the env var
wouldn't be populated by the time the option default was registered, and
the help output would show `default: "Alaska-ECommerce"` regardless of
what's in `.env`.

**Why CLI-level instead of per-command:** consistency. Every command can
read `process.env.X` without thinking about it. Adding dotenv to one
command means future contributors have to remember the pattern; doing it
once at entry is a "set and forget" decision.

**Why not require a wrapper like `dotenv-cli`:** worse UX for new team
members. The `.env.example` file already implies "copy this and it works."
Adding `dotenv/config` makes that promise hold.

### Decision 5: hybrid test scenarios (option C from the design discussion)

Test scaffolding lives at `test-fixtures/version-bot/`. The fixture JSONs
and the scenarios README are committed; the `preview-output/` directory is
gitignored.

**Why hybrid:** the `--candidates <file>` and `--preview-dir <dir>` flags
are useful permanently, not just for this validation pass. Anyone hand-
editing a candidate file before applying benefits from `--candidates`.
Anyone wanting to see a body before pushing benefits from `--preview-dir`.
The fixtures are documentation as much as test data — they show what a
candidate JSON looks like and what each scenario stresses.

**Why not vitest/programmatic tests:** (Updated 2026-05-13.) Vitest was
added as the unit-test harness for pure logic — see
`src/scripts/version-bot/*.test.ts`. Coverage today: `aliases`,
`npm-registry` (semver helpers + `resolveLatestAcrossAliases` with mocked
fetch), and `template` (title/body/AC builders, including the
cross-namespace path). Fixtures and `--preview-dir` are still the
integration-boundary surface (template + real CHANGELOG fetch + preview
rendering) — they verify the full pipeline end-to-end with real-looking
data, which unit tests can't replicate without elaborate Octokit mocking.
The two layers complement each other: unit tests catch refactor
regressions; fixtures catch "did the rendered output still look right?"
regressions.

### Decision 6: candidates JSON is the dedupe surface, not ADO — SUPERSEDED

**Original posture (kept here for history):** `version-tickets --apply`
did not query ADO; re-running against the same candidates JSON created
duplicates. The intended workflow was scan → hand-edit candidates → apply.

**Superseded by Decision 9 (below).** Dedupe now runs as a WIQL pre-check
inside `processCandidate` on the `--apply` path. The candidates JSON is no
longer the dedupe surface.

### Decision 7: static Risks / Benefits dropped; Breaking changes derived

The original story body had two static sections — "Risks of not upgrading"
and "Benefits of upgrading" — that were identical on every ticket. Both
were dropped.

**Replacement:** a derived **"Breaking changes in this upgrade"** section
extracted from the BREAKING CHANGES subheadings in the CHANGELOG slice.
Same parser (`changelog.ts`) now returns a structured slice in addition to
the rendered HTML; `extractBreakingChanges(slice)` flattens the BREAKING
CHANGES entries with their source version. The section is omitted when
the CHANGELOG isn't fetchable; it renders an explicit "No breaking
changes detected …" paragraph when the changelog exists but contains no
breaking-change entries.

**AC also became partially dynamic:** the generic 5–6 verification
bullets (package.json + lockfile, build, lint, tests, smoke) stay, and
**a single summary bullet** is appended that points back to the body's
"Breaking changes in this upgrade" section by count
(e.g. "Verify each of the 11 breaking changes listed in the … section is
handled in your codebase"). The earlier design appended one AC bullet
per breaking change, but on long-jump upgrades (4 → 12, 11+ breakings)
that produced ~17 bullets of nearly-identical "Verify the breaking
change in X.Y.Z is handled: …" noise that pushed the meaningful
build/lint/test/smoke checkpoints out of view. The body still
enumerates each breaking change with version + description for
reviewers who want detail; AC is the verification checkpoint, not a
second copy.

**Why drop the static pitch entirely:** the audience for these tickets is
engineers about to do the upgrade. They need to know what's breaking and
how to verify the fix, not a generic case for upgrading. The Context
section's "N majors behind" already conveys the pitch.

### Decision 8: per-run audit log; cleanup subcommand consumes it

Every `--apply` run generates a `runId` (sortable `YYYYMMDDTHHMMSS-<hex>`)
that's printed up front and again in the summary footer. Each successful
create — and each later close — appends a JSONL entry to
`./.cache/version-bot/run-log.jsonl` with the candidate, the work item
ID/URL, and the action.

`auro version-tickets cleanup --run-id <id> [--apply]` (or `--last`)
reads the log and PATCHes each work item from that run to
`System.State = "Removed"` with a history comment naming the cleanup
run-id. Closes are themselves logged so a future audit can reconstruct
"which run created this, and which run later closed it."

**Why JSONL:** append-only is robust to partial-write crashes (incomplete
lines parse-error to "skip" instead of corrupting the rest of the log).
A `lastRunId()` helper sorts by id, which is sortable by construction.

**Why soft-delete (`Removed`) instead of hard-delete:** hard delete in
ADO needs admin perms most users don't have. `Removed` is the canonical
soft-delete state and is recoverable.

### Decision 9: dedupe by close-and-recreate via title-substring matching

When `processCandidate` finds an open matching ticket for the same
(repo, package) on the `--apply` path:

- **Same `latest`** (or existing newer) → skip (true dupe, log it).
- **Existing in any non-`New` state** (Active, Resolved, …) → skip (don't
  disturb in-progress work; the next scan re-evaluates).
- **`New` state with older `latest`** → close-and-recreate: PATCH old to
  `Removed` with a comment "Closed because a newer version of `<pkg>` has
  shipped (now at `<latest>`). Replaced by #`<new-id>`: `<url>`"; create
  new with a "Supersedes #`<old-id>`" line in its Context section. Both
  events are written to the audit log (`replacedBy` on the old, `supersedes`
  on the new).

**How matching works** (updated 2026-05-13): the WIQL query in `wiql.ts`
finds open User Stories under the Auro area path whose title contains
both the package name and the repo name. `parseLatestFromTitle`
extracts the version from matched titles. Originally the query also
filtered on `[System.Tags] CONTAINS 'version-upgrade'`, but that clause
was removed because the user's ADO account didn't have tag-write
permission. The area-path + title-substring + `parseLatestFromTitle`
combination is sufficiently anchored on its own — manual tickets that
happen to share substrings have unparseable version-delta titles and are
conservatively skipped rather than overwritten.

**Why close-and-recreate, not in-place title/body update:** the new
ticket has a clean version delta in its title and an unambiguous history
entry; reviewers diff the new ticket against the old by URL rather than
scrolling a "title changed N times" log. Title rewrites also confuse
existing notifications and integrations.

**Behavior with manual tickets:** the title-substring match catches them
too, but `parseLatestFromTitle` returns null for any title not in the
bot's `<pinned> -> <latest>` format, and the code path treats null as
"skip, defer to the human." Net effect: bot tickets get full
close-and-recreate; human tickets get respectful no-ops.

**When the tag-write permission lands:** decide whether to put the tag
clause back as a secondary precision filter. Current read in
handoff-for-next-session.md item D.6: probably not — title-substring
matching is sufficiently anchored, and the broader behavior (catching
manual duplicates too) is aligned with the goal of eliminating manual
ticket entry.

### Decision 10: `npm run demo` is the team-facing demo surface

A small static page (`demo/index.html`) plus a stdlib Node HTTP server
(`demo/server.mjs`) exposes each canonical workflow scenario as a button.
Each button spawns the underlying CLI command and streams stdout to the
panel via Server-Sent Events. Dangerous buttons (anything `--apply`) get
a `window.confirm` dialog.

**Why a web page over an interactive CLI wrapper:** the demo audience
includes non-technical folks. A button you click is more immediate than
a prompt you have to know how to answer. The Node http + SSE stack adds
zero npm deps.

**Why not Vite / React:** zero build step. The page is a single HTML
file you can read in 5 minutes; the server is a single ESM module. Any
future contributor can extend it without learning a new frontend toolchain.

### Decision 11: cross-namespace alias resolution (`@alaskaairux/*` ↔ `@aurodesignsystem/*`)

Most Auro packages were republished from `@alaskaairux` to
`@aurodesignsystem`, but a handful (notably `@alaskaairux/icons`)
stayed under the legacy scope. A naive scan treats the two namespaces
as independent packages, so a consumer pinned on
`@alaskaairux/auro-button@4` looks "up to date" at the last
`@alaskaairux` version even though active development is at
`@aurodesignsystem/auro-button@12+`.

**Solution:** `aliases.ts` exports a hand-curated `PACKAGE_ALIASES` map
(initial entries verified on npm: `auro-button`, `auro-icon`,
`auro-popover`). `npm-registry.ts:resolveLatestAcrossAliases` looks up
both scopes in parallel and returns the higher version. `scan.ts`
populates `UpgradeCandidate.targetPackage` when the alias produced the
winning version. `template.ts` renders a "⚠ Namespace rename" callout
in Context and rewrites the first AC bullet ("Replace X with Y …")
when `targetPackage` is set.

**Why hand-curated and not auto-detected:** not every legacy package
migrated 1:1. `@alaskaairux/icons` has no `@aurodesignsystem/icons`
successor — the legacy name is canonical. Trying to auto-derive aliases
("does the same short-name exist under both scopes?") would
false-positive on these. Adding a new alias requires verifying both
packages exist on npm AND the new-scope version is actively published.

### Decision 12: usage inventory and breaking-change cross-reference are deterministic, not LLM

For each candidate, the ticket body now includes:
1. **"Where this package is used in your codebase"** — file paths from
   GitHub Code Search, scoped to the consumer repo + package name(s).
   For cross-namespace candidates, two searches (one per name) merged in
   memory (Code Search treats `OR` as a literal, not a logical
   operator). `package.json` and lockfiles are excluded from the
   results — every candidate has the package in `package.json` by
   definition, so listing it is pure noise.
2. **Per-breaking-change "→ find `<identifier>` in this repo" links** —
   `buildBreakingChangeSearchLink` extracts identifier-shaped tokens
   from backticked spans in the CHANGELOG text (e.g. `slim`,
   `iconOnly`) and constructs a `github.com/search` URL combining the
   identifier with the package short name and the consumer repo. Pure
   URL building; no API call from the bot.

**Why deterministic over LLM:** both produce content that's trustworthy
without a review step — the bot is naming files and identifiers that
demonstrably exist in the consumer's repo, not synthesizing prose that
might be wrong. LLM-driven migration prose (Layer 5 in the
handoff doc's D.8) is deferred to a future Lindsey conversation that
will also define a review/safety process.

**Why hand-curated migration recipes were tried and abandoned:** a
schema + loader + template integration shipped on 2026-05-13 (Layer 4)
and was reverted the same day. The infrastructure assumed the Auro team
would author recipes alongside major releases — but no one had committed
to that. Same anti-pattern as the reverted telemetry CSV: infrastructure
for content nobody is writing. The actual answer for dynamic per-step
migration content is Layer 5 (LLM); recipes were a half-measure that
required labor the team isn't doing. See memory
`feedback_backlog_rationale.md` for the generalized rule.

### Decision 13: quarterly cron + secret-gated CI workflow

`.github/workflows/version-bot-quarterly.yml` is the GitHub Actions
schedule that will eventually run the bot without anyone touching it.
Cron: `0 13 1 1,4,7,10 *` — 1st of Jan/Apr/Jul/Oct at 13:00 UTC (6 AM
PDT / 5 AM PST). Quarterly is deliberately conservative while the bot
is new; tighten to monthly/weekly once it has earned trust.

**Two-job structure:** a `precheck` job checks for `GH_TOKEN` and
`ADO_TOKEN` repo secrets. The downstream `scan-and-create` job is
gated on `needs.precheck.outputs.configured == 'true'`. Until the bot
service account is provisioned and secrets are configured, the precheck
emits a `::warning::` and short-circuits — no red Xs accumulate in the
Actions tab while the file sits dormant.

**Why this matters:** the workflow file is committed and ready *before*
provisioning lands. Once a future session adds the secrets, the next
quarterly trigger picks them up automatically with no code change.

---

## Module map

| Path | Responsibility | Inputs | Outputs |
|---|---|---|---|
| `src/scripts/version-bot/types.ts` | Shared types (`SemverParts`, `PackageScan`, `RepoEntry`, `ScanCache`, `UpgradeCandidate`) | n/a | n/a |
| `src/scripts/version-bot/cache.ts` | Read/write the two JSON files (default `./.cache/version-bot/`, override via `dir` arg). Path helpers + `displayPath` for cwd-relative display | `ScanCache`, `UpgradeCandidate[]`, optional dir override | Files on disk |
| `src/scripts/version-bot/npm-registry.ts` | `npmLatest(pkg)`, `parseSemver`, `majorsBehind` | Package name string | Version strings, numbers |
| `src/scripts/version-bot/changelog.ts` | `fetchChangelogStructured(pkg, pinned, latest)` returns `{ versions, html }` — structured slice + rendered HTML in one shape; `fetchChangelogSlice` is a back-compat HTML-only wrapper. Adds `extractBreakingChanges(slice)` to flatten BREAKING CHANGES entries across versions. Octokit fetch from `AlaskaAirlines/<short-pkg>`; in-process cache by `(pkg, pinned, latest)` | Strings | `ChangelogSlice` or `null` |
| `src/scripts/version-bot/template.ts` | `buildStoryTitle(c)`, `buildStoryBody({ candidate, changelogSlice, changelogUrl, breakingChanges, supersedes? })`, `buildAcceptanceCriteria(c, breakingChanges)`. Body sections: Context (with supersedes note when set) → Breaking changes (derived, omitted if no slice) → Migration guide → footer. AC = generic 6 bullets + one per breaking change | `UpgradeCandidate`, structured slice | HTML strings |
| `src/scripts/version-bot/audit-log.ts` | Append-only JSONL log at `./.cache/version-bot/run-log.jsonl`. `newRunId()`, `appendAuditEntry`, `readAuditEntries`, `readAuditEntriesForRun(runId)`, `lastRunId()`. Entry shape: `{ runId, timestamp, action: "created"\|"closed", workItemId, workItemUrl, candidate, supersedes?, replacedBy?, note? }` | n/a | `AuditEntry[]` |
| `src/scripts/version-bot/cleanup.ts` | `runCleanup({ apply, runId?, last?, list? })` — resolves the target run id (or lists), filters to entries with action `"created"` that haven't been closed in a later run, dry-runs or PATCHes each to `Removed` with a history comment, audit-logs every close action under a new cleanup run id | Audit log entries | Summary + ADO mutations |
| `src/scripts/ado/wiql.ts` | `findOpenBotTickets({ repo, pkg })` — WIQL query for open tickets in the area path with tag `version-upgrade` and (repo, package) substrings in title. `parseLatestFromTitle(title)` extracts the version delta from a bot-generated title | repo/pkg strings | `OpenBotTicket[]` |
| `src/scripts/ado/index.ts` | Adds `closeADOWorkItem({ id, comment?, state? })` — PATCHes `System.State` to `"Removed"` and (optionally) `System.History`. `createADOWorkItem` constants extracted to module-scope (`ADO_ORG_URL`, `ADO_PROJECT_NAME`, `ADO_AREA_PATH`) and a shared `getWorkItemTrackingApi()` factory | `CreateADOWorkItemInput` / `CloseADOWorkItemInput` | `WorkItem` |
| `demo/server.mjs` | Stdlib Node http server (no deps). Routes: `/` (HTML), `/scenarios` (JSON), `/run?id=…` (SSE stream of CLI stdout/stderr), `/preview/<file>` (serves HTML previews from the test-fixtures directory). 11 canonical scenarios baked in: tokens / scan-info / overview / dry-run single / dry-run batch / dry-run namespace-rename / apply single / apply batch / re-apply (dedupe) / cleanup last / list runs | CLI commands | Browser-rendered demo |
| `demo/scan-info.mjs` | Static informational script for demo scenario 0: explains what `auro version-scan` does and references the last live run (2,525 repos scanned, 436 candidates) without actually invoking the 3–5 min scan | n/a | stdout description |
| `demo/scan-overview.mjs` | Standalone Node script: reads the cached candidates JSON, prints aggregates (total, distribution by majors-behind, top 10 repos, top 10 packages). Used by demo scenario 2 | candidates JSON | stdout summary |
| `demo/index.html` | Single-file frontend: left rail of scenario cards (label, description, command preview, Run button), right pane with current command + streaming output panel + preview-link strip. No build step | n/a | Renders in browser |
| `src/scripts/version-bot/scan.ts` | `runScan({ org, force })` — paginated repo listing, per-repo `package.json` fetch, archived-package set construction from `AlaskaAirlines`, `pushed_at` short-circuit, npm latest resolution, candidate emission. Returns a summary | Octokit + filesystem | Two JSON files + summary |
| `src/scripts/version-bot/create-tickets.ts` | `runCreateTickets({ minMajors, apply, limit?, repo?, candidatesPath?, previewDir? })` — read candidates, filter, dry-run print or `--apply` write, optionally emit per-candidate HTML preview | Candidate JSON file | Stdout summary, optionally HTML files, optionally ADO writes |
| `src/scripts/version-bot/html-preview.ts` | `writePreviewFile(dir, input)` — render styled HTML wrapper with banner, repo metadata, tag pills, CHANGELOG-status badge, and the body itself | One candidate's title + body + tags | One HTML file |
| `src/commands/version-scan.ts` | Commander registration. Options `--org`, `--force`. `--org` default = `process.env.ECOM_ORG ?? "Alaska-ECommerce"` | CLI args | Calls `runScan`, prints summary |
| `src/commands/version-tickets.ts` | Commander registration. Options `--min-majors`, `--apply`, `--limit`, `--repo`, `--candidates`, `--preview-dir`. Validates ints `>= 1` | CLI args | Calls `runCreateTickets`, prints summary |
| `src/scripts/ado/index.ts` (Phase 4 changes) | `createADOWorkItem({ title, descriptionHtml, tags? })` — exported, generic over input source. The existing `createADOItem` (GitHub-issue path) builds the input shape and calls in | `CreateADOWorkItemInput` | `WorkItem` |
| `scripts/check-tokens.js` | Diagnostic — pings GitHub `/user` and ADO `/_apis/wit/workitemtypes`, reports pass/fail without echoing tokens | Env vars | Stdout |
| `test-fixtures/version-bot/scenario-*.json` | Three seeded `UpgradeCandidate[]` arrays exercising clean-upgrade / link-fallback / mixed-thresholds | n/a | Read by `--candidates` |

---

## Operational notes

### Required env vars

| Var | Required by | Notes |
|---|---|---|
| `GH_TOKEN` | `version-scan`, `version-tickets`, `ado` | GitHub PAT with `repo` scope (read package.json from private repos, list orgs, fetch CHANGELOGs from `AlaskaAirlines/*`) |
| `ADO_TOKEN` | `version-tickets --apply`, `ado` | Azure DevOps PAT for `itsals` org with **Work Items: Read, write, & manage** scope |
| `ECOM_ORG` | `version-scan` (optional) | Override default org. CLI flag `--org` takes precedence |

### Where files live

| Path | What | Lifetime |
|---|---|---|
| `auro-cli/.cache/version-bot/auro-deps-by-ecommerce-repo.json` | Full per-repo Auro dependency snapshot. Incremental, keyed by `pushed_at` | Persistent across runs (gitignored via `.cache/`) |
| `auro-cli/.cache/version-bot/auro-upgrade-candidates.json` | Flat candidate list (filtered, archived-excluded) | Overwritten each scan (gitignored via `.cache/`) |
| `auro-cli/.cache/version-bot/run-log.jsonl` | Append-only audit log of every `--apply` and `cleanup --apply` event | Persistent across runs (gitignored via `.cache/`); consumed by `cleanup --run-id` |
| `auro-cli/.env` | Local PATs (gitignored) | Persistent on developer's machine |
| `auro-cli/test-fixtures/version-bot/preview-output/*.html` | Generated HTML previews from `--preview-dir` | Disposable; gitignored |

**Why project-local instead of `~/.auro/`:** these are project-specific outputs that the developer needs to inspect. The rest of `auro-cli` follows this convention (`auro build` writes to `<project>/dist/`, etc.); the version-bot used to be the outlier because it followed the `getAuroHomeDir()` helper. Project-local default keeps the data next to the code that produced it; `--output-dir <dir>` overrides the default for CI / artifact-store workflows.

### How env vars get loaded

1. `src/index.ts` first line: `import "dotenv/config"` (must run before any
   command file imports).
2. Dotenv reads from `process.cwd()/.env` — meaning the user's current
   working directory when they run `auro`.
3. **Existing `process.env` values win** — shell exports and CI-injected
   secrets take precedence over `.env`. This is the default dotenv behavior
   and it's what makes the same code path serve both local dev (`.env`
   file) and CI (secrets exported as env vars on the runner).

### How to run `version-scan` and `version-tickets`

After `npm run build`:

```bash
# Producer step (writes both JSONs)
node ./dist/auro-cli.js version-scan

# Consumer step (dry-run by default)
node ./dist/auro-cli.js version-tickets --min-majors 2
```

For the bounded first-live-run pattern:

```bash
node ./dist/auro-cli.js version-tickets \
  --apply \
  --limit 1 \
  --repo <one-safe-consumer-repo>
```

### How to validate PATs without a live run

```bash
npm run check-tokens
```

Read-only; never echoes the token values; reports pass/fail with metadata
(your GitHub username, the ADO project name, work item type list).

### Token rotation

Both PATs expire (Alaska's max for the ADO PAT is 90 days; GitHub PATs you
set yourself). The right way to rotate is to overlap the new and old PATs
briefly so you never hit a window where neither works.

**For your local `.env`:**

1. **Generate the replacement PAT before the existing one expires.** Same
   URLs and scopes as the first-time setup section in `README.md`.
2. **Edit `.env`** and replace the `GH_TOKEN=` or `ADO_TOKEN=` value with
   the new token. (Keep the old value in a password manager temporarily
   in case you need to roll back.)
3. **Validate:** `npm run check-tokens`. Should print `valid as <you>` for
   GH_TOKEN and `valid against itsals/E_Retain_Content` for ADO_TOKEN.
4. **Smoke test:** dry-run scenario 1 to confirm the new GH_TOKEN actually
   works against real GitHub APIs:
   ```bash
   node ./dist/auro-cli.js version-tickets \
     --candidates ./test-fixtures/version-bot/scenario-1-clean-upgrade.json \
     --preview-dir ./test-fixtures/version-bot/preview-output \
     --min-majors 1
   ```
   Look for `changelog: inlined` (green). If it falls back to `link only`,
   the new GH_TOKEN doesn't have the required `repo` scope — regenerate.
5. **Revoke the old PAT** in GitHub and ADO once the new ones are
   confirmed working. Don't skip this step — old PATs that "still work"
   eventually leak.

**For CI / scheduled automation:** the same rotation pattern applies, but
the secret store (GitHub Actions repository secrets, Azure Pipelines
variable groups) is the source of truth instead of `.env`. Update the
secret store first, redeploy / re-run the workflow once to confirm, then
revoke. This is deferred work — see [Tier 3 in `project-plan.md`](./project-plan.md)
for the full automation track.

---

## Known gaps

Current state (post 2026-05-20):

- **Phases 1–7 + compliance rewrite shipped.** Phase 7 committed, compliance taxonomy + policy catalog + evaluate.ts + findings.ts + usage-inventory.ts + dashboard all in `src/scripts/version-bot/` and `demo/`. The Module map above predates the compliance work — cross-check against the actual directory before relying on it.
- **Active initiative:** auro-scan integration. Source plan: `auro-scan-integration-plan.md`. Step-by-step walkthrough: `auro-scan-integration-walkthrough.md`. The goal is to make the bot's discovery pipeline pull from auro-scan's REST API rather than running its own org-walk; the ADO actuator side stays in auro-cli unchanged.
- **Tag-write permission gap**: `wiql.ts` no longer filters on `System.Tags`. `--no-tags` is hardcoded in the CI workflow. Both revert when permission lands.
- **What's open is mostly Lindsey-track**: bot service account provisioning (gates the CI workflow), tag-write permission, iteration / owner / priority defaults on created tickets, LLM-synthesized migration prose (Layer 5).
- **Long-term**: phase G (multi-team routing) — the actual production end-state. See `multi-team-routing.md`. Don't start until the service account + dedupe + permissions story is settled.

---

## First-live-run protocol

Before any `--apply`, walk this in order. Stop at the first failure.

1. **`npm run check-tokens`** — both PATs must pass. If ADO_TOKEN fails on
   "auth required", regenerate the PAT with **Work Items: Read, write, &
   manage** scope.
2. **Sync with Lindsey** on the [open items](./project-plan.md#open-items-to-confirm-with-lindsey-before-first-live---apply-run).
   Don't skip — at minimum confirm her side knows you're about to start
   creating tickets in `E_Retain_Content`.
3. **Live `version-scan`** against the real org. Verify both JSON files
   land under `auro-cli/.cache/version-bot/`. Verify the candidate count
   is plausible. If it's surprisingly small or zero, debug before
   proceeding.
4. **Pick a safe target repo** for the bounded first run. "Safe" =
   you understand the upgrade impact, you can cancel the ticket without
   confusion, and ideally a repo you own.
5. **Dry-run with `--repo <safe>` and `--limit 1`** first, against the
   real candidates JSON (no `--candidates` flag). Inspect the printed
   title + body length + tag list. Optionally use `--preview-dir` to see
   the rendered HTML.
6. **`--apply --limit 1 --repo <safe>`** — first real write. Open the
   resulting ADO URL. Walk the auro-docs §2.4 validation checklist
   directly against the ADO render (not the local HTML preview).
7. **If anything fails the checklist**, set the work item state to
   `Removed`, fix the issue, and redo step 6. Don't proceed to bulk runs
   until one full ticket passes validation end-to-end.
8. **Only after step 7 passes**, broaden scope: lift `--limit`, drop
   `--repo`, possibly drop `--apply` for a final dry-run sanity check.
