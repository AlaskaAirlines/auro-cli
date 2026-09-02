#!/usr/bin/env bash
#
# update-repo-secret-ACCESS_TOKEN.sh
# Updates a GitHub Actions secret across all Auro component repos plus
# AuroDesignTokens and WebCoreStyleSheets.
#
# Usage:
#   export NEW_TOKEN='<jason-capsule42-PAT>'                 # do NOT hardcode below
#   ./update-repo-secret-ACCESS_TOKEN.sh                     # real run
#   DRY_RUN=1 ./update-repo-secret-ACCESS_TOKEN.sh           # show what would happen
#
# Optional overrides:
#   SECRET_NAME=ACCESS_TOKEN   ORG=AlaskaAirlines
#
# Creating the token (the value for SECRET_NAME):
#   The secret is a GitHub Personal Access Token (PAT) owned by the account you
#   want the CI/gitflow automation to act as (e.g. jason-capsule42). Create it
#   while logged in to GitHub as THAT account:
#
#   Option 1 - Classic PAT (simplest):
#     1. GitHub -> Settings -> Developer settings ->
#        Personal access tokens -> Tokens (classic) -> Generate new token.
#     2. Scopes: check "repo" and "workflow" (add "read:org" if workflows
#        query org membership/projects).
#     3. Set an expiration, generate, and copy the value (starts with "ghp_").
#
#   Option 2 - Fine-grained PAT (more restrictive):
#     1. GitHub -> Settings -> Developer settings ->
#        Personal access tokens -> Fine-grained tokens -> Generate new token.
#     2. Resource owner: AlaskaAirlines (the org). Select the repos this script
#        targets (or "All repositories").
#     3. Repository permissions: Contents = Read and write,
#        Pull requests = Read and write, Workflows = Read and write.
#        Add Organization -> Projects = Read if the automation reads projects.
#     4. Generate and copy the value (starts with "github_pat_").
#
#   Requirements:
#     - The account owning the PAT must have write/admin access to the target
#       repos, or the automation using this secret will 403.
#     - Store the copied value in NEW_TOKEN (see Usage) - it is shown only once.
#     - Verify identity: gh api user -H "Authorization: token <PAT>" -q .login

set -euo pipefail

ORG="${ORG:-AlaskaAirlines}"
SECRET_NAME="${SECRET_NAME:-ACCESS_TOKEN}"
DRY_RUN="${DRY_RUN:-0}"

# ---- Preconditions --------------------------------------------------------
command -v gh >/dev/null 2>&1 || { echo "❌ gh CLI not found. Install: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ gh is not authenticated. Run: gh auth login"; exit 1; }

if [ -z "${NEW_TOKEN:-}" ]; then
  # Prompt without echoing to the terminal if not passed via env var.
  read -rsp "Paste the new PAT value for ${SECRET_NAME}: " NEW_TOKEN
  echo
fi
[ -n "${NEW_TOKEN}" ] || { echo "❌ NEW_TOKEN is empty."; exit 1; }

# ---- Repo list ------------------------------------------------------------
# Auro component repos (edit to match the exact set you want to update).
COMPONENTS=(
  auro-accordion
  auro-alert
  auro-avatar
  auro-background
  auro-backtotop
  auro-badge
  auro-banner
  auro-button
  auro-card
  auro-carousel
  auro-datetime
  auro-dialog
  auro-drawer
  auro-flight
  auro-flightline
  auro-formkit
  auro-header
  auro-hyperlink
  auro-icon
  auro-loader
  auro-lockup
  auro-nav
  auro-pane
  auro-popover
  auro-sidenav
  auro-skeleton
  auro-slideshow
  auro-table
  auro-tabs
  auro-tail
  auro-toast
  auro-tokenlist
)

OTHER=(
  auro-actions
  auro-ai
  AuroDesignTokens
  aurodocssite
  auro-cli
  auro-config
  eslint-config
  icons
  auro-library
  auro-templates
  WebCoreStyleSheets
  wc-generator
)

# REPOS WITH NO SECRET TO UPDATE
# auro-devops-component
# auro-devops-formkit
# auro-devops-library

REPOS=()
for c in "${COMPONENTS[@]}"; do
  REPOS+=("${ORG}/${c}")
done

# Non-"auro-*" repos requested explicitly.
for o in "${OTHER[@]}"; do
  REPOS+=("${ORG}/${o}")
done

# ---- Apply ----------------------------------------------------------------
echo "Setting secret '${SECRET_NAME}' on ${#REPOS[@]} repos in org '${ORG}'."
[ "${DRY_RUN}" = "1" ] && echo "(DRY RUN — no changes will be made)"
echo

ok=0; fail=0; failed_repos=()
for repo in "${REPOS[@]}"; do
  if [ "${DRY_RUN}" = "1" ]; then
    echo "  would update: ${repo}"
    continue
  fi
  if gh secret set "${SECRET_NAME}" --repo "${repo}" --body "${NEW_TOKEN}" >/dev/null 2>&1; then
    echo "  ✅ ${repo}"
    ok=$((ok+1))
  else
    echo "  ❌ ${repo}  (check it exists and you have admin)"
    fail=$((fail+1))
    failed_repos+=("${repo}")
  fi
done

if [ "${DRY_RUN}" != "1" ]; then
  echo
  echo "Done. Updated: ${ok}   Failed: ${fail}"
  if [ "${fail}" -gt 0 ]; then
    printf '  failed: %s\n' "${failed_repos[@]}"
    exit 1
  fi
fi
