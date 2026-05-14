# Version-bot dry-run scenarios

Four seeded `auro-upgrade-candidates.json` fixtures plus a per-scenario
checklist. Used to **visually verify** what `auro version-tickets` would post
to Azure DevOps — without ever calling ADO.

For an interactive surface that wraps these (and adds `--apply` / cleanup
scenarios), run `npm run demo` from the repo root. This README is the
fallback for running fixtures manually + the canonical validation checklist.

This complements the manual loop in
[`auro-docs/adoautocreate.md` §2](../../../auro-docs/adoautocreate.md). That
doc covers a per-story handcrafted flow; the scenarios below cover the
batched `version-tickets` path.

---

## How it works

`auro version-tickets` ships two flags that this directory is built around:

| Flag | What it does |
|---|---|
| `--candidates <file>` | Read upgrade candidates from a custom JSON file instead of `./.cache/version-bot/auro-upgrade-candidates.json`. Lets you point at a fixture without stomping your real cache. |
| `--preview-dir <dir>` | During dry-run only, write one styled HTML file per candidate to `<dir>`. Open the file in a browser to see what `System.Description` would render as in ADO. |

The `--apply` flag is intentionally never passed in any scenario below.

## Prerequisites

```bash
cd auro-cli
npm run build      # one time, plus after any version-bot source change
```

Optional: set `GH_TOKEN` to a GitHub PAT with read access to
`AlaskaAirlines/*`. **Without it, all scenarios fall through to the
link-only path** — fine for verifying layout, not enough to verify
the inlined-CHANGELOG path.

```bash
export GH_TOKEN=ghp_xxx...
```

`ADO_TOKEN` is **not** required for any scenario here — none of them apply.

---

## Scenario 1 — Clean upgrade with inlined CHANGELOG

A single 1-major-behind `auro-button` candidate against a real
Alaska-ECommerce repo (`LoungeMembership-Web`). Exercises the full happy
path: real CHANGELOG fetch, slice, render — plus the live GitHub Code
Search that powers the "Where this package is used in your codebase"
section.

```bash
node ./dist/auro-cli.js version-tickets \
  --candidates ./test-fixtures/version-bot/scenario-1-clean-upgrade.json \
  --preview-dir ./test-fixtures/version-bot/preview-output \
  --min-majors 1
```

**What you should see in stdout:**

- One `[DRY RUN]` block titled `Upgrade @aurodesignsystem/auro-button in LoungeMembership-Web (11.5.1 -> 12.3.2, 1 major behind)`
- `changelog: inlined` (green) if `GH_TOKEN` is set; `link only` (yellow) if not
- `usage:` line reporting how many files in `LoungeMembership-Web` reference the package
- A `preview:` line pointing at `preview-output/LoungeMembership-Web__aurodesignsystem-auro-button.html`

**Open the HTML in a browser.** Walk the checklist below.

## Scenario 2 — Link-only fallback

A candidate for a deliberately fake package. The CHANGELOG fetch will 404
and `buildStoryBody` falls back to a plain hyperlink.

```bash
node ./dist/auro-cli.js version-tickets \
  --candidates ./test-fixtures/version-bot/scenario-2-link-fallback.json \
  --preview-dir ./test-fixtures/version-bot/preview-output \
  --min-majors 1
```

**What you should see:**

- `changelog: link only` (yellow) regardless of `GH_TOKEN`
- The HTML's "Migration guide" section contains a single `<p>` with a
  `<a>` link, no `<h4>` per-version sections

## Scenario 3 — Mixed thresholds (verify `--min-majors` filtering visually)

Three candidates at 1, 2, and 3 majors behind. Run the same fixture twice
with different thresholds and compare the printed counts + HTML output.

```bash
# Default threshold (>= 2): expect 2 candidates printed
node ./dist/auro-cli.js version-tickets \
  --candidates ./test-fixtures/version-bot/scenario-3-mixed-thresholds.json \
  --preview-dir ./test-fixtures/version-bot/preview-output

# Lowered threshold (>= 1): expect all 3 candidates printed
node ./dist/auro-cli.js version-tickets \
  --candidates ./test-fixtures/version-bot/scenario-3-mixed-thresholds.json \
  --preview-dir ./test-fixtures/version-bot/preview-output \
  --min-majors 1
```

**What you should see:**

- The summary footer's `After filters:` value matches expectations (2 then 3)
- The 1-major-behind candidate's HTML only appears after the second run
- Each HTML's `Tags:` row ends in `majors-behind-1`, `majors-behind-2`,
  or `majors-behind-3` — reflecting the dynamic per-candidate tag

## Scenario 4 — Cross-namespace rename

A single `@alaskaairux/auro-icon` → `@aurodesignsystem/auro-icon` candidate
(8 majors behind across the rename) against the real `dated-flight-ui`
repo. Exercises the alias-resolution path in `npm-registry.ts:resolveLatestAcrossAliases`
and the rename callouts in `template.ts`.

```bash
node ./dist/auro-cli.js version-tickets \
  --candidates ./test-fixtures/version-bot/scenario-4-cross-namespace.json \
  --preview-dir ./test-fixtures/version-bot/preview-output \
  --min-majors 1
```

**What you should see in the HTML:**

- A yellow **"⚠ Namespace rename"** callout in the Context section naming
  the old + new package
- The first Acceptance Criteria bullet starts with **"Replace
  `@alaskaairux/auro-icon` with `@aurodesignsystem/auro-icon` in
  `package.json`…"** (rewritten from the default "Update the dependency
  version…" wording)
- The "Where this package is used" section reflects file matches from
  **both** scopes (Code Search runs once per scope and merges, since
  Code Search treats `OR` as a literal not a boolean)

---

## Validation checklist (adapted from auro-docs §2.4)

For each preview HTML you open, walk this in order:

| # | Check | Pass criteria |
|---|---|---|
| 1 | **Title** | Matches `Upgrade <pkg> in <repo> (<pinned> -> <latest>, N major[s] behind)`. Imperative, includes repo, package, version delta. |
| 2 | **Tags** | Three pills shown: `auro`, `version-upgrade`, `majors-behind-<n>`. The `<n>` matches the candidate's `majorsBehind` field. (Skipped when `--no-tags` is set; see "Known gaps".) |
| 3 | **CHANGELOG badge** | "CHANGELOG inlined" (green) or "link-only fallback" (yellow). Matches the stdout `changelog:` line for that candidate. |
| 4 | **Description sections** | `<h3>` headings present in order: **Context**, **Where this package is used in your codebase** (omitted only when Code Search returns zero hits), **Breaking changes in this upgrade** (omitted when CHANGELOG can't be fetched; renders an explicit "No breaking changes detected…" paragraph when the slice exists but has zero entries), **Migration guide**. No raw HTML showing as text. |
| 5 | **Breaking changes section** | When present, one bullet per breaking change with version tag (e.g. `[12.0.0]`) + description + a "→ find `<identifier>` in this repo" search link for each backticked token. |
| 6 | **Acceptance Criteria** | The AC section renders one **summary bullet** ("Verify each of the N breaking changes listed in the Breaking changes in this upgrade section is handled…") followed by 6 generic verification bullets (package.json + lockfile, build, lint, tests, smoke, visual regression). No per-breaking-change AC bullets — that was deliberately collapsed; the body section is the detailed enumeration. |
| 7 | **Usage inventory** | When the section renders, it lists up to 10 sample file paths from `repo:Alaska-ECommerce/<repo>` Code Search, plus an "and N more" overflow line when the total exceeds 10. `package.json` + lockfiles are excluded. |
| 8 | **Migration guide section** | If badge is "inlined": at least one `<h4>` per-version block with bullets. If "fallback": a single `<p>` with a CHANGELOG link. |
| 9 | **Migration guide link** | Click it. Should resolve to a real CHANGELOG (or 404 if the package is fake — scenario 2 expects 404). |
| 10 | **Repo link** | Top of preview, `Repo:` line. Click → goes to the consumer repo URL. |
| 11 | **Inline code + links inside changelog bullets** | If inlined: backticks render as `<code>`, and any `[text](url)` markdown links render as clickable anchors. |
| 12 | **Namespace rename callout** (scenario 4 only) | Context section includes a yellow "⚠ Namespace rename" paragraph naming both packages; the first AC bullet is rewritten to "Replace `<old>` with `<new>` in `package.json`…". |

If any check fails for a real (non-fixture) candidate: do not pass `--apply`.
Fix the underlying template/changelog code first.

---

## Known gaps vs auro-docs `adoautocreate.md`

The auro-docs file specifies fields and behaviors that this version-bot
pipeline **does not yet implement**. Documenting them here so reviewers
know what to look for *and what's deliberately out of scope*:

| Gap | Doc reference | Status |
|---|---|---|
| Iteration / Sprint, AssignedTo, StoryPoints, Priority | adoautocreate.md §"Things to confirm" | All inherit project defaults. No CLI flags expose them. Awaiting Lindsey's call on whether to hardcode values or expose per-run flags. |
| One-ticket-at-a-time enforcement | adoautocreate.md §"Important ground rules" | The CLI is batch-shaped. Use `--limit 1 --repo <one>` for the first live run; otherwise nothing prevents a 50-ticket apply. Deliberately deferred — defaulting `--limit` to 1 trades against bulk ergonomics. |
| Tag-write permission | (operational, not in adoautocreate.md) | `wiql.ts` no longer filters dedupe on `[System.Tags] CONTAINS 'version-upgrade'` and `--no-tags` is hardcoded in the CI workflow — the user's ADO account lacked tag-write permission as of the 2026-05-13 demo. Dedupe still works (relies on area-path + title-substring + `parseLatestFromTitle`); tag pills just don't appear on created tickets. When the permission lands, decide whether to re-add the tag clause as secondary precision. |

**Resolved since the original gap list** (no longer issues):
- `Microsoft.VSTS.Common.AcceptanceCriteria` field — now set by `createADOWorkItem`. AC is one summary bullet ("Verify each of the N breaking changes…") plus 6 generic verification bullets.
- Duplicate-check before write — Phase 7 dedupe gate (`src/scripts/ado/wiql.ts:findOpenBotTickets`) runs before every `--apply` create. Same-`latest` open ticket → skip; older `latest` open ticket → close-and-recreate with `Supersedes #N` linkage.

Closing any of the remaining gaps is a follow-up — none of them block the
fixtures from validating the **current** behavior of `version-tickets`.

---

## Files in this directory

| File | Tracked? | Notes |
|---|---|---|
| `README.md` | yes | This file. |
| `scenario-*.json` | yes | Hand-crafted fixtures, safe to commit. |
| `preview-output/` | **no** (gitignored) | Created on demand by `--preview-dir`. Delete freely. |
