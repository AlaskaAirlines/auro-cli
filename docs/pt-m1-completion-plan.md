# PT-M1 Completion Plan — `auro init` v1 (scoped grounding file)

This document tracks the work required to resolve PT-M1 and tick the second box
of the Phase 1 Auro AI Tooling story. Where PT-M0 landed the **data layer** (PR
#302), PT-M1 builds the first **generator** on top of it: an `auro init` command
that writes a project-scoped AI grounding file listing exactly the Auro
components a project has installed.

## Tickets

| Ticket | Type | Title | State |
| --- | --- | --- | --- |
| [AB#1628541](https://itsals.visualstudio.com/E_Retain_Content/_workitems/edit/1628541) | Task | PT-M1 — `auro init` v1 (scoped grounding file) | New |
| [AB#1628539](https://itsals.visualstudio.com/E_Retain_Content/_workitems/edit/1628539) | User Story | Phase 1 — Auro AI Tooling: Standalone Grounding (no MCP) | Committed |

PT-M1 is the parent story's "highest-leverage" task: it turns "install → grounded
AI" into something real. Effort estimate on the ticket is **~1.5–2.5 ew**, with a
note to **freeze the file format early** (bus-factor mitigation) and prioritise so
the flow is real by ~end-S2.

## What PT-M0 already gives us (data-layer inventory)

The `auro init` prototype ([scripts/proto-init.mjs](../scripts/proto-init.mjs),
kept untracked) already composed the intended flow end-to-end, so we know exactly
which surfaces exist and which are still trapped. Reusable today:

| Surface | Location | Reuse in PT-M1 |
| --- | --- | --- |
| Version-pinned manifest resolution (local `node_modules` first, unpkg fallback, timeout, transient-vs-404) | [fetchManifest.ts](../src/utils/fetchManifest.ts) `fetchManifest()` | **This is "the exact resolution path from PR #302"** the ticket says to reuse so Tier 0/Tier 1 never disagree. Local read is already version-pinned (`preferLocal` + no ref → installed copy + `version`). |
| Outcome partitioning (skip vs transient failure) | [fetchManifest.ts](../src/utils/fetchManifest.ts) `partitionOutcomes()` | Same fail-on-transient semantics for init's aggregation. |
| Manifest merge into one aggregate | [mergeManifests.ts](../src/utils/mergeManifests.ts) `mergeManifests()` | Aggregating a multi-component set. |
| Per-component API rendering (tag, attributes, properties/methods, slots, events, CSS parts, install lines) | [formatComponent.ts](../src/utils/formatComponent.ts) `formatDeclaration()` | The API body of each component's `AGENTS.md` section — but its import/registration lines need to become prefix- and subpath-aware (see below). |
| CEM typing + description cleanup | [cem.ts](../src/utils/cem.ts) `Manifest`, `CemDeclaration`, `clean()` | Declaration walking + text sanitising. |
| Curated package list | [auroComponents.ts](../src/static/auroComponents.ts) `AURO_COMPONENT_PACKAGES` | Candidate set to test for local installation. |
| Latest-version lookup | [fetchManifest.ts](../src/utils/fetchManifest.ts) `fetchLatestVersion()` / [outdated.ts](../src/utils/outdated.ts) | Optional outdated advisory (network-only). |

## Gaps carried forward from the PT-M0 handoff

The prototype recorded four surfaces PT-M1 needs but that are currently locked
inside command actions. These are the first, mechanical extractions:

1. **No exported "detect installed components".** The `node_modules` scan +
   version capture lives privately in
   [context.ts](../src/commands/context.ts) `buildComponentTable`. → Extract a
   reusable `detectInstalled()`.
2. **Context enrichment isn't reusable in-memory.** `runContext()` couples
   generation with output (stdout/file, `process.exit` on failure). Not directly
   needed by init's output, but the same private-behind-the-action shape recurs.
3. **CEM aggregation is trapped in the command action.** [cem.ts](../src/commands/cem.ts)
   `runCem()` inlines `fetch → mergeManifests → partitionOutcomes →
   fail-on-transient`. → Extract `buildAggregateManifest(packages)`.
4. **No assistant grounding/rules surface.** Nothing emits an `AGENTS.md`-style
   file. This is PT-M1's core new artifact — a deliberate format decision.

## What's net-new in PT-M1 (beyond the data layer)

Everything below has **no existing surface** and is the bulk of the work:

- The `init` command itself and its output writer (`AGENTS.md` + `CLAUDE.md`).
- **Multi-component (monorepo) handling** — e.g. `@aurodesignsystem/auro-formkit`
  is one package that ships one aggregated `custom-elements.json`, per-component
  subpath exports (`@aurodesignsystem/auro-formkit/auro-input`, verified against
  `6.1.0`), and a single shared version. init must enumerate **all** components
  the package ships, emit the correct subpath import per component, and treat the
  package version as shared.
- **Legacy-standalone-vs-monorepo dedupe** — if both a monorepo and a legacy
  standalone package register the same component, detect and warn/prefer one.
- **Prefix + custom-registration system** — a CLI-owned config (default prefix +
  per-component overrides), an AST scan for existing `Component.register('...')`
  calls, prefix inference, and mixed-prefix resolution. None of this exists today.
- **Auro coding rules** content block embedded in the grounding file.
- **Idempotent regeneration** driven by the persisted config.

## Proposed architecture

The ticket requires data resolution to be **isolated behind a single module** so a
Phase-2 shared core can replace it without touching the generator. Proposed layout
under a new `src/init/` directory:

| Module | Responsibility | Notes |
| --- | --- | --- |
| `src/commands/init.ts` | Commander wiring + orchestration + prompts + writing files | Thin; mirrors `context.ts`/`cem.ts`. Registered in [index.ts](../src/index.ts). |
| `src/init/resolver.ts` | **The single data module.** Detect installed `@aurodesignsystem/*`, resolve each CEM at its installed version, and **normalise single-component and aggregated multi-component CEMs into one flat `ResolvedComponent[]`**. | Wraps `fetchManifest`/`mergeManifests`; the Phase-2 seam. Emits `{ pkg, version, tagName (bare auro-*), declaration, importPath, isMonorepo }`. |
| `src/init/registry.ts` | Prefix + custom-registration logic: config load/save, AST scan, prefix inference, mixed-prefix resolution | Uses the TypeScript compiler API (already a dep) for the AST scan. |
| `src/init/generator.ts` | Render `AGENTS.md` from `ResolvedComponent[]` + resolved tags + coding rules; render `CLAUDE.md` thin import; structured for future targets (`copilot-instructions.md`) | Pure/side-effect-free string builders; reuses `formatDeclaration` for the API body. |
| `src/init/rules.ts` (or a template asset) | The static "Auro coding rules" block | Frozen early per the ticket note. |

Import-path derivation lives in the resolver: a standalone package imports as
`import "@aurodesignsystem/auro-button"`; a monorepo component imports via its
subpath export `import "@aurodesignsystem/auro-formkit/auro-input"`. This replaces
the fixed `import "${pkg}"` line currently hard-coded in `formatDeclaration`.

## Task breakdown

> **This is a requirements-coverage matrix, not the build sequence.** The `#`
> column is the *ticket's* task number, not implementation order (task #1 "add
> the `init` command" is actually built near-last). Use
> [Build order / action checklist](#build-order--action-checklist) for the
> ordered steps; check this table to confirm every ticket task is covered before
> calling M1 done.

Ticket tasks mapped against current repo state:

| # | Ticket task | Current state | Action needed |
| --- | --- | --- | --- |
| 1 | Add an `init` command | No `init` command exists | New `src/commands/init.ts`; register in [index.ts](../src/index.ts) alongside `context`/`cem`. |
| 2 | Detect installed Auro packages via `package.json`/`node_modules` | Logic private in `context.ts#buildComponentTable`; `fetchManifest` already does local reads | Extract `detectInstalled()` into `resolver.ts`; drive off installed deps, not the full curated list. |
| 3 | Resolve each CEM at the installed version (never "latest"), reusing PR #302 path | `fetchManifest({preferLocal,no ref})` already version-pins local reads | Reuse as-is inside the resolver. |
| 4 | Isolate resolution behind one module; normalise single + aggregated CEM into the same component list | No such module; merge exists but no normaliser | `resolver.ts` producing `ResolvedComponent[]` — the Phase-2 seam. |
| 5 | Generate `AGENTS.md` (canonical) listing only installed components with full API + coding rules; `CLAUDE.md` as thin `@AGENTS.md` import | `formatDeclaration` renders API but with fixed `import "${pkg}"`; no file writer, no rules block, no `CLAUDE.md` | `generator.ts` + `rules.ts`; make import/registration lines prefix/subpath-aware. |
| 6 | Multi-component packages (monorepos): enumerate all shipped components, subpath imports, shared version, legacy-vs-monorepo dedupe warning | None; `mergeManifests` aggregates but nothing enumerates-per-package or derives subpaths | Resolver: walk the package's aggregated CEM, emit one `ResolvedComponent` per declaration, derive subpath import, flag duplicate tags across packages. |
| 7 | Default to custom registration via a `--prefix`/prompt; persist default + per-component override map in CLI-owned config; idempotent regeneration; warn on bare `auro-*` fallback; optionally scaffold `register('')` | Nothing — no config; `inquirer` v12 already a dep | `registry.ts` + config schema; reuse existing `inquirer` with a non-interactive guard (see Frozen decisions). |
| 8 | Detect existing custom registrations: config → AST scan of `Component.register('literal')` → skip+warn on unresolvable | Nothing | AST scan via TS compiler API; resolution precedence in `registry.ts`. |
| 9 | Infer default prefix from existing registrations (common leading segment) and adopt it | Nothing | Prefix-inference in `registry.ts`. |
| 10 | Resolve mixed/inconsistent prefixes: honor each per-component, default governs only unregistered, suggest majority + confirm, `--prefix`/fail in CI | Nothing | Interactive resolution + non-interactive `--prefix`/fail path. |
| 11 | Structure generator to emit future targets (`copilot-instructions.md`) | Nothing | Target registry / pluggable emitter shape in `generator.ts`. |
| 12 | Enforce strict scoping — only installed packages, never the 60+ catalog | `context`/`cem` deliberately walk the full curated list | init must scope to **installed** packages only (curated list is just the detection candidate set). |
| 13 | Support regeneration on dependency add/remove | Nothing | Re-run reads persisted config, re-detects, rewrites files. |
| 14 | Tests (detection, resolution, scoping, monorepo, dedupe, regeneration, `CLAUDE.md` import, prefix application, registration detection, prefix inference, mixed-prefix resolution, bare-default warning) | Existing test patterns in [test/](../test/) (node:test + `register.mjs` TS hook) | Add init test suite following existing conventions. |

## Frozen decisions

Decisions resolved and locked; do not reopen without a format-version bump.

### CLI-owned config location/shape — FROZEN

A dedicated project-root file, **`auro.config.json`**, namespaced internally by
command:

```json
{
  "version": 1,
  "init": {
    "prefix": {
      "default": "myapp-",
      "overrides": { "auro-input": "legacy-input" }
    }
  }
}
```

Rationale and rules:

- **Dedicated file, not a `package.json` key.** `auro init` **writes this file
  back** on every regeneration (tasks #7/#13), so it must be isolated from the
  user's `package.json` to avoid noisy diffs on an unrelated file and to let a
  team commit-or-gitignore it independently.
- **JSON, not `.js`/`.ts`.** Because the CLI round-trips (reads *and* rewrites)
  the file, it must be machine-serializable. A JS/TS config can't be safely
  rewritten. This rules out an ecosystem-style `auro.config.js`.
- **Top-level `version` field.** Present from v1 so any future format change is
  an explicit migration, not a guess. This is the ticket's "freeze the format
  early / bus-factor" requirement made concrete.
- **Namespaced under `init`.** Future commands get their own top-level keys
  without a schema break.
- **Override keys are the bare `auro-*` tag** (the stable component identity);
  the value is the resolved custom tag. The resolver's canonical `tagName`
  (bare `auro-*`) is the key — see the resolver row in Proposed architecture.
- **Committed by default; not auto-gitignored.** The config is treated as a
  committed artifact so regeneration is deterministic across the team and in CI
  (the task #10 "`--prefix`/fail in CI" path assumes the config is present).
  `init` must **not** auto-append it to `.gitignore`. Document that teams may
  gitignore it if they treat `AGENTS.md` as fully regenerated-on-demand.

Freeze this alongside the `AGENTS.md` layout (build-order step 1) before wiring
generation.

### Interactive prompt library — FROZEN

Use the **already-present `inquirer` v12** (`inquirer@^12.9.6` is a production
dependency today). **Do not add `@inquirer/prompts` or `prompts`** — a second
prompt library would be a redundant dependency and a style split.

- Match the established pattern in [agent.ts](../src/commands/agent.ts) and
  [migrate.js](../src/commands/migrate.js): `input` (with `validate`) for the
  prefix prompt; `confirm` for the majority-confirmation flow (task #10).
- **Non-interactive guard (new precedent — no command does this today).** init
  is non-interactive when **any** of: `process.stdin.isTTY` is falsy, `process.env.CI`
  is set, or an explicit `--non-interactive`/`--yes` flag is passed. When
  non-interactive: never call `inquirer.prompt` (avoids an inquirer throw on a
  closed stdin); take the prefix from `--prefix`; and if a value can't be
  resolved without a prompt (no `--prefix`, or a mixed-prefix conflict needing
  confirmation), **fail cleanly** with a one-line actionable error and a
  non-zero exit — satisfying the tasks #7/#10 "`--prefix` or fail in CI" path.

### AST scan tooling — FROZEN

Use the **TypeScript compiler API** (`typescript` is already a dependency; no new
parser). Rejected alternatives: regex (brittle on consumer code — cf. the
existing [prepWcaCompatibleCode.mjs](../src/scripts/prepWcaCompatibleCode.mjs)
approach, fine only for Auro's own predictable dist), Babel (`@babel/parser` would
be a new dep), acorn/espree (new dep, no TS/TSX).

- **`ts.createSourceFile` per file — not a `Program`/type-checker.** This is a
  purely syntactic scan: no tsconfig, no module resolution, no type-checking.
  Set `scriptKind` from the file extension so `.jsx`/`.tsx` parse.
- **Match shape:** a `CallExpression` whose callee is a `PropertyAccessExpression`
  with `.name.text === "register"`, and whose **first argument** is a
  `StringLiteral` or `NoSubstitutionTemplateLiteral` (a backtick string with no
  `${}` is statically resolvable → treat as a literal). Capture that string as
  the existing custom tag.
- **Skip + warn** on any `.register(...)` whose first arg is a template literal
  *with substitutions*, an identifier/const, a call, a spread, or absent — i.e.
  anything not statically resolvable. Warn, never guess (matches the Risks note
  on false-negatives).
- **Scope:** glob the project's own sources (`glob` is already a dep) —
  `**/*.{js,jsx,ts,tsx,mjs,cjs}` under cwd, **excluding** `node_modules`, `dist`,
  `build`, `coverage`. Never scan installed packages (Auro's own `static
  register` defaults would be false positives).
- **Per-file `try/catch`** around the parse: a syntax error in one consumer file
  warns and skips that file, never crashes `init`.
- **No cross-file resolution** of whether the callee is truly an Auro class — the
  scan is heuristic input to the config → scan → warn precedence, and matches are
  reconciled against the detected component set.

### `AGENTS.md` vs data files — FROZEN

**Self-contained `AGENTS.md` for v1. Do not emit separate machine-readable
artifacts** (`custom-elements.aggregate.json`, `AURO_COMPONENT_API.txt`) — the
prototype's split ([proto-init.mjs](../scripts/proto-init.mjs) STEP 3/4/4b) was a
debugging convenience, not a product requirement.

- **Consumer is an LLM reading one instruction file, not a program.** Inlining
  grounds the assistant the moment it reads `AGENTS.md`; a pointer file forces
  extra reads that agents follow unreliably. Decisive argument.
- **No programmatic consumer exists** for the aggregate CEM in v1 (no MCP server,
  no lint/codemod rule) — emitting it is YAGNI and adds commit/gitignore/sync
  surface.
- **Size is bounded** by strict install-scoping (task #12): tens of KB of
  markdown for a real project, well within assistant ingestion.
- **The one justified indirection already exists**: `CLAUDE.md` → `@AGENTS.md`
  thin import (task #5) dedups across targets. A second layer (`AGENTS.md` →
  data files) is redundant with it.
- **Fewer files = simpler idempotent regeneration** (task #13): one canonical
  file + one thin import, minimal write/diff surface.
- **Not a corner**: `generator.ts` renders from in-memory `ResolvedComponent[]`
  and is structured for multiple targets (task #11); a JSON/CEM emitter is an
  additive function over the same model later.

Definition of "self-contained": `AGENTS.md` inlines the component list,
per-component full API (via `formatDeclaration`), prefixed tags + import/
registration lines, and the Auro coding-rules block — merging what the prototype
split across `AURO_CONTEXT.md` + `AURO_COMPONENT_API.txt`.

**Revisit trigger:** split out a machine-readable artifact only when a real
programmatic consumer appears (MCP server, lint/codemod rule) — not before.

### `register()` scaffolding scope — FROZEN

**v1 documents; it does not modify consumer source.** The ticket marks
scaffolding "optional"; defer any actual code-mod to a follow-up.

- **init's writes are limited to files it owns**: `AGENTS.md`, `CLAUDE.md`,
  `auro.config.json`. It must **not** edit existing consumer source files in v1.
  Modifying a user's source (insert point, import management, formatting,
  re-run idempotency) is a categorically riskier operation than writing owned
  files.
- **Consistent with the read-only AST scan** (frozen above): v1 *reads* source
  syntactically. A codemod is the inverse — safe write-back that preserves
  formatting/comments — which would need a new transform dep (recast/
  jscodeshift; the TS printer reprints and loses formatting). Not justified for
  a 1.5–2.5 ew ticket.
- **The grounding file is the product.** For each component, `AGENTS.md` inlines
  the exact registration snippet the consumer (or its AI assistant) should add —
  the `import` line plus `AuroX.register('<prefixed-tag>')` using the resolved
  prefix. This satisfies the goal without touching source.
- **Bare `auro-*` case**: when the default applies and no custom prefix/
  registration is found, document the required `register()` call *and* emit the
  bare-default warning (tasks #7/#10).

**Follow-up (out of scope for PT-M1):** an opt-in `--scaffold` flag that runs a
formatting-preserving codemod to insert the `register()` calls.

## Build order / action checklist

Sequenced so each step is independently testable **and so every fixture-independent
task is front-loaded**. Steps 1–5 need nothing beyond what the repo already has —
every reuse surface exists (`partitionOutcomes`, `fetchManifest({preferLocal})`,
`mergeManifests`, `formatDeclaration`, `fetchLatestVersion`, the private
`buildComponentTable`), and `typescript`/`inquirer`/`glob`/`commander` are all
installed — so they can be built and unit-tested against **synthetic** fixtures
before any real Auro component is installed and before PR #302 merges. The fixture
install (step 6) gates end-to-end verification; the admin step gates on merge.

**No external dependency — start now (synthetic fixtures only):**

1. ✅ **DONE — Freeze the file format (critical path).** Write the `AGENTS.md`
   layout + coding-rules block and the `CLAUDE.md` thin-import as fixtures, and land
   the `auro.config.json` `Config` type + a fixture. The `auro.config.json` shape is
   already frozen (see Frozen decisions). **Did this first** — the ticket's
   bus-factor note calls the format freeze out explicitly, it needs zero deps, and
   it unblocks the generator (step 4).
   - **Delivered:** frozen source in `src/init/` — [config.ts](../src/init/config.ts)
     (`AuroConfig` type + `CONFIG_VERSION`), [rules.ts](../src/init/rules.ts)
     (`AURO_CODING_RULES`), [layout.ts](../src/init/layout.ts) (`GROUNDING_HEADER`,
     `SECTION_HEADINGS`, `INSTALLED_TABLE_HEADER`, `REGENERATION_NOTE`, `CLAUDE_MD`);
     golden fixtures in [test/fixtures/init/](../test/fixtures/init/)
     (`AGENTS.md`, `CLAUDE.md`, `auro.config.json`) pinning monorepo subpath imports,
     shared version, default-prefix + per-component override; freeze test
     [init.format.test.ts](../test/init.format.test.ts) (5 tests). `#init/*` alias
     added to `tsconfig.json`/`package.json`. Full suite 74/74, `tsc`/biome clean.
   - **Spec handed to step 4:** the frozen per-component section wraps
     `formatDeclaration` output in a fenced block and pins the `Install:` lines to
     emit the **resolved tag + subpath import + `register('<tag>')`** — the concrete
     shape `formatDeclaration` must take on when it becomes prefix/subpath-aware.
2. **Extract the trapped surfaces** (handoff gaps 1 & 3): `detectInstalled()` (out
   of [context.ts](../src/commands/context.ts) `buildComponentTable`) and
   `buildAggregateManifest()` (out of [cem.ts](../src/commands/cem.ts) `runCem`),
   with unit tests against synthetic manifests. Mechanical and low-risk; unblocks
   everything. Note this refactors files still open in PR #302 — expect rebase
   churn on `context.ts`/`cem.ts`/`fetchManifest.ts` until it merges.
3. **Build `resolver.ts` logic** — normalise single + aggregated CEM into
   `ResolvedComponent[]`, derive per-component subpath import paths, capture shared
   version, flag cross-package duplicate tags. Test against a **synthetic**
   standalone package and a **synthetic** formkit-style aggregate. (The live
   "detect what's really installed" smoke test is deferred to step 6.)
4. **Build `generator.ts`** — render `AGENTS.md`/`CLAUDE.md` from resolved
   components using prefixed tags; make import/registration lines subpath- and
   prefix-aware; structure for future targets. **The generator takes resolved
   tags as an input parameter — it does not compute prefixes itself** (that's
   `registry.ts`, step 5). This is why it can be built and tested here, before
   registry exists, using fixture tags; at runtime the command wires it as
   detect → resolve → resolve-tags (registry) → generate (step 7).
5. **Build `registry.ts`** — config load/save, AST scan (against synthetic
   consumer-source strings via the already-installed TS compiler API), prefix
   inference, mixed-prefix resolution (majority-suggest + confirm; `--prefix`/fail
   in CI), bare-`auro-*` warning.

**Gate — install real component fixtures.** Add a real standalone `auro-*` plus
`@aurodesignsystem/auro-formkit@6.1.0` to a fixture project / devDeps. Only
`auro-config` and `auro-library` (neither a component) are installed today, so
nothing below can be verified end-to-end until this lands.

**Needs the fixtures / a merged base:**

6. **Wire `src/commands/init.ts`** — orchestrate detect → resolve → resolve tags →
   generate → write; add `--prefix`, and an `--offline`-style flag if kept;
   register in [index.ts](../src/index.ts). First point real detection and
   monorepo enumeration (task #6) run end-to-end against installed packages.
7. **Regeneration** — verify re-run after adding/removing a dep updates files
   idempotently from persisted config.
8. **Tests** — close the fixture-dependent gaps (real detection, monorepo subpaths,
   dedupe). Most unit suites are already written alongside steps 1–5; this
   completes the suite (see below).
9. **Manual verification** — extend [test/manual-testing-ai-tooling.md](../test/manual-testing-ai-tooling.md)
   with an init section run against a real project (incl. a formkit install and a
   project with existing custom registrations).
10. **Admin** — assign AB#1628541, New → Active, and on merge/verify → Resolved,
    ticking the PT-M1 line on parent story AB#1628539. (Gates on PR #302 merging.)

## Testing plan

Map the ticket's enumerated test list to suites (node:test via
[test/register.mjs](../test/register.mjs), following existing conventions):

- Detection: installed vs not-installed; version captured from `package.json`.
- Installed-version resolution (never "latest").
- Scoping: only installed packages; **all** components of a multi-component
  package included; catalog packages that aren't installed excluded.
- Aggregated-CEM handling: subpath-export import paths + shared version for
  monorepos.
- Legacy-standalone-vs-monorepo dedupe warning.
- Regeneration on dependency change.
- `CLAUDE.md` import correctness (thin `@AGENTS.md`).
- Prefix application: unique tags for all components + persisted config.
- Custom-registration detection precedence: config → AST scan → warn/skip.
- Prefix inference from existing registrations.
- Mixed/inconsistent-prefix resolution: per-component overrides preserved,
  majority suggested + confirmed, CI fail-without-`--prefix`.
- Warning on bare `auro-*` defaults.

## Risks / open questions

- ✅ **Format freeze is the critical path** — the ticket explicitly calls it out
  for bus-factor. **Resolved:** the `AGENTS.md` layout + rules block, `CLAUDE.md`
  thin-import, and `auro.config.json` schema are frozen and locked by fixtures/tests
  (build-order step 1). Generation logic (step 4) now builds against a fixed spec.
- **Mixed-prefix UX** is the most intricate branch (interactive confirm vs CI
  fail). Prompt library is resolved (reuse `inquirer`); the remaining care is
  the non-interactive guard and clean CI failure (see Frozen decisions).
- **AST scan false-negatives** (computed/template-literal tags, Auro's
  auto-versioned dependency tags) must warn, never guess — verify against a real
  consumer app.
- **Duplicate-tag dedupe** needs a real legacy-vs-monorepo overlap to test; may
  need a synthetic fixture if none is currently published.

## Done when

Running `auro init` in a project with known Auro deps produces `AGENTS.md` (+ a
`CLAUDE.md` that imports it) listing exactly the components from installed
packages, with correct APIs for the installed version plus the Auro coding rules;
for a multi-component package like `auro-formkit`, **all** components it ships are
grounded (correct subpath imports + shared version), never components from
uninstalled packages; re-running after adding a package updates the files; a
single `--prefix` yields unique custom tags for all components (persisted for
idempotent regeneration); existing custom registrations are detected (config →
AST scan), always grounded under their actual tag and never rewritten; when
present the CLI infers and adopts the default prefix from them; mixed/inconsistent
prefixes are resolved by honoring each existing tag as a per-component override
and choosing the future default via "suggest majority + confirm" (or
`--prefix`/fail in CI); unresolvable names are warned rather than guessed; and
bare `auro-*` defaults emit a warning.
