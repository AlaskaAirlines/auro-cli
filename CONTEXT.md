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

**Why not vitest/programmatic tests:** auro-cli has no existing test harness.
Adding one would be a separate project. The fixtures + visual checklist
gives us coverage of the integration boundary (template + changelog +
preview rendering) without that overhead.

### Decision 6: candidates JSON is the dedupe surface, not ADO

`version-tickets --apply` does not query ADO for existing tickets before
creating new ones. Re-running `--apply` against the same candidates JSON
will create duplicate work items.

**Why this is OK for now:** the candidates JSON is the canonical "what
needs a ticket" list. The intended workflow is:
1. Run `version-scan`, producing fresh candidates.
2. Optionally hand-edit the candidates JSON to drop already-ticketed rows.
3. Run `version-tickets --apply`.

**Why this is not OK long-term:** automation will hit this. A weekly cron
that runs scan → tickets without a dedupe step will create the same ticket
every week until someone manually closes them. This is flagged as a Tier 2
gap in `project-plan.md`.

---

## Module map

| Path | Responsibility | Inputs | Outputs |
|---|---|---|---|
| `src/scripts/version-bot/types.ts` | Shared types (`SemverParts`, `PackageScan`, `RepoEntry`, `ScanCache`, `UpgradeCandidate`) | n/a | n/a |
| `src/scripts/version-bot/cache.ts` | Read/write the two JSON files (default `./.cache/version-bot/`, override via `dir` arg). Path helpers + `displayPath` for cwd-relative display | `ScanCache`, `UpgradeCandidate[]`, optional dir override | Files on disk |
| `src/scripts/version-bot/npm-registry.ts` | `npmLatest(pkg)`, `parseSemver`, `majorsBehind` | Package name string | Version strings, numbers |
| `src/scripts/version-bot/changelog.ts` | `fetchChangelogSlice(pkg, pinned, latest)` — Octokit fetch from `AlaskaAirlines/<short-pkg>`, parse semver-release-flavored markdown, slice to `(pinned, latest]`, render to HTML. In-process cache by `(pkg, pinned, latest)` | Strings | HTML or `null` |
| `src/scripts/version-bot/template.ts` | `buildStoryTitle(c)` and `buildStoryBody({ candidate, changelogHtml, changelogUrl })`. Risks/benefits sections are static; migration section uses inlined HTML when present, otherwise a plain link | `UpgradeCandidate`, optional HTML | HTML strings |
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

See `project-plan.md` "Remaining work to reach QA-ready" for the
prioritized list. Quick summary:

- **Tier 1 (must-do before any `--apply`)**: live `version-scan` against
  `Alaska-ECommerce` is unverified; ADO write path is unverified; no human
  has eyeballed a real ADO-rendered ticket; open items with Lindsey unresolved.
- **Tier 2 (field-contract gaps vs auro-docs)**: `AcceptanceCriteria` not
  set, no dedupe before write, no iteration/owner/priority assignment,
  one-ticket-at-a-time enforcement is by convention.
- **Tier 3 (operational)**: working-tree commits + PR, GitHub Actions cron
  + bot service account, token rotation runbook.

The `Acceptance Criteria` and dedupe gaps are the two most likely to
generate manual rework if shipped without. The dedupe gap in particular
will hit any cron automation hard.

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
