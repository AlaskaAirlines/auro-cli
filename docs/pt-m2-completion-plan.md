# PT-M2 Completion Plan — Editor IntelliSense generation (VS Code HTML + framework types)

This document tracks the work required to resolve PT-M2 and tick the third box of
the Phase 1 Auro AI Tooling story. Where PT-M1 landed the first **generator**
(`auro init` → `AGENTS.md`/`CLAUDE.md`/`auro.config.json`), PT-M2 adds **new emit
targets** driven off the exact same resolved-component model so an engineer's editor
offers autocomplete + hover for the Auro tags they actually have installed — with
**no network call**, generated from the CEM already in `node_modules`.

**Scope note (expanded by decision).** The ticket as written is titled *"Editor
custom-data generation"* and scoped *"VS Code only"* — i.e. the VS Code
`html.customData` artifact, which only lights up **HTML files and HTML-language
regions**. We deliberately **expanded PT-M2** to also emit **framework-native
TypeScript types** so the same three PT-M1 consumer apps (vanilla **and React JSX
and Svelte**) all get real IntelliSense, not just the HTML/vanilla one. This is a
different mechanism from custom-data (see [Two mechanisms](#two-mechanisms-why-htmlcustomdata-isnt-enough)),
so the ticket text and the ~1–2 ew estimate should be updated to match (see
[Admin](#build-order--action-checklist), step 7). If the wider scope is rejected
downstream, the framework-type steps are cleanly separable back into a follow-up
milestone — they are additive emit targets over the same seam.

## Tickets

| Ticket | Type | Title | State |
| --- | --- | --- | --- |
| [AB#1628542](https://itsals.visualstudio.com/E_Retain_Content/_workitems/edit/1628542) | Task | PT-M2 — Editor custom-data generation *(retitle: Editor IntelliSense generation)* | Active |
| [AB#1628539](https://itsals.visualstudio.com/E_Retain_Content/_workitems/edit/1628539) | User Story | Phase 1 — Auro AI Tooling: Standalone Grounding (no MCP) | Committed |

**Ticket text (verbatim intent).** *Story:* as an engineer, my IDE offers
autocomplete/hover for Auro tags with no network call. *Tasks:* (1) generate VS
Code custom-data from the installed CEM; (2) **wire in the community
`custom-element-*-integration` tooling rather than re-implementing CEM → editor
conversion**; (3) have `auro init` optionally write the artifact, detecting or
prompting for the editor; (4) handle **custom-registered tag names** so
autocomplete/hover work for a component registered under a unique custom name, not
only the default `auro-*` tag; (5) verify autocomplete + hover show real
attributes/slots/events. *Done when:* after `auro init`, the editor offers
autocomplete + hover for installed Auro components' real attributes/slots/events
(including custom-registered tag names), generated from the CEM in `node_modules`.
*Notes:* effort originally **~1–2 ew** for the VS Code-only slice; **the expansion
below (JSX + Svelte types) adds roughly another 1–2 ew.**

## Two mechanisms (why `html.customData` isn't enough)

Editor IntelliSense for web components comes from **two independent subsystems**, and
the ticket's "autocomplete/hover in your IDE" goal spans both. This split is the
central architectural fact of the expanded PT-M2.

| Surface | Powered by | Fed by | Files it lights up |
| --- | --- | --- | --- |
| VS Code HTML | **HTML Language Server** | `html.customData` JSON | `.html` files + HTML-language embedded regions |
| React / Preact / Solid | **TypeScript language service** | generated `.d.ts` augmenting `JSX.IntrinsicElements` | `.jsx` / `.tsx` (any TS-aware editor) |
| Svelte | **Svelte language server** | generated `.d.ts` augmenting `svelteHTML` element types | `.svelte` |

`html.customData` is self-contained JSON consumed by the HTML server and **cannot**
reach JSX or Svelte — those route through the TypeScript / Svelte language servers,
which are driven by **generated TypeScript type declarations**, not custom-data. PT-M2
therefore ships **three emit targets over one resolved manifest**: one custom-data
JSON (HTML) and two `.d.ts` bundles (JSX, Svelte).

## What PT-M1 already gives us (reuse inventory)

PT-M2 is almost entirely a **new consumer of the PT-M1 resolved-component model**.
The detect → resolve → plan pipeline in [init.ts](../src/commands/init.ts) already
produces, before its write block, every input the three emit targets need — the
per-component CEM declarations, the resolved custom tags, and each component's
installed import path.

| Surface | Location | Reuse in PT-M2 |
| --- | --- | --- |
| `resolveInstalled()` → `{ components, duplicates }` | [resolver.ts](../src/init/resolver.ts) | `ResolvedComponent[]` — each carries its full CEM `declaration`, canonical bare `tagName`, `importPath`, `isMonorepo`, pinned `version`. **This is the input manifest**, already local-only (no network). |
| `ResolvedComponent.declaration` (full CEM decl: attributes, slots, events, methods, CSS parts/props) | [resolver.ts](../src/init/resolver.ts) | The API surface all three targets render (attributes → autocomplete; slots/events/methods → hover; and for JSX/Svelte, real prop/event **types**). |
| `ResolvedComponent.importPath` | [resolver.ts](../src/init/resolver.ts) | **New criticality in PT-M2:** the JSX `.d.ts` imports each component **class** for prop typing; `importPath` is what makes those imports resolve from the consumer's `node_modules` (fed to `componentTypePath`/`globalTypePath`). Not needed by the HTML target. |
| `planTagResolution(...)` → `plan.resolvedTags: Map<canonical, custom>` | [registry.ts](../src/init/registry.ts) | **The custom-registered-tag map** (ticket task #4), reused by all three targets so HTML, JSX, and Svelte can never disagree on a tag. |
| Two-phase prefix resolution + non-interactive TTY/CI guard | [init.ts](../src/commands/init.ts) `promptDefaultPrefix`, `isNonInteractive` | The emit writes happen **after** tags settle, so each target just consumes `plan.resolvedTags`; no new prefix logic. |
| Frozen CLI-owned config + load/save | [config.ts](../src/init/config.ts), [registry.ts](../src/init/registry.ts) | Persist the per-target opt-ins so regeneration is idempotent and CI never re-prompts. **Additive** `init.editors` key (see Frozen decisions). |
| Grounding-file write loop + spinner conventions | [init.ts](../src/commands/init.ts) | The emit writes slot into the same `Writing…` block with the same stderr-advisory conventions. |

## What's net-new in PT-M2 (beyond the reuse)

- **Three emit-target builders** in a new `src/init/editors/` module set that turn
  `ResolvedComponent[]` + `resolvedTags` into (a) a VS Code **HTML custom-data** JSON
  string, (b) a **JSX `.d.ts`**, and (c) a **Svelte `.d.ts`** — all via the community
  `@wc-toolkit` / cem-tools packages, **no hand-rolled CEM → editor conversion**.
- **Per-tag custom-name application** — via `tagFormatter` (HTML/JSX successors) or
  synthetic-manifest tag-swap (Svelte) — the mechanism that satisfies task #4.
- **Class-import path resolution for JSX** — rewriting the generated `.d.ts`'s
  `import type { AuroButton } from "…"` specifiers to the installed package via
  `componentTypePath`, using `ResolvedComponent.importPath`. (The HTML and Svelte
  targets don't need this — HTML JSON is self-contained; Svelte output carries no
  class imports.)
- **Two distinct wiring surfaces**, both non-destructive:
  - `.vscode/settings.json` → `html.customData` (for the HTML target).
  - the consumer's **`tsconfig.json` `include`** → so the generated `.d.ts` files land
    on the TypeScript program (for the JSX/Svelte targets). Different file, same
    jsonc-preserving merge discipline.
- **Per-target detection / prompt / flags** and the persisted opt-ins in
  `auro.config.json`.
- A **manual verification** pass proving real autocomplete + hover in each of the
  three consumer apps (the one thing automation structurally cannot assert — task #5).

## The community tools — FROZEN

All three targets use the **same actively-maintained `@wc-toolkit` / cem-tools family**
the repo already depends on (`@wc-toolkit/cem-sorter`, `@wc-toolkit/cem-utilities`,
`@wc-toolkit/jsx-types`) — exactly the "community `custom-element-*-integration`
tooling" the ticket names. **Each target has a preferred string-first entry point;**
all API shapes below were verified empirically against the real vendored Auro CEMs
([test/fixtures/packages/](../test/fixtures/packages/)).

| Target | Package (pin exact) | Entry point | Returns | Per-tag rename | Notes |
| --- | --- | --- | --- | --- | --- |
| HTML custom-data | `custom-element-vs-code-integration@1.5.0` | `getVsCodeHtmlCustomData(cem, opts)` | **string** (no IO) | pre-swap manifest (uniform prefix/suffix only) | self-contained JSON |
| JSX / React | **`@wc-toolkit/jsx-types@1.7.1`** *(already a dep)* | `generateJsxTypes(cem, opts)` | **string** (⚠️ *also writes a file*) | **`tagFormatter: (tag)=>string`** ✅ | imports component **class** → needs `componentTypePath` |
| Svelte | `custom-element-svelte-integration@1.2.0` | `generateSvelteTypes(cem, opts)` | **void** (writes file only) | none (uniform prefix/suffix) → **pre-swap manifest** | self-contained (no class imports); logs → `hideLogs: true` |

- **`@wc-toolkit/jsx-types` is the JSX tool of record** — it is the wc-toolkit
  successor to `custom-element-jsx-integration`, it **already sits in `package.json`
  unused**, and it is the only framework tool exposing both a **string return** and a
  **per-tag `tagFormatter`** (the older `custom-element-jsx-integration@1.6.0` returns
  `void` and offers only uniform prefix/suffix — do not use it).
- **Svelte has no wc-toolkit rewrite yet**, so `custom-element-svelte-integration`
  (void, file-writing, uniform-rename-only) is the current best option. Its lack of a
  `tagFormatter` is why the Svelte path **pre-swaps the manifest tag names** (the same
  technique the HTML path uses).
- **Every community tool writes a file as a side-effect** (jsx defaults `outdir` to
  **cwd** even when omitted; svelte requires an `outdir`). To keep the CLI the sole
  owner of the canonical write path (and keep the builders unit-testable), **redirect
  each tool's own write to an OS temp dir and discard it** — for JSX use the returned
  string as the source of truth; for Svelte read the temp file back — then have the
  command write the canonical file itself. Each builder thus returns
  `{ filename, contents }` regardless of the underlying tool's IO shape.
- **Do not** use the CEM-analyzer plugin entry points (`customElementVsCodePlugin`,
  `jsxTypesPlugin`, `customElementSveltePlugin`) — those are build-time analyzer wiring
  over an on-disk manifest; we already hold the manifest in memory.

Freeze the packages (exact versions, not `^`) + the artifact/settings/tsconfig shapes
(build-order step 1) before wiring generation, mirroring PT-M1's format-first
discipline, with a golden fixture per target so an upstream format change surfaces as a
failing test on any deliberate bump.

## Proposed architecture

A small `src/init/editors/` module set (one pure builder per target) + a thin
extension of the `init` command and config. No change to the resolver, generator, or
registry.

| Module | Responsibility | Notes |
| --- | --- | --- |
| `src/init/editors/htmlCustomData.ts` | `buildHtmlCustomData(components, resolvedTags)` → synthetic CEM with resolved tags → `getVsCodeHtmlCustomData` → `{ filename, contents }`. | Pure; self-contained JSON. |
| `src/init/editors/jsxTypes.ts` | `buildJsxTypes(components, resolvedTags)` → `generateJsxTypes(cem, { tagFormatter, componentTypePath, outdir: <temp> })`; use the **returned string**, discard the temp write → `{ filename, contents }`. | `tagFormatter` from `resolvedTags`; `componentTypePath` from `importPath`. |
| `src/init/editors/svelteTypes.ts` | `buildSvelteTypes(components, resolvedTags)` → pre-swap manifest tags → `generateSvelteTypes(cem, { outdir: <temp>, hideLogs: true })` → **read temp file back** → `{ filename, contents }`. | No `tagFormatter`; pre-swap. |
| `src/init/editors/settings.ts` | `mergeVsCodeSettings(existing, dataFileRelPath)` (jsonc `html.customData`) and `mergeTsconfigInclude(existing, dtsRelPaths)` (jsonc `include`). Both non-destructive/idempotent. | Shared jsonc-parser merge helpers. |
| `src/commands/init.ts` | Detect/prompt per target, honor flags, persist opt-ins, write the artifacts + merge settings/tsconfig inside the existing write block. | Thin extension; reuses `plan.resolvedTags`, `importPath`. |
| `src/init/config.ts` | Add optional `init.editors?: { vscode?: boolean; jsx?: boolean; svelte?: boolean }` | **Additive, non-breaking** — see Frozen decisions. |

**The tag-swap / `tagFormatter` seam (task #4).** For every `ResolvedComponent` the
resolved tag is `resolvedTags.get(canonicalTag) ?? canonicalTag`. The HTML and Svelte
tools take it via a **pre-swapped synthetic manifest** (clone each `declaration`, set
`tagName`, wrap in a minimal `{ schemaVersion, modules: [{ kind: "javascript-module",
declarations }] }`). The JSX tool takes it via **`tagFormatter: (t) =>
resolvedTags.get(t) ?? t`** — cleaner, since a per-tag function expresses arbitrary
per-component overrides (`auro-input → legacy-input` while `auro-button → myapp-button`)
that a uniform `prefix`/`suffix` cannot. One path handles default-prefix, arbitrary
overrides, and the bare-`auro-*` fallback identically.

**The class-import seam (JSX only).** `generateJsxTypes` emits `import type { AuroButton }
from "<path>"` for prop typing; left alone the path is the CEM's internal
`src/auro-button.js`, which does **not** resolve from a consumer's `node_modules`.
Feed **`componentTypePath: (name, tag) => <installed specifier>`** (and/or
`globalTypePath`) from `ResolvedComponent.importPath` so the emitted imports point at
the real installed package (e.g. `@aurodesignsystem/auro-button`). Verify the emitted
`.d.ts` type-checks in a consumer with the packages installed (part of the golden
fixture + a `tsc` smoke).

## Task breakdown

> **Requirements-coverage matrix, not the build sequence.** Use
> [Build order / action checklist](#build-order--action-checklist) for ordered
> steps; check this table to confirm every ticket task is covered before calling
> M2 done.

| # | Ticket task | Current state | Action needed |
| --- | --- | --- | --- |
| 1 | Generate editor data from the installed CEM | `resolveInstalled()` yields the installed CEM decls; nothing emits editor data | `buildHtmlCustomData` + `buildJsxTypes` + `buildSvelteTypes` over `ResolvedComponent[]`. |
| 2 | Wire in community tooling, don't re-implement CEM → editor | `@wc-toolkit/jsx-types` present but unused; no VS Code / Svelte dep | Use `getVsCodeHtmlCustomData`, `generateJsxTypes`, `generateSvelteTypes`. |
| 3 | `auro init` optionally writes the artifacts; detect or prompt | init writes only grounding files | Per-target detection + prompt + `--vscode`/`--jsx`/`--svelte` (and `--no-*`); persist opt-ins; write files + merge settings/tsconfig. |
| 4 | Handle custom-registered tag names (not just `auro-*`) | `plan.resolvedTags` already resolves custom tags for `AGENTS.md` | `tagFormatter` (JSX) / synthetic-manifest tag-swap (HTML, Svelte). |
| 5 | Verify autocomplete + hover show real attributes/slots/events | n/a (manual) | Manual-testing doc section across the three consumer apps (HTML region; React `.tsx`; `.svelte`). |
| — | JSX class-import resolution | n/a | `componentTypePath`/`globalTypePath` from `importPath`; `tsc` smoke on the emitted `.d.ts`. |
| — | tsconfig wiring so `.d.ts` lands on the TS program | n/a | Verified four-branch `include` decision tree (jsonc); zero-edit for default/neither shapes; warn-and-instruct only as last resort. |
| — | Idempotent regeneration of all artifacts + wiring | init regen is idempotent for grounding files | Regenerate each file per run; settings/tsconfig merges are add-once/idempotent. |
| — | Tests | PT-M1 test conventions (node:test + `register.mjs`) | Unit suites per builder + `init.command` integration cases. |

## Frozen decisions

Decisions resolved and locked; do not reopen without the noted version discipline.

### Artifact locations + editor wiring — FROZEN

- **HTML custom-data:** `.vscode/auro.html-custom-data.json` (project-root `.vscode/`,
  Auro-namespaced so it never collides), wired via `.vscode/settings.json` →
  `"html.customData": ["./.vscode/auro.html-custom-data.json"]` (path **relative to
  project root**, per VS Code's rule).
- **Framework types:** written under a dedicated **non-dotted `auro-types/`** dir at
  project root (`auro-types/auro-jsx.d.ts`, `auro-types/auro-svelte.d.ts`) —
  Auro-namespaced, outside `src/` so it never shadows user code, a single stable dir.
  **The non-dotted name is deliberate and evidence-driven:** TypeScript's default
  `include` glob (`**/*`, used when a project sets neither `include` nor `files`)
  **skips dot-prefixed directories**, so a `.auro/` dir would be silently invisible to
  bare / default-include projects — whereas a non-dotted `auro-types/` is picked up
  with **zero tsconfig edits** (verified — see resolved Risk *Consumer tsconfig
  variance*). Wiring follows the verified decision tree in the merges section below;
  the warn-and-instruct fallback (write the files, print the exact `include` line)
  is the last resort, not the common path.
- **CSS custom-data stays optional/secondary for v1** (additive
  `.vscode/auro.css-custom-data.json` + `css.customData` for `--auro-*` custom
  properties) — ship only if free once HTML lands; not required by "done when".
- **Never auto-gitignore** `.vscode/` or `auro-types/` — consistent with PT-M1's
  `auro.config.json` stance; teams decide whether to commit editor artifacts.

### Non-destructive, idempotent merges (settings.json + tsconfig.json) — FROZEN

Both wiring files may already be user-owned, so both are held to the strict PT-M1+
contract, using **[`jsonc-parser`](https://www.npmjs.com/package/jsonc-parser)**
(`@3.3.1`, zero-dependency, the canonical Microsoft lib VS Code/TypeScript/ESLint use):

- **Edit via `jsonc-parser` `modify()` + `applyEdits()`, never `JSON.parse`/`stringify`.**
  Real `.vscode/settings.json` and `tsconfig.json` are **JSONC** (comments, trailing
  commas). A surgical edit **preserves comments, key order, and formatting**; a
  full re-serialize would strip comments.
- **Never clobber.** Preserve every existing key untouched. If a file is present but so
  malformed `jsonc-parser` cannot recover a value, **warn + skip that merge** (still
  writing the artifact and printing the line to add).
- **`.vscode/settings.json` → `html.customData`:** add our relative path only when
  absent (dedupe); normalize a string to an array; create if absent. Idempotent.
- **`tsconfig.json` → `include`: a verified decision tree, keyed on the parsed config,
  that never breaks the consumer's program** (all four branches confirmed empirically
  with `tsc --listFilesOnly` on TS 5.6; see resolved Risk *Consumer tsconfig variance*):
  - **Has an `include` array** → append `"auro-types"` (dedupe). *(Verified: our
    `.d.ts` joins the program, source unaffected, 0 type errors.)*
  - **Has `files` but no `include`** → add `include: ["auro-types"]`. *(Verified:
    `files` and `include` combine — the `files` entries are retained.)*
  - **Has neither `include` nor `files`** → **do not touch `tsconfig.json`.** The
    default `**/*` already picks up the non-dotted `auro-types/` dir. *(Verified: adding
    an `include` here would replace the implicit `**/*` and silently drop the project's
    own sources — the one move we must never make.)*
  - **No `tsconfig.json` at all** → no edit; the default program includes the
    non-dotted root dir.
  - Idempotent: re-running never duplicates the entry.
- **Warn-and-instruct fallback (last resort).** Only when the config is unrecoverably
  malformed, or an `extends` chain / `exclude` / monorepo path setup means the parsed
  local config can't be safely amended, **write the `.d.ts` files and print the exact
  `include` line to add**. An **`@types/` shim** (write `auro-types` as
  `node_modules/@types/…` — auto-loaded regardless of `include`, verified) is a
  documented escape hatch for the rare project where even the dir approach can't reach
  the program, with the caveat it's wiped on reinstall and disabled by an explicit
  `compilerOptions.types` allowlist.
- **Create `.vscode/`, `auro-types/`, and the wiring files if absent** (init owns
  creating them; it does **not** create them for a target that's disabled).

### Config schema extension is additive — no version bump — FROZEN

Extend [config.ts](../src/init/config.ts) `InitConfig` with an **optional** per-target
opt-in map:

```json
{
  "version": 1,
  "init": {
    "prefix": { "default": "myapp-", "overrides": { "auro-input": "legacy-input" } },
    "editors": { "vscode": true, "jsx": true, "svelte": false }
  }
}
```

- **Additive + optional ⇒ `CONFIG_VERSION` stays `1`.** A v1 file written by PT-M1
  simply lacks `editors`; readers treat an absent target key as "unresolved /
  auto-detect". Backward-compatible field addition, no migration. (A *breaking* change
  would still require the bump the frozen PT-M1 decision mandates.)
- **Persisted opt-ins drive idempotent, non-interactive regeneration.** Once a run
  settles a target, later runs (including CI) neither re-detect nor re-prompt it.

### Detection / prompt / flags — FROZEN

Per target, mirroring PT-M1's settled-vs-unsettled discipline:

- **Flags:** `--vscode` / `--jsx` / `--svelte` force on, `--no-vscode` / `--no-jsx` /
  `--no-svelte` force off (commander negatable). An explicit flag always wins and is
  persisted.
- **Detection defaults (when unsettled and no flag):** VS Code target ← presence of a
  `.vscode/` dir; JSX target ← a `tsconfig.json` with `jsx` configured **or** a `react`
  dependency; Svelte target ← a `svelte` dependency or `svelte.config.*`. Presence is a
  strong "yes" signal.
- **Interactive prompt only when unsettled:** on a TTY with no flag and no persisted
  choice, `confirm` per detected target. Persist each answer.
- **Non-interactive/CI with no flag and no persisted choice:** **do not prompt and do
  not fail** — default each target to **on when its signal is present, else off**, and
  record it. (Unlike the prefix, an unresolved editor choice has a safe default, so
  PT-M2 never CI-fails on it.)

## Build order / action checklist

Sequenced so each step is independently testable; early steps need only synthetic
fixtures + the new dependencies, matching PT-M1's front-loading.

1. **Freeze the formats + add the dependencies (critical path).** ✅ **DONE** —
   committed [`acbc8e7`](../) (AB#1628542): the four tools pinned **exact**;
   optional `init.editors` field in [config.ts](../src/init/config.ts); frozen
   constants in [src/init/editors/layout.ts](../src/init/editors/layout.ts); golden
   fixtures per target under [test/fixtures/init/editors/](../test/fixtures/init/editors/)
   (HTML custom-data v1.1, JSX `.d.ts` augmenting global `JSX` **and**
   `react/jsx-runtime`, Svelte `.d.ts` augmenting `svelteHTML`, plus the
   `settings.json` merge states and all four `tsconfig` include/files branches); and
   [test/init.editors.format.test.ts](../test/init.editors.format.test.ts) (7 freeze
   tests). Verify gate green — 165 tests, `tsc --noEmit`, scoped biome, build.
   - `npm i custom-element-vs-code-integration jsonc-parser custom-element-svelte-integration`
     (pin exact resolved versions; `@wc-toolkit/jsx-types` is already present — pin it
     exact too). Confirm each imports under ESM/Node16 and that
     `getVsCodeHtmlCustomData` / `generateJsxTypes` return strings and
     `generateSvelteTypes` writes over a synthetic 1-component manifest; confirm
     `jsonc-parser` handles the comment-preserving settings **and** tsconfig merges.
   - Land the optional `init.editors` config field ([config.ts](../src/init/config.ts))
     and a **golden fixture per target** (standalone `auro-button` + monorepo
     `auro-formkit/auro-input`): the HTML JSON, the JSX `.d.ts` (with resolved
     `componentTypePath` imports), the Svelte `.d.ts`; plus merge fixtures for
     `settings.json` and `tsconfig.json` (empty / unrelated-keys / pre-existing entry).
     Freeze the filenames/paths/wiring-key shapes.
2. **Build the three pure builders in `src/init/editors/`.** ✅ **DONE** (AB#1628542,
   committed [`41eb506`](../)): shared plumbing in [manifest.ts](../src/init/editors/manifest.ts)
   (`EditorArtifact`, `resolvedTagFor`, `buildManifest` pre-swap, `importPathsByClass`,
   `withTempDir`); the three builders
   ([htmlCustomData.ts](../src/init/editors/htmlCustomData.ts),
   [jsxTypes.ts](../src/init/editors/jsxTypes.ts),
   [svelteTypes.ts](../src/init/editors/svelteTypes.ts)) and both merges
   ([settings.ts](../src/init/editors/settings.ts)). The three golden fixtures were
   **regenerated from the builders** over the shared synthetic inputs
   ([support.editors.ts](../test/support.editors.ts) — the same BUTTON/INPUT the PT-M1
   AGENTS.md uses), making the builders the source of truth and shrinking the JSX
   fixture 51 KB → 8.8 KB. Byte-exact golden + tag-swap/class-import/hover +
   merge-scenario tests in
   [init.editors.builders.test.ts](../test/init.editors.builders.test.ts) (27 cases).
   Verify gate green — 192 tests, `tsc --noEmit`, scoped biome, build.
   - `buildHtmlCustomData` (synthetic-manifest tag swap → `getVsCodeHtmlCustomData`).
   - `buildJsxTypes` (`tagFormatter` + `componentTypePath` from `importPath`; use the
     returned string; discard the tool's temp write).
   - `buildSvelteTypes` (pre-swap manifest; `hideLogs`; read the temp file back).
   - `mergeVsCodeSettings` + `mergeTsconfigInclude` (non-destructive/idempotent).
   - Unit-test each against synthetic fixtures (tag swap for default-prefix + arbitrary
     override + bare fallback; attributes present; slots/events in the HTML hover
     description; JSX class-import specifiers resolved; both merges across
     empty/unrelated/pre-existing/duplicate).
3. **Wire `src/commands/init.ts`.** ✅ **DONE** (AB#1628542, committed [`7548ab6`](../)):
   - New pure detection module [detect.ts](../src/init/editors/detect.ts)
     (`detectEditorSignals` — `.vscode/` dir → VS Code; `compilerOptions.jsx` or a `react`
     dep → JSX; a `svelte` dep or `svelte.config.*` → Svelte) and orchestration module
     [write.ts](../src/init/editors/write.ts) (`writeEditorArtifacts` — build + `mkdir` +
     write each enabled artifact, merge `settings.json`, merge `tsconfig.json` once when
     JSX **or** Svelte is on and only if a `tsconfig.json` exists; a skipped merge degrades
     to a warning carrying the manual one-liner and the artifact is still written).
   - `runInit` resolves each target via `resolveEditorTargets` under the frozen precedence
     **flag → persisted config → detection → prompt-if-TTY** (unsettled targets batch into
     one confirm round on a TTY; non-interactive/CI takes the detected default, never
     prompts/fails), persists all three booleans into `plan.config.init.editors` before
     `saveConfig`, writes the artifacts inside the existing write block, and extends the
     success message with the editor artifacts it wrote. Added the `--vscode`/`--jsx`/
     `--svelte` (+ `--no-*`) tri-state flag pairs.
   - Integration tests ([init.command.test.ts](../test/init.command.test.ts), +9 cases →
     26 in the suite): each flag writes its artifact + wiring with the resolved (prefixed)
     tag; `--no-*` writes nothing even with every signal present; a detected signal enables
     its target on a non-interactive run; a persisted choice is honored without a flag; a
     pre-existing tsconfig `include` is appended non-destructively; unrelated
     `settings.json` keys/comments are preserved and the entry is not duplicated across
     runs; an unparseable `settings.json` warns (with the manual line) + still writes the
     artifact. Verify gate green — 201 tests, `tsc --noEmit`, scoped biome, build; plus an
     offline end-to-end smoke (all three artifacts, non-destructive tsconfig merge,
     idempotent re-run).
4. **JSX type-check smoke + idempotent regeneration.** ✅ **DONE** (AB#1628542, committed [`9d18b35`](../)).
   - **tsc smoke** ([init.editors.tsc-smoke.test.ts](../test/init.editors.tsc-smoke.test.ts)):
     builds the JSX `.d.ts` for the shared button, stands in the component class type via a
     tsconfig `paths` stub (deterministic/offline, independent of package `exports`), and
     runs the project's own pinned `tsc -p` (`skipLibCheck: false`, so the `.d.ts` itself is
     type-checked) — a non-zero exit fails with the compiler's diagnostics. Proves the
     emitted `import type` specifiers resolve and the self-contained prop/element types are
     valid TS.
   - **All-three-target idempotent regeneration + dependency removal**
     ([init.command.test.ts](../test/init.command.test.ts) `all three editor targets
     regenerate byte-identically…`): a real `auro-button` + `auro-formkit` consumer with a
     pre-existing tsconfig; a second run reproduces the HTML/JSX/Svelte artifacts
     byte-for-byte and duplicates neither the `html.customData` entry nor the `include`;
     uninstalling `auro-formkit` drops `myapp-input` from **every** target while the
     standalone stays, and a further run is byte-identical.
   - **Malformed-CEM hardening (real-world defect surfaced by feeding the full formkit CEM
     to the generators for the first time).** Two genuine defects in the vendored formkit
     manifest crash the community tools: `auro-menu` ships a `{ kind: "field", type, default }`
     member with **no `name`** (the tools call `member.name.startsWith("#")`), and
     `auro-dropdown`'s `auroDropdown-idAdded` event ships the **truncated type** `"Object<key"`
     (spliced verbatim → TypeScript no parser accepts). `buildManifest`
     ([manifest.ts](../src/init/editors/manifest.ts)) now prunes entries whose `name` is not a
     string (keeping the empty-string default-slot name) and drops a `type.text` whose
     brackets are unbalanced, so the generators fall back to a safe default. Covered directly
     in [init.editors.builders.test.ts](../test/init.editors.builders.test.ts) (`builders
     tolerate a nameless member and a malformed event type`).
   - Verify gate green — **204 tests**, `tsc --noEmit`, scoped biome, build.
5. ✅ **DONE** (AB#1628542, committed [`8f4f5b7`](../)) — **Tests audit.** Confirmed the ticket's
   enumerated coverage is met by real assertions and closed the two thin spots the audit
   surfaced (both from the step-3 detection/prompt work):
   - **Detection heuristics — dedicated unit suite**
     ([init.editors.detect.test.ts](../test/init.editors.detect.test.ts), 19 tests): every
     branch of `detectVsCode`/`detectJsx`/`detectSvelte`/`detectEditorSignals` pinned
     directly — VS Code dir present/absent/is-a-file; JSX via `tsconfig.compilerOptions.jsx`
     **and** via a `react` dep/devDep, negatives, and unparseable-tsconfig-falls-through-to-
     react; Svelte via a `svelte` dep/devDep **and** each `svelte.config.{js,ts,mjs,cjs}`;
     the aggregate; and never-throws robustness over a bare dir and a malformed
     `package.json`. Previously only the VS Code signal was exercised, indirectly.
   - **Interactive editor prompt** ([init.command.test.ts](../test/init.command.test.ts)
     `interactive run prompts for unsettled targets…`): an interactive run with no flags and
     no persisted editors prompts for all three targets; each confirm's `default` is the
     detected signal; answers given *against* those defaults (decline the detected VS Code
     target, opt into the undetected JSX one) drive what's written and persist as concrete
     booleans. Covers the `resolveEditorTargets` prompt branch end-to-end.
   - **A second audit pass closed three more gaps** (in
     [init.command.test.ts](../test/init.command.test.ts) and
     [init.editors.builders.test.ts](../test/init.editors.builders.test.ts)): (a) the
     **tsconfig-merge warning path** in [write.ts](../src/init/editors/write.ts) — `--jsx`
     against a tsconfig whose `include` is unmergeable surfaces the warning on stderr and
     still writes the artifact, leaving the tsconfig untouched (the symmetric settings.json
     path was already covered); (b) the **delimiter-balance guard** in
     [manifest.ts](../src/init/editors/manifest.ts) — through the JSX builder, a balanced
     arrow type (`=>` read as text) and a nested generic are preserved while a *mismatched*
     bracket pair is dropped, pinning the subtle `hasBalancedDelimiters` logic beyond the one
     truncation case; (c) **flag-precedence conflict** — an explicit `--no-vscode` overrides a
     persisted `vscode:true` and re-persists, pinning the frozen flag → persisted ordering.
   - Verify gate green — **227 tests** (204 → +19 detect +1 interactive +3 second-pass),
     `tsc --noEmit`, scoped biome, build.
6. **Manual verification.** Extend
   [test/manual-testing-ai-tooling.md](../test/manual-testing-ai-tooling.md) with a
   **PT-M2 / AB#1628542** section proving the live editor experience across the three
   real consumer apps (the one thing automation can't assert — task #5):
   - **Vanilla / HTML** (`html.customData`, HTML server): in an `.html` file/region,
     `<auro-` → tag completion; attribute completion; hover → description with
     slots/events/methods/CSS parts.
   - **React** (`.tsx`, TS service): `<AuroButton`/`<auro-button` intrinsic completes
     with typed props; hover shows prop types; a wrong prop type errors.
   - **Svelte** (`.svelte`, Svelte server): the element completes with typed props/events.
   - Verify a **custom-registered tag** (e.g. `--prefix myapp-`) completes/hovers under
     its custom name in each. Use the automated-vs-manual split: the artifact *contents*
     and the merges are regression-covered; only the live IDE behavior is manual.
7. **Admin.** Update the ticket title/estimate to reflect the expanded scope (HTML +
   framework types, ~2–4 ew total); ticket is already **Active** and assigned; on
   merge/verify → Resolved, ticking the PT-M2 line on parent story
   [AB#1628539](https://itsals.visualstudio.com/E_Retain_Content/_workitems/edit/1628539).
   (Gates on the PR merging.)

## Testing plan

Map the ticket's implied test list to suites (node:test via
[test/register.mjs](../test/register.mjs), following PT-M1 conventions —
offline/deterministic; `fetch` unused since detection is local):

- **Editor data from installed CEM** — each builder over a synthetic standalone +
  monorepo manifest emits the right tags/attributes (HTML), typed intrinsics (JSX),
  and Svelte element types.
- **Custom-registered tag names (task #4)** — resolved tags reflect `resolvedTags` in
  all three targets (default prefix, arbitrary per-component override, bare-`auro-*`
  fallback) — `tagFormatter` for JSX, pre-swap for HTML/Svelte.
- **Attributes → autocomplete; slots/events/methods → hover** (HTML); **typed props /
  events** (JSX/Svelte) appear.
- **JSX class-import resolution** — emitted `import type` specifiers point at the
  installed package (`componentTypePath` from `importPath`), not the CEM-internal
  `src/…` path; a `tsc --noEmit` fixture smoke passes.
- **Merges** — `settings.json` and `tsconfig.json`: empty, unrelated-keys, pre-existing
  entry (string + array), duplicate (idempotent); unparseable → warn + skip merge,
  still write artifact.
- **`auro init` integration** — each `--<target>` writes its artifact + wiring; `--no-*`
  writes neither; persisted `editors.*` drives a non-interactive/CI run with no prompt
  and no fail.
- **Idempotent regeneration** — second run byte-identical, no duplicate wiring entries;
  dependency removal drops the tag from all targets.
- **Scoping** — only installed components appear (never the full catalog), consistent
  with PT-M1.

## Risks / open questions

- ✅ **Private-reflected attributes leak into autocomplete (CLI-side manifest hardening).**
  **Resolved.** Surfaced while improving the **auro-button** CEM: a component's internal
  properties can be marked `@private` (dropped from the emitted **fields/members**), yet the
  analyzer still emits their **reflected attributes** as **public, description-less
  `attributes`** — e.g. `onHover`/`onActive` → `data-hover` / `data-active`. Those then
  surfaced in HTML attribute autocomplete (and the JSX/Svelte prop types) as things a
  consumer might set, which they never should.
  - **Root cause (verified upstream):** neither `@private` nor `@ignore` on the source
    suppresses them, because the CEM analyzer derives the attribute entry from the
    `@property({ attribute: "…" , reflect: true })` **`attribute:` option independently of
    the property's privacy.** So it can't be fixed from within auro-button — it needs a
    post-analysis filter, i.e. **auro-cli's job, not the component's.** (Also tracked on the
    auro-button side as a note/row on tracker **#653**.)
  - **Fix (shipped):** extended the `buildManifest` hardening in
    [manifest.ts](../src/init/editors/manifest.ts) — which already prunes nameless members
    and unbalanced `type.text` (step 4) — with `isPrivateReflection`: an attribute is dropped
    (before the three builders run) when its backing member (`fieldName`) is **private/
    protected or absent from the pruned member list** *and* the attribute has **no
    description**. The no-description guard deliberately **keeps documented reflections a
    component exposes on purpose** (e.g. a11y `role` / `aria-*` attributes carrying real
    descriptions); an attribute with no `fieldName` has no backing member to judge and is
    always kept.
  - **Predicate chosen (of three considered):** *private/absent backing **+** undescribed* —
    over the narrower `data-*`-name match (too brittle) and the broader "any private-backed"
    (dropped ~45 attrs incl. documented a11y ones). Across all published Auro CEMs this drops
    ~20 attributes: the reported `data-hover`/`data-active` plus undescribed internal-state
    reflections (`hasFocus`, `hasValue`, `showPassword`, `isPopoverVisible`, `sliderStyles`,
    …). **Note — a real behavior consequence:** auro-button's `buttonHref`/`buttonRel`/
    `buttonTarget` are also private-backed *and* undescribed in the published CEM, so they are
    dropped too; if any of those is a genuine consumer attribute, the upstream remedy is to
    give it a description (and ideally make its member public) — the CLI faithfully honors the
    declared privacy rather than guessing.
  - **Coverage:** `builders drop private-reflected description-less attributes but keep
    documented ones` in
    [init.editors.builders.test.ts](../test/init.editors.builders.test.ts) — asserts across
    all three targets that a `@private`-backed and an omitted-member reflection are dropped
    while a documented public attribute and a *documented* private reflection are kept. Gate
    green — **228 tests**, `tsc --noEmit`, scoped biome, build.
- ✅ **Slots/events aren't first-class in VS Code HTML custom-data.** **Resolved
  empirically** — for a slot/event-rich component (`auro-input`: 54 attrs / 7 slots / 3
  events / 133 members in the raw CEM), the emitted tag carries **53 first-class
  `attributes`** (autocomplete + per-attribute hover) and renders **Events / Methods /
  Slots / CSS Parts as markdown sections in the tag `description`** (tag hover; the
  `hide*Docs` options default `false`). So "autocomplete + hover show real
  attributes/slots/events" holds for HTML: autocomplete = tags + attributes; hover =
  attributes + slots/events/methods/CSS parts. Slots/events get no *independent*
  autocomplete (the format has no slot/event model) — the manual section must word it
  as *hover shows slots/events*, never *slot/event autocomplete*.
- ✅ **`settings.json` / `tsconfig.json` in the wild are JSONC.** **Resolved** — adopt
  **`jsonc-parser`** for comment/format-preserving surgical edits on both files.
  Verified end-to-end against the real HTML tool's output: a commented file with
  unrelated keys keeps its comments and keys while gaining the entry; a re-run is
  byte-identical; a pre-existing string value normalizes to an array with ours
  appended; an empty/absent file is created. Warn+skip is reserved for a file so broken
  `jsonc-parser` can't recover a value.
- ✅ **Community-package output drift.** **Resolved** by pinning **exact** versions +
  golden fixtures per target. Observed contracts captured: HTML `getVsCodeHtmlCustomData`
  → `{ $schema, version, tags: [{ name, description, attributes:[{name,description,
  values}], references }] }`; JSX `generateJsxTypes` → a `.d.ts` string augmenting
  `JSX.IntrinsicElements`; Svelte `generateSvelteTypes` → a self-contained `.d.ts`. Our
  coupling is a single function call per target with the output written verbatim, so an
  upstream format change surfaces as a failing fixture test on any deliberate bump.
- ✅ **Monorepo tag volume.** **Resolved with measurements** — HTML JSON is **2.7 KB**
  (standalone `auro-button`, 1 tag) and **69.3 KB** (full `auro-formkit`, 20 tags);
  the JSX `.d.ts` for `auro-button` alone is **~15 KB**. Editors load artifacts of this
  size instantly, and strict install-scoping (as in PT-M1) bounds them — a non-issue.
- ✅ **JSX types aren't self-contained — they import the component class.**
  **Resolved (mechanism identified).** `generateJsxTypes` emits `import type
  { AuroButton } from "src/auro-button.js"` for prop typing; that relative specifier
  won't resolve from a consumer's `node_modules`. Feed **`componentTypePath`/
  `globalTypePath`** from `ResolvedComponent.importPath` so imports point at the
  installed package, and gate on a **`tsc --noEmit` fixture smoke** so a mis-resolved
  import fails a test rather than the user's editor. (The HTML target is self-contained
  JSON; the observed Svelte output carried **no** class imports — so this hazard is
  JSX-specific.) *Open sub-question for step 4:* confirm the emitted augmentation targets
  the right JSX namespace for the consumer's React version (global `JSX` vs React 19's
  `react/jsx-runtime`); captured as a manual/`tsc`-smoke verification, not a blocker.
- ✅ **Consumer tsconfig variance (new wiring surface).** **Resolved empirically** —
  ran real tsconfig shapes through `tsc --listFilesOnly` / `--noEmit` (TypeScript 5.6.3,
  with `react@18` + `@types/react@18`, a global-`JSX`-augmenting `.d.ts`, and a
  `<auro-button variant>` consumer `.tsx`). Findings that turn "variance" into a
  deterministic, safe decision tree:
  - **A global `declare global { namespace JSX }` augmentation takes effect the moment
    the `.d.ts` is on the program** — no import needed. Confirmed: with the file in-program
    the consumer `.tsx` type-checks (0 errors); removed, `<auro-button>` errors. So the
    entire problem reduces to *guarantee the file is in the program without breaking it*.
  - **TS's default `include` (`**/*`) skips dot-prefixed dirs** → a `.auro/` dir is
    silently invisible in bare / default-include projects; a **non-dotted `auro-types/`
    is auto-picked-up with zero edits** (both verified). Hence the dir rename in Frozen
    decisions — the single change that makes the common cases zero-edit.
  - **`files` and `include` combine** → adding an `include` alongside a `files`-only
    tsconfig keeps the `files` entries (verified). **But adding `include` to a tsconfig
    with *neither* replaces the implicit `**/*` and drops the project's own sources**
    (verified: `src/index.tsx` fell out of the program) — so that branch does **no
    edit** and leans on default pickup instead.
  - The four-branch merge (has-include / files-only / neither / no-tsconfig) in the
    merges Frozen decision covers every shape without ever narrowing the program; the
    **`@types/` shim** (auto-loaded regardless of `include` — verified) is the escape
    hatch for exotic `extends`/monorepo cases, and warn-and-instruct is the final
    fallback. Net: this is no longer an open risk — it's a verified spec. It remains the
    largest *net-new* integration surface (hence the estimate growth), but the failure
    mode "we silently break the consumer's build" is designed out.
- ✅ **Custom element / framework markup reaches all three consumer apps.**
  **Resolved (scope expanded to cover it).** `html.customData` (HTML server) covers
  `.html` files/regions; **JSX/React** is covered by the generated
  `JSX.IntrinsicElements` augmentation (TS service); **Svelte** by the generated Svelte
  element types (Svelte server). The manual pass exercises all three consumer apps
  rather than recording a gap. Framework coverage beyond React/Svelte (Vue, Angular,
  SolidJS, JetBrains) is **out of scope** for PT-M2 and is a natural follow-up — the
  same cem-tools family has `custom-element-vuejs-integration`,
  `custom-element-jet-brains-integration`, etc., over the identical resolver seam.

## Done when

Running `auro init` (with editor targets enabled — detected, prompted, or via
`--vscode`/`--jsx`/`--svelte`) in a project with known Auro deps writes, from the
installed CEM with no network call:

- `.vscode/auro.html-custom-data.json`, wired into `.vscode/settings.json`
  (`html.customData`) — HTML files/regions get autocomplete for installed Auro tags +
  attributes and hover showing real attributes plus slots/events/methods/CSS parts;
- `auro-types/auro-jsx.d.ts` (imports resolved to the installed packages, `tsc`-clean),
  placed so it lands on the TS program (auto-picked-up under default include, or via a
  safe `tsconfig.json` `include` append) — React `.tsx` gets typed intrinsic-element
  completion + hover + type-checking;
- `auro-types/auro-svelte.d.ts`, likewise on the TS program — `.svelte` markup gets
  typed element completion + hover;

all **including components registered under a custom tag name** (not just default
`auro-*`); with existing settings/tsconfig preserved (comments/keys intact via
`jsonc-parser`); re-running idempotent (byte-identical artifacts, no duplicate wiring
entries) and reflecting dependency add/remove; and every artifact generated by the
community `@wc-toolkit` / cem-tools packages over the in-memory resolved manifest, not
a hand-rolled CEM → editor conversion. (Vue / Angular / SolidJS / JetBrains coverage is
a documented follow-up over the same seam.)
