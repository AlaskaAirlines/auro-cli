# PT-M0 Completion Plan — Land Tier 1 CLI Primitives (PR #302)

This document tracks the actions required to resolve the PT-M0 task and satisfy
the first milestone of the Phase 1 Auro AI Tooling story.

## Tickets

| Ticket | Type | Title | State |
| --- | --- | --- | --- |
| [AB#1628540](https://itsals.visualstudio.com/E_Retain_Content/_workitems/edit/1628540) | Task | PT-M0 — Land Tier 1 CLI primitives (PR #302) | New |
| [AB#1628539](https://itsals.visualstudio.com/E_Retain_Content/_workitems/edit/1628539) | User Story | Phase 1 — Auro AI Tooling: Standalone Grounding (no MCP) | Committed |

PT-M0 is the first milestone of the Phase 1 story. It turns PR #302 into a
merged, released CLI that acts as the **data layer** for the later `auro init`
work (PT-M1…M4). The parent story's acceptance checklist restates PT-M0's
"done when" verbatim, so resolving this task ticks the first box of the story.

## Task breakdown

The ticket defines five tasks. Mapped against the current repo state:

| # | Ticket task | Current state | Action needed |
| --- | --- | --- | --- |
| 1 | Rebase PR #302 on current auro-cli, resolve conflicts | Branch `jbaker/AITooling` is 0 commits behind `origin/dev`; `mergeable: MERGEABLE` | Done — nothing to rebase |
| 2 | Verify 4 surfaces end-to-end: `auro context`, `auro component --json`, `auro cem`, `llms.txt` discoverability | Manual test plan [test/manual-testing-ai-tooling.md](../test/manual-testing-ai-tooling.md) executed against a real project — all cases pass; `llms.txt` confirmed discoverable | Done — all four surfaces verified |
| 3 | Confirm graceful skip for packages shipping no CEM | Test plan § M0-5 executed with a no-CEM package (`auro-icon`) — skips gracefully, no error | Done |
| 4 | Address net-new gaps found while prototyping `auro init` | Done — earlier gaps addressed on-branch: live-manifest enrichment (`258f45d`), local `node_modules` resolution + outdated-install flagging (`e427b72`), stalled-request timeout (`fa5440b`), attribute-field dedupe (`e03b48e`). A throwaway `auro init` prototype ([scripts/proto-init.mjs](../scripts/proto-init.mjs)) then drove the full flow offline and online: no further **data-layer** gaps found — every artifact is produced correctly. The only remaining gaps are composability/reuse refactors that belong to PT-M1 (see [PT-M1 handoff](#pt-m1-handoff--gaps-from-the-auro-init-prototype)) | Done |
| 5 | Merge, cut a release, verify published CLI installable / npx-able | PR #302 is a draft; CI green (all `test` matrix jobs pass); only review is `sourcery-ai` bot | Mark ready → merge → release → `npx` smoke-test (test plan § M0-6) |

## Action checklist

1. ~~**Verify the four surfaces** (task 2)~~ — **Done.** Executed
   [test/manual-testing-ai-tooling.md](../test/manual-testing-ai-tooling.md)
   against a real project: `auro context` (incl. local enrichment + outdated
   check), `auro component <name> --json` (local-first vs unpkg), `auro cem`, and
   `llms.txt` discoverability — all cases pass.
2. ~~**Confirm no-CEM graceful skip** (task 3)~~ — **Done.** Ran test plan § M0-5
   with a package that ships no manifest; it skips gracefully rather than
   erroring.
3. ~~**Finish prototyping `auro init`** (task 4)~~ — **Done.** Earlier gaps are
   already addressed on-branch (local `node_modules` resolution, outdated-install
   flagging, request timeouts, field dedupe). A throwaway prototype
   ([scripts/proto-init.mjs](../scripts/proto-init.mjs)) then composed the full
   `auro init` flow from the data layer and ran it offline and online against a
   scratch project — all artifacts (context doc, aggregate CEM, per-component
   API, outdated banner) are produced correctly. **No further data-layer gaps.**
   The remaining gaps are composability refactors for PT-M1, recorded in
   [PT-M1 handoff](#pt-m1-handoff--gaps-from-the-auro-init-prototype) below.
4. **Take PR #302 out of draft.** It is currently `isDraft: true` and
   `reviewDecision: REVIEW_REQUIRED`, with only the Sourcery bot having
   commented. The ticket says "already approved — not a re-review," but GitHub
   shows no human approval, so mark it ready and get the approving review
   recorded before merge.
5. **Merge PR #302** into `dev`.
6. **Cut a release** and verify the published CLI installs / `npx`-runs with
   zero setup.
7. **Admin** — assign AB#1628540 to yourself and move New → Active, then →
   Resolved/Closed when the release is verified. This also satisfies the
   "PT-M0 done" line on parent story AB#1628539.

## Current blockers

- **PR #302 is still a draft** — merge is impossible until it is marked ready.
- **No approving review is recorded on GitHub** (only the Sourcery bot). Despite
  the ticket note, a real approval is required before the merge can land.

Everything else (rebase, CI, conflicts) is already green.

## PT-M1 handoff — gaps from the `auro init` prototype

The throwaway prototype ([scripts/proto-init.mjs](../scripts/proto-init.mjs),
kept untracked for re-runs) composed the intended `auro init` flow — detect
installed components → build the AI context primer → aggregate the CEM → dump
per-component APIs → write assistant grounding → flag outdated installs — and ran
it offline and online. Everything worked and every artifact was correct, so
**none of these are PT-M0 defects.** They are surfaces that PT-M1 will need to
reuse but that are currently locked inside command actions; extracting them is
the natural first step of building the real command.

1. **No exported "detect installed components" surface.** The local
   `node_modules` scan + version capture lives privately in
   `context.ts#buildComponentTable`. `auro init` has to re-run the
   `AURO_COMPONENT_PACKAGES` fetch loop to learn what's installed. → Extract
   `detectInstalled(): Map<pkg, { version, manifest }>` into a util.
2. **Context enrichment isn't reusable in-memory.** `runContext()` couples
   generation with output (writes to stdout/file, calls `process.exit` on
   failure) and `buildComponentTable()` is private. init wants the context
   string in memory. → Extract a side-effect-free `buildContextDocument(): string`.
3. **CEM aggregation is trapped in the command action.** `cem.ts` has no
   exported aggregator; the `fetch → mergeManifests → partitionOutcomes →
   fail-on-transient` pipeline lives inside `.action()`. → Extract
   `buildAggregateManifest(packages): { manifest, skipped, transientFailures }`
   (also makes `cem.ts` directly testable).
4. **No assistant grounding/rules surface.** Nothing emits an `llms.txt`-style
   index or an editor rules file (Claude/Cursor/`AGENTS.md`) pointing at the
   generated artifacts. This is a deliberate PT-M1 format decision, not a
   data-layer gap.

Minor observations (not blocking): a component that is **installed but ships no
manifest** is indistinguishable from "not installed" in offline detection —
init may want to surface it. And `checkOutdated()` needs the registry, so init's
`--offline` path can't flag stale installs (document the tradeoff).

## Done when

PR #302 is merged and released; an engineer can prime an assistant and look up
any published component's API from the terminal with zero setup; the CLI is
ready to serve as the data layer for `auro init`.
