# CEM Contract Enforcement — keeping component CEM changes from breaking the AI tooling

**Status:** Proposal / future work (not started). Tracking doc for a follow-up
effort; no ticket cut yet.

**Owner surface:** spans two repo families — the **component repos**
(`auro-button`, `auro-formkit`, …) that *author* `custom-elements.json`, and
**auro-cli**, which *consumes* it to generate editor artifacts (VS Code
custom-data, JSX `.d.ts`, Svelte `.d.ts`, CSS `::part()` snippets). The
enforcement work therefore lands mostly in the component repos' CI + the shared
`/auro` Claude skills, with one new executable check built in (or published from)
auro-cli.

## Problem

The CEM (`custom-elements.json`) is the **untyped, unvalidated hand-off** between
the component teams and the AI tooling. Every AI-tooling failure observed so far
traces to a CEM change that was valid enough to publish but broke the generated
editor types — and because auro-cli hardens *defensively* against malformed
input, the component team never learns they broke anything. Silent degradation in
the consumer is the failure mode we want to convert into a **red PR in the
producer**.

Enforcement must live **at the point of authorship** (component-repo CI), gated by
the same `/auro` workflow the team already runs (ado → code-review → pr → commit).

### Failure modes seen so far (the regression set to guard)

| Failure mode | Symptom | Enforcement point |
| --- | --- | --- |
| Enumerated attr typed `type.text: "string"` (no union) — e.g. `variant` | Every value accepted; `variant="nope"` never errors; values don't complete | Contract check — **policy rule** (enumerated attrs must carry a union) |
| Member with **no `name`** (`auro-menu`) | Community generator crashes (`member.name.startsWith` on undefined) | Contract check — **structural** |
| Truncated / malformed `type.text` (`"Object<key"`, `auro-dropdown`) | Unparseable TypeScript spliced into the `.d.ts` | Contract check — **parseability / balanced delimiters** |
| Private-reflected attrs leak (`data-hover`, `data-active`) | Internal state surfaces as public autocomplete/props | Contract check — **warn** |
| Internal sub-components (`auro-menuoption`, …) surfaced | Non-existent import paths emitted (`…/auro-formkit/auro-menuoption`) | **exports-map cross-check** |
| CEM event colliding with a native name (`click`, `input`) | Handler intersection rejects legitimate `CustomEvent` handler | Already fixed in tooling (`overrideCollidingBaseEvents`); contract test proves it stays fixed |

auro-cli today already prunes nameless members / unbalanced `type.text`
([manifest.ts](../src/init/editors/manifest.ts) `buildManifest` hardening) and
filters private reflections — but that is a safety net, not a signal. This effort
adds the missing **signal back to the producer**.

## Strategy — five layers

Ordered highest-leverage first. The keystone is layers 1–2 (an executable contract
that fails the PR); 3–5 route human/process attention to that gate.

### 1. Build the contract as an executable check (keystone)

Ship `auro cem-check <path-to-custom-elements.json>` in auro-cli (or a standalone
`@aurodesignsystem/cem-guard`). One engine, consumed by both auro-cli's own suite
and the component repos' CI. It does two things:

- **Static validation** — the structural/policy rules:
  - valid against the CEM schema version;
  - every declaration/member has a **string `name`**;
  - every attribute `type.text` is **parseable, balanced delimiters**;
  - **enumerated attributes carry a real union, not bare `"string"`** (the
    `variant` contract — the check that would have caught the widening class of
    bug directly);
  - every registered element resolves to a **public `exports` subpath**;
  - **flag** private-backed, undescribed reflected attributes (warn, not fail —
    documented reflections with descriptions are legitimate).
- **End-to-end generation smoke** — run auro-cli's real builders
  (`buildJsxTypes` / `buildSvelteTypes`) against the candidate CEM and
  `tsc --noEmit` the output with `strictFunctionTypes: true`. Authoritative
  because it exercises the actual consumer path — same technique as
  [init.editors.svelte-tsc-smoke.test.ts](../test/init.editors.svelte-tsc-smoke.test.ts)
  and [init.editors.svelte-event-collision.test.ts](../test/init.editors.svelte-event-collision.test.ts).
  Generation throws or the `.d.ts` won't compile → the CEM broke the tooling.

This is the same engine as the deferred **manifest-driven per-component invariant
test** noted in the PT-M2 plan (see
[pt-m2-completion-plan.md](pt-m2-completion-plan.md) → Risks / open questions).
Build it once; expose it as a CLI; both consumers share it.

**Exit-code contract:** `0` = clean; non-zero = at least one **error** rule failed
(structural / parseability / union / exports). Warnings (private reflections) print
but do not fail unless a `--strict` flag is passed. Machine-readable `--json`
output for the pr/code-review skills to parse.

### 2. Make it a blocking CI gate in the component repos

One CI step, on any PR touching source or the regenerated CEM:

```
npx @aurodesignsystem/auro-cli cem-check ./custom-elements.json
```

Non-zero exit fails the check → PR can't merge. **Pin the auro-cli version** so the
contract is versioned and bumping it is a deliberate, reviewable event (mirrors
auro-cli's own exact-pin discipline). This is the control that turns "found out
after publish" into "the PR is red."

### 3. Wire it into the `/auro` skills

| Skill | Integration |
| --- | --- |
| **code-review** | Add a CEM-contract review dimension that triggers when a PR diff touches `custom-elements.json` or the `@property` / `@type` JSDoc that generates it. Confirm `cem-check` is green; a human confirms *intent* the static rule can't (e.g. an attr that legitimately became free-form). |
| **pr** | Auto-run `cem-check`, paste `--json` result into the PR body under a **"CEM / AI-tooling impact"** heading, and require the CI gate as a merge condition. Status visible on every PR. |
| **commit** | Already inspects for removed/renamed attributes, events, changed defaults → emits `BREAKING CHANGE:`. Enforce: **any CEM public-surface change (attribute/event rename or removal, union narrowing) must carry a BREAKING CHANGE trailer** — the semver + downstream-review signal in one. |
| **ado** | Definition of Done for any component task changing public API: "`cem-check` passes and downstream AI-tooling impact assessed." Skill flags CEM-affecting work and links it to the tooling story. |

### 4. Reverse consumer test in auro-cli (backstop for drift)

A **scheduled** CI job in auro-cli (nightly/weekly) that installs the *latest
published* `auro-button` + `auro-formkit`, runs the full builder + `tsc` smoke
against their real CEMs, and fails if generation degrades. Catches the case where a
component ships without the gate (older branch, hotfix, external contribution). The
producer-side gate (layer 2) *prevents*; this one *detects*.

### 5. Codify the contract + semver policy

Write **"The CEM contract for AI tooling"** into auro-cli docs (the invariants:
parseable `type.text`, names present, unions for enumerated props, exports-gated
elements, descriptions on intentional reflections) and link from each component
repo's CONTRIBUTING. Reasons:

- `cem-check` failures should point at a spec section with the fix (e.g. "add
  `@type {'primary'|'secondary'|…}` — see auro-button's `#653` fix");
- reviewers need a shared definition;
- state the rule plainly: **a CEM contract break is a major semver bump.**

## Recommended rollout order

1. Extract the invariant/generation engine into `auro cem-check` (the builders +
   smoke harness already exist — this is mostly surfacing them as a CLI + adding
   the static rule set).
2. Land it as a **non-blocking** CI step in `auro-button` to gather signal.
3. Write the contract spec; fix any existing violations it surfaces.
4. Flip the gate to **blocking**; roll to `auro-formkit`.
5. Wire the `/auro` skill touchpoints (code-review dimension, pr auto-run, commit
   breaking-change rule, ado DoD).
6. Turn on the auro-cli scheduled reverse-consumer job.

The single highest-value move is **#1 + #4** (an executable contract that fails the
PR). Everything else routes attention to that gate — without it, the `/auro` skills
have nothing objective to enforce against.

## Relationship to existing work

- **Prior art in auro-cli** — the defensive hardening this effort complements:
  `buildManifest` pruning of nameless members / unbalanced `type.text` and the
  private-reflection filter ([manifest.ts](../src/init/editors/manifest.ts)); the
  `tsc` smoke tests
  ([init.editors.tsc-smoke.test.ts](../test/init.editors.tsc-smoke.test.ts),
  [init.editors.svelte-tsc-smoke.test.ts](../test/init.editors.svelte-tsc-smoke.test.ts));
  the event-collision regression
  ([init.editors.svelte-event-collision.test.ts](../test/init.editors.svelte-event-collision.test.ts)).
- **PT-M2 open items this connects to** — the deferred manifest-driven
  per-component invariant test, and the internal-sub-component / exports-map gate
  (both in [pt-m2-completion-plan.md](pt-m2-completion-plan.md) → Risks / open
  questions). The exports-map work is a shared dependency: `cem-check`'s
  "registered element resolves to a public subpath" rule wants the same
  exports-map capture proposed there.
- **Upstream** — the `variant` union fix pattern lives in auro-button
  (`feat: improve CEM for editor IntelliSense #653`): JSDoc `@type` annotations the
  analyzer emits as `type.text` unions. `cem-check`'s union rule enforces that
  pattern going forward.

## Open questions

- ❓ **Where does the engine live** — a subcommand in auro-cli (`auro cem-check`),
  or a standalone `@aurodesignsystem/cem-guard` the component repos depend on
  directly? Subcommand reuses the builders in-process (less duplication); standalone
  decouples the component repos from the full CLI. Lean subcommand.
- ❓ **Union-rule scope** — which attributes are "enumerated" and thus *must* carry
  a union? A fixed allowlist (`variant`/`shape`/`size`/`type`/`appearance`) is
  brittle; inferring intent from the source `@property` is better but harder.
  Possibly: warn on *any* bare-`string` attr whose name matches a known-enumerated
  set, error only on a curated core.
- ❓ **Contract-version bumps** — when `cem-check` tightens a rule, every pinned
  component repo sees new failures on its next bump. Need a changelog + migration
  note discipline for the check itself (it is itself a contract).
- ❓ **Non-blocking → blocking cutover** — how long to run advisory before flipping,
  and whether to grandfather existing violations behind a baseline file.
