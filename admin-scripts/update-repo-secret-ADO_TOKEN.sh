#!/usr/bin/env bash
#
# update-repo-secret-ADO_TOKEN.sh
# Sets the ADO_TOKEN repo-level GitHub Actions secret across the Auro repos that
# run the RC Workflow, so `auro rc-workflow` can read the Azure DevOps Release
# ticket. By default it targets the repos that already carry a GH_TOKEN secret
# (the RC Workflow repos); ADO_TOKEN is a new secret, so there is nothing to
# "discover" by its own name yet.
#
# NOTE: unlike the GH_TOKEN/ACCESS_TOKEN scripts, the secret VALUE here is an
# Azure DevOps Personal Access Token (for https://dev.azure.com/itsals), NOT a
# GitHub PAT. The gh CLI session (which must have repo admin) is what writes the
# secret; NEW_TOKEN is only the value being stored.
#
# Usage:
#   export NEW_TOKEN='<your-ADO-PAT>'             # do NOT hardcode below
#   ./update-repo-secret-ADO_TOKEN.sh             # target GH_TOKEN repos
#   DRY_RUN=1 ./update-repo-secret-ADO_TOKEN.sh   # show what would happen
#   MODE=all ./update-repo-secret-ADO_TOKEN.sh    # set on ALL org repos instead
#   DISCOVER_BY_SECRET=RELEASE_TOKEN ./update-repo-secret-ADO_TOKEN.sh
#                                                 # discover by a different secret
#   VERIFY_REPO=auro-hyperlink ./update-repo-secret-ADO_TOKEN.sh
#                                                 # after updating, trigger the
#                                                 # RC Workflow on that repo
#
# Optional overrides:
#   SECRET_NAME=ADO_TOKEN   ORG=AlaskaAirlines   REPO_LIMIT=500
#   DISCOVER_BY_SECRET=GH_TOKEN
#   ADO_ORG=itsals   ADO_ORG_URL=https://dev.azure.com/itsals
#   VERIFY_WORKFLOW="RC Workflow"   VERIFY_REF=dev
#
# Prerequisites:
#   - Azure DevOps PAT (the value stored as ADO_TOKEN):
#       * Sign in to https://dev.azure.com/itsals.
#       * User settings -> Personal access tokens -> New Token.
#       * Organization: itsals. Scopes: Work Items -> Read (sufficient; the RC
#         workflow only reads work items). Set an expiration and plan to rotate.
#       * Copy the value into NEW_TOKEN (see Usage) - it is shown only once.
#   - gh CLI logged in as an account with ADMIN on the target repos (to set
#     secrets) and read on the org (to list repos). SAML SSO must be authorized
#     for the AlaskaAirlines org on your gh session.
#
# The PREFLIGHT below validates NEW_TOKEN against Azure DevOps (not GitHub) and
# separately validates your gh session against the GitHub org.

set -euo pipefail

ORG="${ORG:-AlaskaAirlines}"
SECRET_NAME="${SECRET_NAME:-ADO_TOKEN}"
DRY_RUN="${DRY_RUN:-0}"
MODE="${MODE:-discover}"                 # discover | all
DISCOVER_BY_SECRET="${DISCOVER_BY_SECRET:-GH_TOKEN}"
REPO_LIMIT="${REPO_LIMIT:-500}"
ADO_ORG="${ADO_ORG:-itsals}"
ADO_ORG_URL="${ADO_ORG_URL:-https://dev.azure.com/${ADO_ORG}}"
VERIFY_REPO="${VERIFY_REPO:-}"
VERIFY_WORKFLOW="${VERIFY_WORKFLOW:-RC Workflow}"
VERIFY_REF="${VERIFY_REF:-dev}"
REPOS_FILE="${REPOS_FILE:-/tmp/ado_token_repos.txt}"

# ---- Preconditions --------------------------------------------------------
command -v gh >/dev/null 2>&1 || { echo "❌ gh CLI not found. Install: https://cli.github.com"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "❌ curl not found (needed to validate the ADO PAT)."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ gh is not authenticated. Run: gh auth login"; exit 1; }

if [ -z "${NEW_TOKEN:-}" ]; then
  # Prompt without echoing to the terminal if not passed via env var.
  read -rsp "Paste the Azure DevOps PAT value for ${SECRET_NAME}: " NEW_TOKEN
  echo
fi
[ -n "${NEW_TOKEN}" ] || { echo "❌ NEW_TOKEN is empty."; exit 1; }

case "${MODE}" in
  discover|all) ;;
  *) echo "❌ MODE must be 'discover' or 'all' (got '${MODE}')."; exit 1 ;;
esac

# gh honors GH_TOKEN/GITHUB_TOKEN from the environment for auth. Guard against a
# stray one shadowing the interactive login we validated above.
if [ -n "${GH_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "⚠️  GH_TOKEN/GITHUB_TOKEN is set in your environment; gh will use it for"
  echo "    auth instead of your logged-in session. Unset it if that's not intended."
  echo
fi

# ---- Preflight: validate the ADO PAT in NEW_TOKEN -------------------------
# Azure DevOps PATs authenticate via HTTP Basic with an empty username and the
# PAT as the password. connectionData returns the authenticated identity; a
# private org rejects an invalid/expired token with a non-200 status.
echo "Preflight: validating the Azure DevOps PAT against ${ADO_ORG_URL}..."
ADO_BODY="$(mktemp)"
trap 'rm -f "${ADO_BODY}"' EXIT
ADO_CODE="$(curl -sS -o "${ADO_BODY}" -w '%{http_code}' \
  -u ":${NEW_TOKEN}" -H "Accept: application/json" \
  "${ADO_ORG_URL}/_apis/connectionData?api-version=7.1-preview" 2>/dev/null || true)"

if [ "${ADO_CODE}" != "200" ]; then
  echo "❌ The ADO PAT is invalid, expired, or not authorized for org '${ADO_ORG}'"
  echo "   (HTTP ${ADO_CODE:-000} from connectionData). Re-check the token value,"
  echo "   its expiration, and that it was created for the '${ADO_ORG}' organization."
  exit 1
fi

# Best-effort identity echo (non-fatal if the field can't be parsed).
ADO_USER="$(grep -o '"providerDisplayName":"[^"]*"' "${ADO_BODY}" | head -1 | sed 's/.*:"//; s/"$//')"
echo "  ADO token identity: ${ADO_USER:-<unknown>}"

# ---- Preflight: validate the gh session (writes the secrets) --------------
echo "Preflight: validating your gh session..."
GH_LOGIN="$(gh api user -q .login 2>/dev/null || true)"
[ -n "${GH_LOGIN}" ] || { echo "❌ Could not resolve your gh identity. Run: gh auth login"; exit 1; }
echo "  gh session identity: ${GH_LOGIN}"

if ! gh api "orgs/${ORG}" -q .login >/dev/null 2>&1; then
  echo "❌ Your gh session cannot read org '${ORG}'. Authorize SAML SSO for it:"
  echo "   gh auth refresh -h github.com -s admin:org  (then approve SSO in browser)."
  exit 1
fi
echo "  SSO/org access: ok"
echo

# ---- Build the target repo list -------------------------------------------
if [ "${MODE}" = "all" ]; then
  echo "MODE=all: targeting every repo in '${ORG}' (limit ${REPO_LIMIT})."
  gh repo list "${ORG}" --limit "${REPO_LIMIT}" --json name -q '.[].name' > "${REPOS_FILE}"
else
  echo "Discovering repos that carry a repo-level '${DISCOVER_BY_SECRET}' secret"
  echo "(the RC Workflow repos; limit ${REPO_LIMIT})..."
  : > "${REPOS_FILE}"
  for r in $(gh repo list "${ORG}" --limit "${REPO_LIMIT}" --json name -q '.[].name'); do
    if gh api "repos/${ORG}/${r}/actions/secrets/${DISCOVER_BY_SECRET}" >/dev/null 2>&1; then
      echo "${r}" | tee -a "${REPOS_FILE}"
    fi
  done
fi

REPO_COUNT="$(wc -l < "${REPOS_FILE}" | tr -d ' ')"
echo
echo "→ ${REPO_COUNT} repo(s) written to ${REPOS_FILE}"
if [ "${REPO_COUNT}" -eq 0 ]; then
  echo "Nothing to update. (Try MODE=all, or a different DISCOVER_BY_SECRET.) Exiting."
  exit 0
fi

# ---- Apply ----------------------------------------------------------------
echo
echo "Setting secret '${SECRET_NAME}' on ${REPO_COUNT} repo(s) in org '${ORG}'."
[ "${DRY_RUN}" = "1" ] && echo "(DRY RUN — no changes will be made)"
echo

ok=0; fail=0; failed_repos=()
while read -r r; do
  [ -n "${r}" ] || continue
  if [ "${DRY_RUN}" = "1" ]; then
    echo "  would update: ${ORG}/${r}"
    continue
  fi
  # Feed the value via stdin (omit --body) so it never appears in argv /
  # process listing. gh reads the secret value from stdin when --body is unset.
  err="$(printf '%s' "${NEW_TOKEN}" | gh secret set "${SECRET_NAME}" --repo "${ORG}/${r}" 2>&1 >/dev/null)" && rc=0 || rc=$?
  if [ "${rc}" -eq 0 ]; then
    echo "  ✅ ${ORG}/${r}"
    ok=$((ok+1))
  else
    echo "  ❌ ${ORG}/${r}  ${err//${NEW_TOKEN}/***}"
    fail=$((fail+1))
    failed_repos+=("${ORG}/${r}")
  fi
done < "${REPOS_FILE}"

if [ "${DRY_RUN}" != "1" ]; then
  echo
  echo "Done. Updated: ${ok}   Failed: ${fail}"
  if [ "${fail}" -gt 0 ]; then
    printf '  failed: %s\n' "${failed_repos[@]}"
  fi
fi

# ---- Verify (optional) ----------------------------------------------------
if [ -n "${VERIFY_REPO}" ] && [ "${DRY_RUN}" != "1" ]; then
  echo
  echo "Verify: triggering '${VERIFY_WORKFLOW}' on ${ORG}/${VERIFY_REPO} (ref ${VERIFY_REF})..."
  if gh workflow run "${VERIFY_WORKFLOW}" --repo "${ORG}/${VERIFY_REPO}" --ref "${VERIFY_REF}"; then
    echo "  triggered. Waiting ~60s before listing the latest run..."
    sleep 60
    gh run list --repo "${ORG}/${VERIFY_REPO}" --workflow "${VERIFY_WORKFLOW}" -L 1
    echo "  Confirm the run succeeds and resolves the ADO Release ticket."
  else
    echo "  ⚠️  Could not trigger the workflow (name/ref may be wrong, or it lacks workflow_dispatch)."
  fi
fi

# ---- Cleanup reminder -----------------------------------------------------
echo
echo "Cleanup:"
echo "  - unset NEW_TOKEN   # clear the ADO PAT from your shell env"
echo "  - Review ${REPOS_FILE} and delete it if you don't need the record."
echo "  - Note the ADO PAT's expiry date so it can be rotated before it lapses."

if [ "${DRY_RUN}" != "1" ] && [ "${fail:-0}" -gt 0 ]; then
  exit 1
fi
