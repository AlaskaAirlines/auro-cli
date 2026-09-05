# Manual Release Candidate Process

This guide documents the manual steps to create and manage a Release Candidate (RC) when the automated `auro rc-workflow` command is unavailable or fails.

Release tracking lives in **Azure DevOps (ADO)**, not GitHub. See
[auro-gitflow.md](./auro-gitflow.md) for the full gitflow. The RC pull request is
linked to the ADO **Release Candidate ticket** (the work item tagged `auro-rcs`),
which is discovered from the ADO work items referenced by the RC commits.

## Overview

The RC workflow coordinates three components:
1. **ADO Release ticket** - the work item tagged `auro-rcs` that tracks the release
2. **Branch** (`rc/{ticketId}`) - contains the candidate code from `dev`, named after
   the ADO Release ticket id
3. **Pull Request** - proposes merging the RC branch into `main`; its body references
   the ADO Release ticket

## Prerequisites

- Access to the repository with write permissions
- `dev` branch is up to date with the latest changes
- `GITHUB_TOKEN` (for GitHub branch/PR operations)
- `ADO_TOKEN` (a personal access token for `https://dev.azure.com/itsals`, used to
  read work items)

## How the ADO Release ticket is found

1. The commits on `dev` that are not yet on `main` are scanned for Azure Boards
   references in `AB#<id>` form (e.g. `ci: bump node AB#1597898`). These are the
   **committed work items**.
2. Each committed work item's ADO relations are inspected to find the linked ticket
   tagged **`auro-rcs`** — that is the **Release ticket**.
3. There must be exactly one distinct Release ticket. Its id names the branch
   (`rc/{ticketId}`) and it is referenced in the PR body.

If the new commits do not link to a Release ticket (no `AB#<id>` references, or the
referenced work items are not linked to an `auro-rcs` ticket), there is nothing to
release yet — **no Release PR is created**.

## Step-by-Step Process

### 1. Identify the ADO Release ticket

1. On `dev`, list the commits not yet in `main` and note every `AB#<id>` reference.
2. Open each referenced work item in ADO and find its linked ticket tagged
   `auro-rcs`. That is the Release ticket. Note its **id** (e.g. `1597900`).

### 2. Generate Release Notes Locally

From the `dev` branch, run:

```bash
auro check-commits -r
```

This generates release notes for all `feat`, `fix`, `breaking`, and `perf` commits.
Copy the output for the PR body.

### 3. Create or Update the RC Branch

**If the RC branch doesn't exist yet:**

```bash
git checkout dev
git pull origin dev
git checkout -b rc/1597900   # Replace 1597900 with the ADO Release ticket id
git push -u origin rc/1597900
```

**If the RC branch already exists:**

```bash
git checkout dev
git pull origin dev
git checkout rc/1597900      # Replace 1597900 with the ADO Release ticket id
git reset --hard dev
git push -f origin rc/1597900
```

### 4. Create or Update the Pull Request

**If no PR exists for the RC branch:**
1. Create a new PR in GitHub
2. Base: `main`
3. Compare: `rc/1597900` (your RC branch)
4. Title: `RC #1597900` (replace `1597900` with the ADO Release ticket id)
5. Body: reference the ADO Release ticket, e.g.
   `Release candidate pull request. Tracked by ADO Release ticket #1597900.`
   The linked ticket is sufficient — do not paste the release notes into the body;
   each change is trackable from the Release PR itself.

**If the PR already exists:**
1. Find the open PR for your `rc/1597900` branch
2. Update the body so the ADO Release ticket reference is current

## Automated vs Manual

The automated script (`auro rc-workflow`) performs all these steps in sequence:

1. Switches to `dev` branch if needed
2. Scans the RC commits for `AB#<id>` references and resolves the single ADO Release
   ticket tagged `auro-rcs`. If none is found, it stops without creating a Release PR
3. Creates or updates the `rc/{ticketId}` branch
4. Creates or updates the PR with the ADO Release ticket reference

## Important Notes

- **Branch naming**: Always use `rc/{ticketId}` format, where `ticketId` is the ADO
  Release ticket id (e.g. `rc/1597900`)
- **Release ticket**: The RC PR tracks the ADO work item tagged `auro-rcs`
- **PR target**: PR must target `main` branch
- **One at a time**: Only one open RC PR should exist per repo/Release ticket

## Troubleshooting

### No Release PR was created
The new commits on `dev` did not roll up to a Release ticket — either they contain no
`AB#<id>` references, or the referenced work items are not linked to an `auro-rcs`
ticket. This is expected when there is nothing to release yet. If a release *was*
expected, ensure the committed work carries the `AB#` mention and that its work items
link to the `auro-rcs` Release ticket in ADO.

### Multiple Release tickets found (error)
More than one distinct `auro-rcs` ticket is linked to the committed work items. There
must be exactly one Release ticket per repo — fix the ADO links so a single Release
ticket is reachable from the committed work items.

### Branch already exists error
The branch was created previously. Use the "update" commands instead (see step 3).

### PR shows "Closed"
A previous RC PR was merged or closed. Re-running the workflow creates a new PR on
the same `rc/{ticketId}` branch.

### Release notes are empty
Ensure you're on the correct branch and have commits of type `feat`, `fix`,
`breaking`, or `perf` since the last release.

## Related Docs

- [Auro Teams GitFlow](./auro-gitflow.md) — how the team plans, tracks, and releases work in ADO.

## Related Commands

```bash
# Run the full automated process
auro rc-workflow

# Generate release notes only
auro check-commits -r
```
