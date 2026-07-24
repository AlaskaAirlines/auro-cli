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

### AI assistant context

#### `auro context`

Prints an AI-ready context document describing the Auro Design System, its components, and usage patterns. Designed to be piped into or pasted into AI coding assistants (Claude, Cursor, Copilot, etc.) to prime them on Auro.

- `-o, --output <file>`: write the context document to a file instead of stdout (e.g. `AURO_CONTEXT.md`).

Print the context to the terminal:

```bash
auro context
```

Write the context to a file for your AI tool:

```bash
auro context --output AURO_CONTEXT.md
```

`auro cem`
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

`auro component <name>`
Looks up a single Auro component's API — attributes, properties/methods, slots, events, and CSS parts — from its published Custom Elements Manifest. Useful for humans and for AI coding assistants that call the CLI in a tool-use loop to avoid guessing an API.

#### Options

- `-t, --tag <version>` npm dist-tag or version to look up (default: `latest`).
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
