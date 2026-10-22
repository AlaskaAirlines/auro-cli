# Auro CLI

[![Build Status](https://img.shields.io/github/actions/workflow/status/AlaskaAirlines/auro-cli/test-and-release.yml?style=for-the-badge)](https://github.com/AlaskaAirlines/auro-cli/actions/workflows/test-and-release.yml)
[![See it on NPM!](https://img.shields.io/npm/v/@aurodesignsystem/auro-cli.svg?style=for-the-badge&color=orange)](https://www.npmjs.com/package/@aurodesignsystem/auro-cli)
[![License](https://img.shields.io/npm/l/@aurodesignsystem/auro-cli.svg?color=blue&style=for-the-badge)](https://www.apache.org/licenses/LICENSE-2.0)

A CLI tool for the Auro Design System. It runs the local dev server, syncs repo config, builds components and docs, and drives parts of the release pipeline.

Published as `@aurodesignsystem/auro-cli`.

## Install

```bash
npm install @aurodesignsystem/auro-cli
```

Or run a single command without installing:

```bash
npx --package=@aurodesignsystem/auro-cli auro <command>
```

## Commands

Run `auro <command> --help` for options on any command. Defaults are shown where they exist.

### At a glance

**Development**

| Command | Does |
|---------|------|
| `auro dev` | Runs the dev server for a component. |
| `auro build` | Builds a component. |
| `auro docs` | Generates API docs from the Custom Elements Manifest. |
| `auro test` | Runs the web test runner. |

**Repo maintenance**

| Command | Does |
|---------|------|
| `auro sync` | Pulls `.github/` config from auro-templates. |
| `auro migrate` | Runs a migration script by id. |
| `auro agent` | Interactive cross-repo migration runner (work in progress). |
| `auro ado` | Creates an ADO work item from a GitHub issue. |

**Release pipeline** (CI runs these)

| Command | Does |
|---------|------|
| `auro rc-workflow` | Cuts the RC branch and opens the RC PR. |
| `auro pr-release` | Sets the PR preview version in `package.json`. |
| `auro check-commits` (alias `auro cc`) | Classifies commits and can label the PR. |
| `auro api-diff` | Checks that a PR's commits declare a big enough version bump for its code changes. |

## Full reference

### Development

#### `auro dev`

Runs the dev server for a component. Builds first, then serves.

- `-s, --serve`: start a server.
- `-p, --port <number>`: server port.
- `-o, --open`: open the browser once the server is up.
- `-w, --watch`: rebuild on change.
- `-m, --module-paths [paths...]`: path(s) to a node_modules folder.
- `--skip-docs`: skip doc generation (default: off).
- `-r, --readme-template <url>`: URL to the README template.
- `--wca-input [files...]`: source file(s) to analyze for API docs.
- `--wca-output [files...]`: output file(s) for API docs.

#### `auro build`

Builds a component.

- `-m, --module-paths [paths...]`: path(s) to a node_modules folder.
- `-w, --watch`: rebuild on change.
- `--skip-docs`: skip doc generation (default: off).
- `-r, --readme-template <url>`: URL to the README template.
- `--wca-input [files...]`: source file(s) to analyze for API docs.
- `--wca-output [files...]`: output file(s) for API docs.

#### `auro docs`

Generates API documentation from the Custom Elements Manifest.

- `-c, --cem`: generate the Custom Elements Manifest (default: off).
- `-a, --api`: create `api.md` from the CEM (default: off).
- `-w, --watch`: rebuild docs on change (default: off).
- `-r, --readme-template <url>`: URL to the README template.
- `--skip-readme`: skip README.md processing (default: off).
- `-s, --serve`: start a server.
- `-p, --port <number>`: server port.
- `-o, --open`: open the browser once the server is up.

#### Docs generation

`auro build` and `auro docs` generate `README.md` and the `demo/*.md` pages from `docs/partials/` and `docs/pages/`. If any docs file fails, the rest are still generated. Then the command exits non-zero and lists every failed file. A docs file fails when:

- a file it includes with `FILE` or `CODE` is missing, including nested includes;
- a `{{ … }}` placeholder is left in its prose (code is ignored). This includes a misspelled template variable, such as `{{ nmae }}`.

Code snippets (fenced blocks, `<pre>` and `<code>` elements, inline code and `CODE` includes) keep every `{{ … }}` expression except template variables and helpers, so Vue, Angular and Handlebars examples come through unchanged, including Handlebars blocks, comments, partials and triple-stash (`{{#each}}`, `{{!-- --}}`, `{{> header}}`, `{{{ raw }}}`). Two kinds of snippet expression are still filled in:

- a template variable on its own: `{{ name }}`, `{{ Name }}`, `{{ namespace }}`, `{{ Namespace }}`, `{{ Version }}`, `{{ dtVersion }}`, `{{ wcssVersion }}`, `{{ monorepoName }}`;
- a template helper whose arguments are template variables or quoted strings: `{{ capitalize name }}`, `{{ withAuroNamespace "button" }}`, `{{ packageName }}`.

Anything else, such as `{{ name.length }}` or `{{ name | uppercase }}`, is kept as written. To keep a template variable literal, write it as `\{{ name }}`.

In watch mode, a docs failure is reported but doesn't stop the watcher or the dev server. `auro docs --watch` rebuilds when you fix the file. `auro dev` and `auro build --watch` regenerate docs on the next source change.

**Upgrading a component created before auro-cli v4:** the v4 README template includes these files, so create them, even empty, or the build fails:

- `docs/partials/customRegistration.md`
- `apiExamples/custom.html`

#### `auro test`

Runs the web test runner against the component library.

- `-w, --watch`: watch mode.
- `-c, --coverage-report`: generate a coverage report.
- `-o, --open`: open the coverage report in the browser.
- `-f, --files <glob>`: test files glob pattern.

```bash
auro test --coverage-report --open
```

### Repo maintenance

#### `auro sync`

Pulls `.github/` config from auro-templates and rewrites this repo's copy.

- `-r, --ref <branch/tag/commit>`: git ref to pull from (default: `main`).
- `-t, --template <name>`: which template to use (default: `default`).

Heads up: after it validates the template, it removes the whole `.github/` folder and rebuilds it. Any local `.github/` file not in the template is lost. It does not make a branch, so changes land on your current branch. Run it on a branch you are willing to change.

#### `auro migrate`

Runs a codemod-style migration script by id.

- `-i, --id <string>` (required): the migration to run.
- `-m, --multi-gitter`: run it across every repo in the multi-gitter config.

#### `auro agent`

Interactive. Runs a migration across Auro components in dependency order. It prompts for the migration id and which components to start from. Needs multi-gitter installed. (Work in progress)

#### `auro ado`

Creates an Azure DevOps work item from a GitHub issue.

- `-g, --gh-issue <issue>`: the GitHub issue to use.

### Release pipeline

CI runs these. You do not usually run them by hand. The workflows in auro-actions call them.

#### `auro rc-workflow`

Cuts the release-candidate branch and opens the RC pull request. Runs on a push to dev. No options.

See [Auro Teams GitFlow](src/scripts/rc-workflow/auro-gitflow.md) for how the team plans and tracks releases in ADO, and the [Manual Release Candidate Process](src/scripts/rc-workflow/manual-rc-process.md) for running the RC steps by hand.

#### `auro pr-release`

Sets the PR preview version in `package.json`, computed from the npm registry. Does not publish.

- `-n, --namespace <namespace>`: package namespace (default: `@aurodesignsystem-dev`).
- `-p, --pr-number <number>`: the PR number (default: `0`).

The version comes out as `0.0.0-pr<PR#>.<n>`, where `<n>` is the next free increment on npm.

#### `auro check-commits` (alias `auro cc`)

Reads the repo's commits, classifies each by conventional-commit type, and reports the result.

- `-l, --set-label`: label the PR by the highest-priority commit type.
- `-d, --debug`: print detailed commit info.
- `-r, --release-notes`: generate release notes from the commits.

#### `auro api-diff <baseRef> [headRef]`

Works out the smallest version bump the code changes from `baseRef` to `headRef` (default `HEAD`) require, and checks that the commits declare at least that much. A version number is a promise to consumers, so a `fix:` commit that removes a public attribute shouldn't ship as a patch.

- `--json`: write the result to stdout as JSON.
- `--enforce`: exit 1 when the commits declare a smaller bump than the code requires (default: off, so the check can run report-only).
- `--no-rebuild`: compare the committed `custom-elements.json` files instead of rebuilding them. Faster, but only as good as the committed files, and many repos don't commit the manifest.
- `--manifest <path>`: manifest path from the repo root (default: `customElements` in `package.json`, else `custom-elements.json`).
- `--install-command <cmd>`: installs dependencies in each rebuilt checkout (default: `npm ci --no-audit --no-fund`).
- `--build-command <cmd>`: writes the manifest in each rebuilt checkout (default: `npm run build`).

```bash
auro api-diff origin/dev
```

Everything is compared from the merge base of the two refs, so only the PR's own changes and commits count.

**Required bump.** The highest bump among these changes:

| Change | Bump |
|---|---|
| Element removed or renamed; public attribute, property, method, event, slot, CSS part or CSS custom property removed or made private; type narrowed or replaced; attribute stops reflecting; default value changed, added or removed | Major |
| `exports` entry, `main`, `types` or `files` entry removed; `exports` added where there was none; peer or runtime dependency moved to a new major; `engines` tightened | Major |
| Element or public member added; private member made public; type widened; `exports` entry added | Minor |
| Any file under `src/` or `demo/`, or a `README.md` | Patch |
| Only `test/`, `.github/`, `docs/` or other unpublished files | None |

Only public API counts. Members are filtered on the manifest's `privacy` field, not on name prefixes. Attributes backed by a private or `@internal` property don't count. Default values are compared after normalizing quotes, so `'md'` and `"md"` are the same.

The manifest is rebuilt at both refs in temporary git worktrees, by default with `npm ci` and `npm run build`. The rebuild is skipped when only `test/`, `.github/` or `docs/` changed. If the head doesn't build, the check errors (fails closed). If the base doesn't build, the check uses the base's committed manifest, or skips the API comparison, and says so in `warnings` (fails open): a PR shouldn't be blocked by a base it didn't break.

**Declared bump.** The highest bump among the non-merge commits, worked out by `@semantic-release/commit-analyzer` with the repo's own release config (usually `@aurodesignsystem/auro-config/releaserc`, including its custom rules: `refactor`, `style` and `docs(README)` release a patch). The analyzer is loaded from the repo's own `node_modules`, so the check reads commits exactly as the release will. Run `npm ci` in the repo first: the check errors when the analyzer isn't installed. If the repo's release config can't be resolved, the shared rules are used and `warnings` says so. The PR title never counts, because merge commits don't affect the version.

**Outcome.**

- `fail`: the commits declare less than the code requires. Reword the commits (`fix:` → `feat:`, or add `!` and a `BREAKING CHANGE:` footer).
- `warn`: no release is required, but the commits declare one (for example, a `fix:` that only touches tests).
- `pass`: otherwise. Declaring more than required is allowed, because behavior can break without the API changing.

The JSON starts with `required` and `reasons`, followed by `declared`, `outcome`, a one-line `summary` for PR comments, the refs, each change and commit with its bump, the release config used, and any `warnings`:

```json
{
  "required": "major",
  "reasons": ["Removed attribute `ondark` from `<auro-button>`"],
  "declared": "patch",
  "outcome": "fail",
  "summary": "Commits declare `fix` (patch). Code requires major: removed attribute `ondark` from `<auro-button>`."
}
```

Exit codes: `0` when the analysis ran, `1` with `--enforce` when the outcome is `fail`, `2` when the analysis couldn't run (an unknown ref, a head that won't build, or no commit-analyzer installed in the repo).

### AI assistant context

#### `auro context`

Prints an AI-ready context document describing the Auro Design System, its components, and usage patterns. Designed to be piped into or pasted into AI coding assistants (Claude, Cursor, Copilot, etc.) to prime them on Auro.

The Component Reference table is enriched from each component's Custom Elements Manifest so descriptions stay current. For components installed in the current project, the manifest is read from `node_modules` (matching your installed version); everything else is fetched from unpkg. The curated built-in list is the fallback for any component that can't be resolved. After generating the document, any installed component that isn't on the latest published release is reported to stderr (so it never pollutes the document itself).

- `-o, --output <file>`: write the context document to a file instead of stdout (e.g. `AURO_CONTEXT.md`).
- `--offline`: skip network fetches — enrich only from locally installed manifests and fall back to the built-in table (also skips the outdated-release check).

Print the context to the terminal:

```bash
auro context
```

Write the context to a file for your AI tool:

```bash
auro context --output AURO_CONTEXT.md
```

#### `auro cem`

Aggregates the Custom Elements Manifests (`custom-elements.json`) of every published Auro component into a single file. Each component's manifest is fetched from the latest published version on unpkg; components that do not publish a manifest yet are skipped. Useful for feeding a complete, machine-readable component API index to IDEs, docs tooling, and AI assistants.

#### Options

- `-o, --output <file>` Path to write the aggregated manifest (default: `custom-elements.aggregate.json`).

#### Examples

Generate the aggregated manifest:

```
auro cem
```

Write it to a specific path:

```
auro cem --output dist/custom-elements.aggregate.json
```

#### `auro component <name>`

Looks up a single Auro component's API — attributes, properties/methods, slots, events, and CSS parts — from its Custom Elements Manifest. Useful for humans and for AI coding assistants that call the CLI in a tool-use loop to avoid guessing an API.

If the component is installed in the current project's `node_modules`, its manifest is read locally so the API matches the version you actually have — the success line shows `(local vX.Y.Z)`. Otherwise it's fetched from unpkg (shown as `(unpkg)`). Passing an explicit `--tag`/version always fetches that version from unpkg.

#### Options

- `-t, --tag <version>` npm dist-tag or version to look up (default: `latest`; forces an unpkg fetch).
- `--json` Output the raw manifest declaration(s) as JSON instead of formatted text.

#### Examples

Look up a component (name is normalized, so all of these work):

```
auro component button
auro component auro-button
auro component @aurodesignsystem/auro-button
```

Look up a specific version or dist-tag:

```
auro component auro-button --tag beta
auro component auro-button --tag 11.0.0
```

Get machine-readable output:

```
auro component auro-button --json
```
