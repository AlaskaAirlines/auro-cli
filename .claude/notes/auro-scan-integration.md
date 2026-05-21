# Auro Scan Integration — making auro-cli's version bot read from auro-scan

**Status:** Draft — needs Lindsey + auro-scan team sign-off before any work starts
**Scope:** auro-cli side of the migration with auro-scan prerequisites called out as dependencies. The bot keeps living in auro-cli and behaving the same way externally — what changes is where its data comes from.

---

## TL;DR — decision summary

- **auro-scan owns the data.** SQLite schema, scan runs, evidence, findings, severity, history. Its REST API is the read interface for everyone else.
- **auro-cli stays the actuator.** It reads findings from scan's API, runs the candidate-collapse + ADO write pipeline, keeps the JSONL audit log of every ticket-creation action.
- **Shared logic consolidates.** `evaluatePackage` is already identical (auro-cli's `evaluate.ts` is a verbatim port). After integration, the bot deletes its copy and consumes scan's findings directly.
- **Shared catalogs consolidate.** Live in auro-scan only (`AURO_PACKAGES`, `COMPONENT_API_CATALOG`, `PACKAGE_POLICY_CATALOG`). auro-cli stops shipping its own.
- **Externally-observable behavior is unchanged:** `auro version-scan` writes the same cache files, `auro version-tickets` files the same ADO stories, the dashboard renders the same way.

---

## Working agreements

**Flag database changes.** If the data shape or structure inside auro-scan's SQLite database changes during plan execution — new columns, dropped columns, type changes, table additions, index changes, JSON-payload reshaping in any of `scan_runs`, `repositories`, `packages`, `repository_packages`, `usage_evidence`, `compliance_findings` — flag it and discuss *before* merging. We already expect specific migrations from this plan (A3 adds `notes`; A4 adds `successor_package`, `majors_behind`, `manifest_paths`). Anything beyond those needs an explicit "why is this changing?" conversation, because the bot's HTTP client and the dashboard both read this shape. The same agreement applies to the bot's local cache JSON files — if their shape needs to drift, raise it.

**Design preference — discovery model.** Strong preference (not a hard requirement): post-migration discovery should be namespace-prefix matching for `@aurodesignsystem/*` and `@alaskaairux/*`, NOT a hard-coded package enumeration. The bot already works this way (`scan.ts:298-304`); scan today doesn't. Moving scan to prefix matching keeps the two tools consistent, removes the catalog-update tax for new publishes, and makes A6 (open-world detection backstop) the default behavior. If the auro-scan team has a reason this isn't feasible (closed list drives non-discovery features — display names, policy lookups, primary-tag mapping), flag it and we'll discuss. The closed list can still drive policy/display while discovery uses prefix matching — those are separable.

---

## Context

Today auro-cli's version bot runs end-to-end inside its own process: it lists repos in `Alaska-ECommerce`, discovers manifests, fetches `package.json` files, hits the npm registry for "latest", applies the policy catalog, and evaluates compliance. auro-scan does the same work independently (against a SQLite store, with richer source-level evidence) and the two datasets drift over time.

The bot's `evaluatePackage` is already a verbatim port of scan's. The policy catalogs differ but converge on the same shape. The right move is to keep the bot's **actuator** half (ADO writes, audit log, ticket rendering, dashboard) and replace its **discovery** half with HTTP reads against scan's REST API.

---

## What stays in auro-cli (the preservation list)

Critical to anchor on before discussing changes — none of these files are touched:

- `src/scripts/ado/*` — entire ADO actuator (createADOWorkItem, closeADOWorkItem, WIQL dedupe)
- `src/scripts/version-bot/audit-log.ts` — JSONL run-log of ticket actions
- `src/scripts/version-bot/render-ticket.ts` — story body + acceptance-criteria rendering
- `src/scripts/version-bot/changelog.ts` — CHANGELOG.md / GitHub Releases at render time
- `src/scripts/version-bot/usage-inventory.ts` — per-ticket Code Search (until A8)
- `src/scripts/version-bot/cache.ts` — local JSON writer for the dashboard
- `src/scripts/version-bot/findings.ts` collapse-and-write helpers
- `src/scripts/version-bot/types.ts` — shapes downstream code depends on
- `src/commands/version-tickets.ts` — the writer command
- `demo/dashboard.html`, `demo/runbook.html` — UI unchanged
- `demo/server.mjs` — keeps serving local cache; only the footer changes (Step 4)

The quarterly cron, env vars (`GH_TOKEN`, `ADO_PAT`), CLI surface, and JSONL audit format all stay identical.

---

## Step-by-step

### Step 0 — Pre-work: reconcile the two discovery models (blocker)

**Resolves the `@alaskaairlines` mystery** flagged in the original plan as open question §4. Verified 2026-05-20 via `npm view`:

| Package | npm registry response |
|---|---|
| `@alaskaairlines/auro-button` | **404 — not found** |
| `@alaskaairlines/auro-input` | **404 — not found** |
| `@alaskaairlines/auro-icon` | **404 — not found** |
| `@alaskaairlines/auro-dialog` | **404 — not found** |
| `@alaskaairux/auro-button` (control) | ✅ v6.6.0 |

**Conclusion:** the `@alaskaairlines/*` namespace never existed on npm. The 4 entries in `auro-scan/src/lib/catalog/auro-packages.ts:313-333` are faulty data — they match nothing real.

**The actual gap.** Two different discovery models:

- **bot** does namespace-prefix matching (`scan.ts:298-304`): anything `startsWith("@aurodesignsystem/")` or `startsWith("@alaskaairux/")`. Open-world inside those two scopes. `policy-catalog.ts` is only a *policy* surface (12 entries flagging known deprecations); it does not gate discovery.
- **scan** does closed-list matching against `AURO_PACKAGES` (~50 `@aurodesignsystem/*` entries plus 4 phantom `@alaskaairlines/*` entries). Anything not in the list is silently dropped by `normalizeManifestEvidence`.

**What each tool actually catches:**

| Scope | bot | scan |
|---|---|---|
| `@aurodesignsystem/*` | ✅ all (prefix) | ✅ all enumerated in catalog |
| `@alaskaairux/*` (real legacy) | ✅ all (prefix) | ❌ not in catalog → invisible |
| `@alaskaairlines/*` | n/a — not real | 👻 4 phantom entries matching nothing |
| brand-new `@aurodesignsystem/*` | ✅ caught by prefix | ❌ not yet in catalog → invisible |

**Net effect of cutting over today:** the bot loses visibility into every `@alaskaairux/*` consumer. This is the real loss; the `@alaskaairlines/*` "scan-only" coverage was illusory.

**Resolution — scan-side cleanup + discovery fix:**

1. **Delete the 4 phantom `@alaskaairlines/*` entries** from `auro-scan/src/lib/catalog/auro-packages.ts:313-333`. No consumer can pin them.
2. **Add `@alaskaairux/*` discovery** to scan. Two ways, pick one:
   - **(preferred) Switch to namespace-prefix discovery** for known Auro scopes (`@aurodesignsystem/`, `@alaskaairux/`). Aligns with A6. Matches the bot's behavior and future-proofs against new publishes.
   - **Enumerate all `@alaskaairux/*` packages** in `AURO_PACKAGES`. Keeps the closed-list model. Minimum coverage: `@alaskaairux/auro-button`, `@alaskaairux/auro-icon`, `@alaskaairux/auro-popover`, `@alaskaairux/icons`. Spot-check `npm search @alaskaairux` for any others.

**Bot-side:** no change needed. Bot already catches everything real.

**Owner:** auro-scan team.

**Exit criteria:** paired-run audit baseline (Step 5) shows scan and bot detect the same set of packages.

---

### Step 1 — Wait for auro-scan prerequisites to land

These items live in the auro-scan repo. The auro-cli work in Steps 2–4 is blocked on them.

| Item | What | Why the bot needs it | T-shirt |
|---|---|---|---|
| A1 | Per Step 0: (a) delete 4 phantom `@alaskaairlines/*` entries, (b) add `@alaskaairux/*` discovery (prefix-match preferred), (c) port the 3 `@alaskaairux/*` deprecation entries from bot's `policy-catalog.ts` (auro-button, auro-icon, auro-popover) into scan's `PACKAGE_POLICY_CATALOG` | So scan detects what the bot detects | S |
| A2 | Port `resolveLatestAcrossAliases` (from auro-cli's `aliases.ts` + `npm-registry.ts`) into scan's npm client | So "majors behind" is computed against the `@aurodesignsystem/*` successor, not the legacy package's stale last-published version | S |
| A3 | Add `notes` column to `compliance_findings` + propagate from catalog | The bot renders an incident callout from `notes` — without it, the "we know about this, here's why we pinned" feature dies. **DB change — see working agreement above.** | M |
| A4 | Persist `successor_package`, `majors_behind`, `manifest_paths` columns on `compliance_findings` | The bot reads these at ticket-render time. **DB change — see working agreement above.** | M |
| A5 | Worst-case pin collapse across manifests in one repo (server-side) — see auro-cli's `findings.ts:148-162` for reference logic | One ADO ticket per (repo, package), not one per manifest | M |
| A6 | Open-world detection backstop for unknown packages in the prefix-matched namespaces | New components don't go invisible until someone updates the catalog | S |
| A7 | REST endpoints: `/api/findings`, `/api/candidates`, `/api/findings/by-repo?repo=X`, `/api/scan-runs?org=X&limit=10` | The bot's HTTP surface | M |
| A8 | *(deferred)* Source-evidence integration in tickets — populate the "Where this package is used in your codebase" section from `usage_evidence` rather than running a fresh Code Search at render time | Removes a Code Search call per ticket; uses richer data scan already has | L — defer until A1–A7 land and bot is reading from scan |

**Plus:** decide the auth model and where scan runs (open questions §1–§2 below). The bot's CI cron has to be able to reach scan's REST API on a schedule.

**Exit criteria:** A1–A7 deployed to scan; REST endpoints respond with the expected shapes against `Alaska-ECommerce`; database migrations reviewed and approved per the working agreement.

---

### Step 2 — Add `scan-client.ts` to auro-cli (B1)

**New file:** `src/scripts/version-bot/scan-client.ts`

A thin HTTP client. Three functions, each returning objects shape-compatible with the existing types in `src/scripts/version-bot/types.ts`:

```
fetchLatestFindings({ org }): Promise<ComplianceFinding[]>
fetchLatestCandidates({ org }): Promise<UpgradeCandidate[]>
fetchScanRunMeta(runId): Promise<{ id, completedAt, org }>
```

Key design points:

- **Shape compatibility is the contract.** scan's REST payload may have extra fields; the client maps them onto `ComplianceFinding` / `UpgradeCandidate` exactly so nothing downstream — ticket renderer, dashboard API, dedupe queries — has to change.
- **Resolve "latest" run lazily.** Default to `scan_run_id=latest`, but `fetchLatestCandidates` can accept an explicit run id for reproducible CI runs.
- **No fallback to local scan.** Per open question §5, when scan's API is down, the bot fails loudly. Centralization defeats its own purpose if both code paths exist.
- **Auth.** Whatever Step 1 decided (static API token, GH token, no-auth-internal-network) lives here. Read from `SCAN_API_BASE` + `SCAN_API_TOKEN` env vars to keep CI configuration simple.

**Tests:** mock the HTTP layer; assert returned objects pass through `findings.ts` collapse helpers without modification.

---

### Step 3 — Gut `scan.ts` to a thin orchestrator (B2)

**File rewritten:** `src/scripts/version-bot/scan.ts`

Before — `runScan()` is 100+ lines (`scan.ts:48-164`) that:
1. Authenticate with `GH_TOKEN`
2. List archived Auro packages (Octokit, `scan.ts:199-218`)
3. List `Alaska-ECommerce` repos (Octokit, `scan.ts:173-197`)
4. Discover manifests (`discoverAuroManifests`)
5. Fetch each `package.json` (Octokit `getContent`, `scan.ts:265-290`)
6. Build a per-repo cache entry
7. Resolve npm latest for every distinct package (`resolveLatestAcrossAliases`)
8. Build findings (`buildComplianceFindings`)
9. Collapse candidates (`collapseCandidatesByPackage`, `scan.ts:381-450`)
10. Write all three JSON files

After — `runScan()` is roughly:

```ts
const findings   = await scanClient.fetchLatestFindings({ org })
const candidates = await scanClient.fetchLatestCandidates({ org })
const runMeta    = await scanClient.fetchScanRunMeta(findings[0]?.scanRunId)

writeComplianceFindings(findings, options.outputDir)
writeUpgradeCandidates(candidates, options.outputDir)
// scan cache file: optional — kept as a thin "last-fetch" marker for the dashboard
writeScanCache(
  { version: 2, lastFullScan: runMeta.completedAt, repos: {} },
  options.outputDir,
)

return { /* summary numbers from the arrays */ }
```

Critically:

- **`collapseCandidatesByPackage` is redundant after A5.** scan does the per-repo manifest collapse server-side, so `fetchLatestCandidates` already returns one row per (repo, package). The bot-side collapse becomes a no-op and can move to a unit test asserting the API is doing it right. The function deletes with Step 7.
- **The cache shape evolves to a marker.** `repos: {}` stays empty since the bot no longer holds per-repo manifest state. If `demo/server.mjs` reads from `cache.repos`, that path needs to switch to reading findings/candidates directly. Verify before deleting anything. **Cache-JSON shape change — see working agreement.**
- **Caller (`src/commands/version-scan.ts`) update is trivial.** The `--force` flag becomes "force a fresh scan-run fetch" rather than "ignore pushed_at"; update the help text. Everything else stays.

**Exit criteria:** `auro version-scan` produces `.cache/version-bot/auro-compliance-findings.json` and `auro-upgrade-candidates.json` shape-identical to today's output for a given snapshot of scan data.

---

### Step 4 — Surface scan-run lineage in the dashboard (B5)

**File touched:** `demo/server.mjs` — only the `serveFindings` function (or equivalent).

Add to the dashboard footer:

```
Source: auro-scan run <runId>, fetched <ISO timestamp>
```

The footer line makes data lineage obvious. No HTML changes required if the API just enriches the JSON payload; pick that up in `dashboard.html` if needed.

---

### Step 5 — Validate via paired-run audit

The single most important validation step. Run **before** any code merges (to baseline), then again after Step 3 (to confirm parity).

**Procedure:**
1. Pick a stable point in time. Run `auro version-scan` against `Alaska-ECommerce`. Snapshot `.cache/version-bot/auro-compliance-findings.json`.
2. Same point in time. Run scan's full scan against the same org. Snapshot the findings table to JSON via REST.
3. Normalize both to `{repo, package, status, declaredVersion}` triples.
4. Diff and categorize each discrepancy:
   - **bot-only** — packages bot sees but scan doesn't. After A1 fix, this should be near zero. Anything left is investigation.
   - **scan-only** — packages scan sees but bot doesn't. Expected: scan finds packages via lockfile that aren't in package.json. Acceptable category; document the count.
   - **status mismatch** — both see the package but disagree on status. Should be zero (same `evaluatePackage`). Anything here is a real bug.
   - **declaredVersion mismatch** — both see the package but disagree on what's declared. Should be zero. Investigate any.

**Cutover criterion:** bot-only = 0, status-mismatch = 0, declaredVersion-mismatch = 0. scan-only count documented and explained.

**Owner of the audit:** whoever runs the integration. Probably Jordan or the auro-scan lead.

---

### Step 6 — Cutover quarter

Run B2-bot against scan for one full quarterly cron cycle in dry-run mode. Diff the would-create tickets against what the legacy code path would have produced (kept around until Step 7). If parity holds, flip the cron to `--apply` against scan.

**Handle the new `Review needed` status (open question §7).** scan emits this when it finds deprecated APIs in source. The bot's ticket renderer has no template for it. Either add one OR filter `fetchLatestCandidates` to `status in ('Behind','Unsupported')` for now and revisit when A8 (source-evidence in tickets) lands.

---

### Step 7 — Delete dead code (B3)

After one stable quarterly run, remove:

- `src/scripts/version-bot/manifest-discovery.ts` — scan owns discovery
- `src/scripts/version-bot/npm-registry.ts` — scan owns npm-latest
- `src/scripts/version-bot/aliases.ts` — scan owns cross-scope resolution
- `src/scripts/version-bot/evaluate.ts` — scan owns evaluation
- `src/scripts/version-bot/policy-catalog.ts` — scan owns the catalog
- `collapseCandidatesByPackage` from `scan.ts` (A5 covers it server-side)
- Their corresponding `.test.ts` files

`npm run build` and `npm run test` must stay clean. Some unit tests move to scan; some delete with the code they covered.

---

## File-by-file impact

### auro-scan additions

- `src/lib/catalog/auro-packages.ts` — delete 4 phantom entries, add legacy scope coverage (A1)
- `src/lib/catalog/package-policy-catalog.ts` — add `notes` field + 3 ported `@alaskaairux/*` deprecation entries (A1, A3)
- `src/lib/registry/npm.ts` — cross-scope alias resolution (A2)
- `src/lib/findings/rollups.ts` (new) — worst-case pin collapse (A5)
- `src/lib/scanner/run-scan.ts` — open-world backstop, propagate new fields (A3, A4, A6)
- `src/lib/data/migrations/006_policy_notes.sql` (A3) — **DB migration, flag per working agreement**
- `src/lib/data/migrations/007_finding_metadata.sql` (A4) — **DB migration, flag per working agreement**
- REST API server source — new endpoints (A7)

### auro-cli additions

- `src/scripts/version-bot/scan-client.ts` (B1)

### auro-cli rewrites

- `src/scripts/version-bot/scan.ts` — gutted to ~30 lines wrapping scan-client (B2)
- `src/commands/version-scan.ts` — help text + `--force` semantics (B2)
- `demo/server.mjs` — add scan-run id to dashboard footer (B5)

### auro-cli deletions (after stable quarterly run)

- `src/scripts/version-bot/manifest-discovery.ts`
- `src/scripts/version-bot/npm-registry.ts`
- `src/scripts/version-bot/aliases.ts`
- `src/scripts/version-bot/evaluate.ts`
- `src/scripts/version-bot/policy-catalog.ts`
- Their associated `.test.ts` files

### Untouched in auro-cli (preservation list)

Listed in full under "What stays in auro-cli" above.

---

## Verification end-to-end

1. **A1–A7 deployed.** `curl $SCAN_API_BASE/api/candidates?org=Alaska-ECommerce` returns rows with `successorPackage`, `majorsBehind`, `manifestPaths`, `notes` populated.
2. **B1 unit tests.** `scan-client` returns objects that flow through `writeComplianceFindings` / `writeUpgradeCandidates` without type errors.
3. **B2 integration.** `auro version-scan --output-dir /tmp/scan-output` writes the same three JSON files; diff against a same-day legacy scan shows acceptable scan-only delta and zero bot-only / status / declaredVersion drift.
4. **B5 dashboard.** Footer shows `Source: auro-scan run <id>, fetched <ts>`.
5. **Cutover quarter.** Dry-run ticket diff between legacy and new bot is empty (or explained).
6. **B3 cleanup.** `npm run build` clean; `npm run test` clean; deleted files have no remaining imports (`grep -r "manifest-discovery\|npm-registry\|policy-catalog" src/` returns nothing).

---

## Sequencing & rough timing

- **Phase 0 — Verification (1–2 days, blocking):** Resolve Step 0; run paired-run audit to baseline discrepancies before any integration work.
- **Phase 1 — Scan-side data shape (~1 week, parallelizable):** A1, A2, A3, A4, A5, A6 in parallel. A7 (REST API) depends on A3 + A4 schema landing.
- **Phase 2 — Validation (1 day):** Re-run paired-run audit. Discrepancy count should be ≤ baseline.
- **Phase 3 — Bot integration (~3 days):** B1 then B2 in series; B5 alongside B2.
- **Phase 4 — Production cutover (1 quarterly run):** Side-by-side dry-run diff with legacy code path. If parity holds, sign off.
- **Phase 5 — Cleanup (1 day):** B3 deletions.
- **Phase 6 — Deferred:** A8 (source-evidence in tickets) — separate sprint.

---

## Open questions and risks

1. **Auth model.** auro-cli's bot uses `GH_TOKEN` and `ADO_PAT` env vars in CI. auro-scan is a desktop Tauri app reading from the user's keychain. How does the bot authenticate to scan's REST API? Options: (a) static API token per service, (b) shared GH token for read auth, (c) no auth on internal network only. Needs decision before A7 lands.
2. **Where does scan run?** Bot's quarterly cron runs in GitHub Actions. Scan today runs on a developer's laptop. Does scan run as a server, or does the bot just read the most recent scan a developer ran? The latter is dangerous (stale data); the former requires a deployment story scan doesn't have today.
3. **Catalog update workflow.** Today the bot's policy catalog is engineer-editable in `auro-cli/src/scripts/version-bot/policy-catalog.ts`. After migration, this moves to scan. Who updates it? How does it flow back to the bot's quarterly cron? Catalog release cadence vs scan deployment vs bot cron need to align.
4. ~~**`@alaskaairlines` mystery.**~~ Resolved 2026-05-20: never existed on npm. See Step 0.
5. **Loss of bot-side discovery if scan is down.** Today bot can scan independently if scan is broken. After integration, bot dies if scan's REST API is unreachable. Acceptable for a quarterly cron; would not be for real-time. Should there be a fallback? Lean no (centralization defeats the purpose if both code paths exist), but flag explicitly.
6. **Lockfile resolution.** Scan reads lockfiles; bot doesn't. After migration, the bot's findings will be more accurate (resolvedVersion populated where today it's null). Tickets may suddenly cite actually-resolved versions instead of pin ranges. Validate ticket templates handle this gracefully before cutover.
7. **`Review needed` source-API status.** Scan flips status to `Review needed` when deprecated APIs are detected in source. Bot today never emits `Review needed`. After migration, tickets may arrive for status `Review needed` — which the bot's ticket renderer doesn't template. Either add a renderer OR filter to `Behind|Unsupported` only until A8 lands.
8. **Auro Counter package.** Loose end — `@aurodesignsystem/auro-counter`'s catalog presence needs confirmation. Whichever side owns the catalog post-migration needs to resolve this.

---

## Provenance — how this analysis was produced

Field-by-field comparison, schema diff, and commit-history analysis came from a research agent run in an auro-cli session on 2026-05-19, then refined on 2026-05-20 (npm registry verification of `@alaskaairlines/*` non-existence). To reproduce:

1. Read scan code: `auro-scan/src/lib/scanner/{collector,manifests,detectors,run-scan,code-search}.ts`, `auro-scan/src/lib/findings/evaluate.ts`, `auro-scan/src/lib/data/migrations/*.sql`, `auro-scan/src/lib/catalog/*.ts`.
2. Read bot code: `auro-cli/src/scripts/version-bot/*.ts`.
3. Diff `evaluatePackage` in both (currently identical).
4. Diff the policy catalogs (different sizes; bot is policy-only, scan combines discovery + policy).
5. Compare cache file shapes against SQLite schema (`.cache/version-bot/*.json` vs `auro-scan/src/lib/data/migrations/001_init.sql`).
6. `npm view @alaskaairlines/<pkg>` for each of the 4 suspect entries to verify (all return 404).
