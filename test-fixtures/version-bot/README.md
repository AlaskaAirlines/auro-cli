# Version-bot dry-run scenarios

Three seeded `auro-upgrade-candidates.json` fixtures plus a per-scenario
checklist. Used to **visually verify** what `auro version-tickets` would post
to Azure DevOps — without ever calling ADO.

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

A single 1-major-behind `auro-button` candidate. Exercises the full happy
path: real CHANGELOG fetch, slice, render.

```bash
node ./dist/auro-cli.js version-tickets \
  --candidates ./test-fixtures/version-bot/scenario-1-clean-upgrade.json \
  --preview-dir ./test-fixtures/version-bot/preview-output \
  --min-majors 1
```

**What you should see in stdout:**

- One `[DRY RUN]` block titled `Upgrade @aurodesignsystem/auro-button in fixture-clean-upgrade (10.0.0 -> 11.5.1, 1 major behind)`
- `changelog: inlined` (green) if `GH_TOKEN` is set; `link only` (yellow) if not
- A `preview:` line pointing at `preview-output/fixture-clean-upgrade__aurodesignsystem-auro-button.html`

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

---

## Validation checklist (adapted from auro-docs §2.4)

For each preview HTML you open, walk this in order:

| # | Check | Pass criteria |
|---|---|---|
| 1 | **Title** | Matches `Upgrade <pkg> in <repo> (<pinned> -> <latest>, N major[s] behind)`. Imperative, includes repo, package, version delta. |
| 2 | **Tags** | Three pills shown: `auro`, `version-upgrade`, `majors-behind-<n>`. The `<n>` matches the candidate's `majorsBehind` field. |
| 3 | **CHANGELOG badge** | "CHANGELOG inlined" (green) or "link-only fallback" (yellow). Matches the stdout `changelog:` line for that candidate. |
| 4 | **Description rendering** | All four `<h3>` sections present and visible: Context, Risks of not upgrading, Migration guide, Benefits of upgrading. No raw HTML showing as text. |
| 5 | **Migration guide section** | If badge is "inlined", at least one `<h4>` per-version block with bullets. If "fallback", a single `<p>` with a CHANGELOG link. |
| 6 | **Migration guide link** | Click it. Should resolve to a real CHANGELOG (or 404 if the package is fake — scenario 2 expects 404). |
| 7 | **Repo link** | Top of preview, `Repo:` line. Click → goes to the consumer repo URL. |
| 8 | **Inline code + links inside changelog bullets** | If inlined: backticks render as `<code>`, and any `[text](url)` markdown links render as clickable anchors. |

If any check fails for a real (non-fixture) candidate: do not pass `--apply`.
Fix the underlying template/changelog code first.

---

## Known gaps vs auro-docs `adoautocreate.md`

The auro-docs file specifies fields and behaviors that this version-bot
pipeline **does not yet implement**. Documenting them here so reviewers
know what to look for *and what's deliberately out of scope*:

| Gap | Doc reference | Status |
|---|---|---|
| `Microsoft.VSTS.Common.AcceptanceCriteria` field | adoautocreate.md §2.1 schema | Not set by `createADOWorkItem`. Tickets land without acceptance criteria; reviewers must add them by hand. |
| Duplicate-check before write | adoautocreate.md §2.4 last row | Not implemented. Re-running `--apply` on the same candidates JSON creates duplicate tickets. The candidates JSON is the only dedupe surface. |
| Iteration / Sprint, AssignedTo, StoryPoints, Priority | adoautocreate.md §"Things to confirm" | All inherit project defaults. No CLI flags expose them. |
| One-ticket-at-a-time enforcement | adoautocreate.md §"Important ground rules" | The CLI is batch-shaped. Use `--limit 1 --repo <one>` for the first live run; otherwise nothing prevents a 50-ticket apply. |

Closing any of these is a follow-up — none of them block the fixtures
from validating the **current** behavior of `version-tickets`.

---

## Files in this directory

| File | Tracked? | Notes |
|---|---|---|
| `README.md` | yes | This file. |
| `scenario-*.json` | yes | Hand-crafted fixtures, safe to commit. |
| `preview-output/` | **no** (gitignored) | Created on demand by `--preview-dir`. Delete freely. |
