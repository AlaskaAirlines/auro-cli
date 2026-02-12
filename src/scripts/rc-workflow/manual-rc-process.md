# Manual Release Candidate Process

This guide documents the manual steps to create and manage a Release Candidate (RC) when the automated `auro rc-workflow` command is unavailable or fails.

## Overview

The RC workflow coordinates three GitHub components:
1. **Issue** - Tracks the release with release notes
2. **Branch** (`rc/{issueNumber}`) - Contains the candidate code from `dev`
3. **Pull Request** - Proposes merging the RC branch into `main`

## Prerequisites

- Access to the repository with write permissions
- `dev` branch is up to date with the latest changes
- GitHub token (if using CLI commands)

## Step-by-Step Process

### 1. Generate Release Notes Locally

From the `dev` branch, run:

```bash
auro check-commits -r
```

This will generate release notes for all `feat`, `fix`, `breaking`, and `perf` commits. Copy the output for the next step.

### 2. Create or Update the RC Issue

**If no open RC issue exists:**
1. Create a new issue in GitHub
2. Title: `RC YYYY-MM-DD` (e.g., `RC 2026-02-12`)
3. Body: Paste the release notes from step 1
4. Add the label: `Release Candidate`

**If an open RC issue already exists:**
1. Find the latest open issue with the `Release Candidate` label
2. Update the title to the current date: `RC YYYY-MM-DD`
3. Replace the body with the new release notes from step 1

Note the issue number for the next steps (e.g., `#33`).

### 3. Create or Update the RC Branch

**If the RC branch doesn't exist yet:**

```bash
git checkout dev
git pull origin dev
git checkout -b rc/33  # Replace 33 with your issue number
git push -u origin rc/33
```

**If the RC branch already exists:**

```bash
git checkout dev
git pull origin dev
git checkout rc/33  # Replace 33 with your issue number
git reset --hard dev
git push -f origin rc/33
```

### 4. Create or Update the Pull Request

**If no PR exists for the RC branch:**
1. Create a new PR in GitHub
2. Base: `main`
3. Compare: `rc/33` (your RC branch)
4. Title: `RC #33` (replace `33` with your issue number)
5. Body: `Release candidate pull request. See issue #33 for details.`
   - Replace `33` with your issue number
   - This creates a clickable reference link to the issue

**If the PR already exists:**
1. Find the open PR for your `rc/33` branch
2. Update the body: `Release candidate pull request. See issue #33 for details.`
   - This ensures the link to the issue is current

## Automated vs Manual

The automated script (`auro rc-workflow`) performs all these steps in sequence:

1. Switches to `dev` branch if needed
2. Generates release notes by analyzing commits
3. Creates or updates the RC issue
4. Creates or updates the `rc/{issueNumber}` branch
5. Creates or updates the PR with proper linking

## Important Notes

- **Branch naming**: Always use `rc/{issueNumber}` format (e.g., `rc/33`)
- **Issue label**: Must have "Release Candidate" label to be recognized by automation
- **PR target**: PR must target `main` branch
- **Sync**: Keep issue body updated with latest release notes
- **One at a time**: Only one open RC issue/PR should exist at a time

## Troubleshooting

### Branch already exists error
The branch was created previously. Use the "update" commands instead (see step 3).

### PR shows "Closed"
A previous RC PR was merged or closed. Create a new issue and start fresh.

### Release notes are empty
Ensure you're on the correct branch and have commits of type `feat`, `fix`, `breaking`, or `perf` since the last release.

## Related Commands

```bash
# Run the full automated process
auro rc-workflow

# Generate release notes only
auro check-commits -r
```
