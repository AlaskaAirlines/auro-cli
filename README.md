# Auro CLI

Auro CLI is a command-line interface designed to help consumers of the Auro Design System and the developers maintaining it.

## `Dev` Command Features

- **Start Development Server**: Quickly launch a web development server with default or custom configurations.
- **Customizable Options**: Specify the port and the directory to open when the server starts.
- **Hot Module Replacement**: Integrates with HMR (Hot Module Replacement) for a better development experience.
- **Graceful Error Handling**: Handles invalid inputs and missing options gracefully.

## Table of Contents

- [Installation](#installation)
- [First time setup](#first-time-setup)
- [Usage](#usage)
- [Commands](#commands)
- [Options](#options)
- [Examples](#examples)

## Installation

To install Auro CLI, clone the repository and install the dependencies:

```bash
npm install @aurodesignsystem/auro-cli
```

## First time setup

Some commands talk to GitHub or Azure DevOps and need Personal Access Tokens.
The CLI auto-loads variables from a `.env` file in your **current working
directory**, so each user manages their own tokens locally.

1. Copy the template into a real `.env`:

   ```bash
   cp .env.example .env
   ```

   `.env` is gitignored — never commit it.

2. Generate a **GitHub PAT** at <https://github.com/settings/tokens> →
   *Personal access tokens (classic)* → *Generate new token (classic)*.
   - Scope: `repo` (read access to private repos and CHANGELOG content).
   - You also need read access to the `Alaska-ECommerce` and
     `AlaskaAirlines` orgs.
   - Paste the token into `GH_TOKEN=` in your `.env`.

3. Generate an **Azure DevOps PAT** at
   <https://dev.azure.com/itsals/_usersSettings/tokens> → *+ New Token*.
   - Organization: `itsals`.
   - Scope: *Custom defined* → **Work Items: Read, write, & manage**.
   - Paste the token into `ADO_TOKEN=` in your `.env`.

4. (Optional) Override `ECOM_ORG` in `.env` if you want `auro version-scan`
   to default to a different GitHub org than `Alaska-ECommerce`.

For CI / scheduled automation, skip the `.env` file entirely — export the
same variables from your CI's secret store (GitHub Actions secrets, Azure
Pipelines variables marked secret, etc.) and the CLI will read them
directly. Use a dedicated bot/service-account PAT for automation, not a
personal one.

## Usage

To use Auro CLI, run the following command in your terminal:

```bash
auro dev
```

This will start the development server with default options.

## Commands

`auro dev`
Runs the web development server.

#### Options

- `-o, --open <type>` Open the server to a specific directory (default: demo/).
- `-p, --port <type>` Change the server port (default: undefined).

#### Examples

Start the server on a specific port:

```
auro dev --port 8000
```

Open the server to a specific directory:

```
auro dev --open src/
```

`auro version-scan`
Scans a GitHub organization for repos using outdated `@aurodesignsystem/*` and `@alaskaairux/*` packages, and writes two JSON files under `~/.auro/version-bot/`:

- `auro-deps-by-ecommerce-repo.json` — full per-repo Auro dependency snapshot (incremental, keyed by `pushed_at`).
- `auro-upgrade-candidates.json` — flat list of `(repo, package, pinned, latest, majorsBehind)` rows for every pair at least one major version behind. This is the input to `auro version-tickets`.

Re-runs are incremental — repos whose `pushed_at` matches the cache are skipped.

#### Required environment variables

- `GH_TOKEN` — GitHub token with read access to the target org and to `AlaskaAirlines` (used to fetch each `package.json` and to detect archived Auro source repos).

#### Options

- `--org <name>` GitHub org to scan (default: value of `ECOM_ORG` env var, or `Alaska-ECommerce`).
- `--force` Re-scan every repo, ignoring the `pushed_at` incremental short-circuit (default: false).

#### Examples

Initial scan of the default org:

```
auro version-scan
```

Scan a different org and force a full refresh:

```
auro version-scan --org SomeOtherOrg --force
```

`auro version-tickets`
Reads `~/.auro/version-bot/auro-upgrade-candidates.json` (produced by `auro version-scan`) and creates an Azure DevOps User Story per `(repo, package)` upgrade candidate under `E_Retain_Content\Auro Design System`. Defaults to dry-run; pass `--apply` to actually write to ADO. Every ticket is tagged `auro`, `version-upgrade`, and `majors-behind-<n>`.

#### Required environment variables

- `GH_TOKEN` — GitHub token used to fetch CHANGELOG.md from `AlaskaAirlines/<package-name>` for the migration-guide section. If unset, tickets fall back to a plain CHANGELOG link.
- `ADO_TOKEN` — Azure DevOps Personal Access Token with **Work Items: Read, write, & manage** scope on the `itsals` org. Required only with `--apply`.

#### Options

- `--min-majors <n>` Only ticket candidates at or above this majors-behind threshold (default: 2).
- `--apply` Actually create tickets in ADO. Without this flag, the command runs in dry-run mode (default: false).
- `--limit <n>` Cap on how many tickets to process this run.
- `--repo <name>` Only process candidates from this consumer repo.

#### Examples

Dry-run preview of all candidates 2+ majors behind:

```
auro version-tickets
```

Bounded first live run — one ticket from one repo:

```
auro version-tickets --apply --limit 1 --repo my-safe-repo
```

Lower the threshold and dry-run everything 1+ major behind:

```
auro version-tickets --min-majors 1
```
