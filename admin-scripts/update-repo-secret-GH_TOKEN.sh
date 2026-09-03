#!/usr/bin/env bash
#
# update-repo-secret-GH_TOKEN.sh
# Discovers which AlaskaAirlines repos carry a repo-level GH_TOKEN secret
# (these override any org-level secret) and overwrites GH_TOKEN in each with
# your PAT. Optionally verifies by kicking off an "RC Workflow" run.
#
# Usage:
#   export NEW_TOKEN='<your-PAT>'                 # do NOT hardcode below
#   ./update-repo-secret-GH_TOKEN.sh              # discover + update
#   DRY_RUN=1 ./update-repo-secret-GH_TOKEN.sh    # show what would happen
#   MODE=all ./update-repo-secret-GH_TOKEN.sh     # set on ALL repos, not just
#                                                 # ones already carrying it
#   VERIFY_REPO=auro-hyperlink ./update-repo-secret-GH_TOKEN.sh
#                                                 # after updating, trigger the
#                                                 # RC Workflow on that repo
#
# Optional overrides:
#   SECRET_NAME=GH_TOKEN   ORG=AlaskaAirlines   REPO_LIMIT=500
#   VERIFY_WORKFLOW="RC Workflow"   VERIFY_REF=dev
#
# Prerequisites (do these once, on your PAT):
#   - Scopes: classic PAT with "repo" + "workflow", OR a fine-grained PAT with
#     Contents / Issues / Pull requests / Workflows = Read & write.
#   - SAML SSO: on the token page, Configure SSO -> Authorize for the
#     AlaskaAirlines org. An un-authorized token fails silently on org repos.
#   - You must have admin on each repo to set its secrets, and your account
#     needs write/push access so RC branch/issue creation doesn't 404.
#   - Store the copied value in NEW_TOKEN (see Usage) - it is shown only once.
#
# Note: this script authenticates repo/secret operations with your CURRENT gh
# session (which must have admin). The PREFLIGHT checks below validate the PAT
# in NEW_TOKEN separately, via an explicit Authorization header, without
# mutating your gh session.

set -euo pipefail

ORG="${ORG:-AlaskaAirlines}"
SECRET_NAME="${SECRET_NAME:-GH_TOKEN}"
DRY_RUN="${DRY_RUN:-0}"
MODE="${MODE:-discover}"                 # discover | all
REPO_LIMIT="${REPO_LIMIT:-500}"
VERIFY_REPO="${VERIFY_REPO:-}"
VERIFY_WORKFLOW="${VERIFY_WORKFLOW:-RC Workflow}"
VERIFY_REF="${VERIFY_REF:-dev}"
REPOS_FILE="${REPOS_FILE:-/tmp/gh_token_repos.txt}"

# ---- Preconditions --------------------------------------------------------
command -v gh >/dev/null 2>&1 || { echo "❌ gh CLI not found. Install: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ gh is not authenticated. Run: gh auth login"; exit 1; }

if [ -z "${NEW_TOKEN:-}" ]; then
  # Prompt without echoing to the terminal if not passed via env var.
  read -rsp "Paste the PAT value for ${SECRET_NAME}: " NEW_TOKEN
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

# ---- Preflight: validate the PAT in NEW_TOKEN -----------------------------
# Uses an explicit header so it tests NEW_TOKEN, not the gh session.
auth_api() { gh api -H "Authorization: token ${NEW_TOKEN}" "$@"; }

echo "Preflight: validating the PAT..."
TOKEN_LOGIN="$(auth_api user -q .login 2>/dev/null || true)"
if [ -z "${TOKEN_LOGIN}" ]; then
  echo "❌ The PAT is invalid or expired (could not resolve /user)."
  exit 1
fi
echo "  token identity: ${TOKEN_LOGIN}"

# SSO authorization: an un-authorized token 403s on org resources.
if ! auth_api "orgs/${ORG}" -q .login >/dev/null 2>&1; then
  echo "❌ The PAT cannot read org '${ORG}'. Likely SAML SSO is not authorized"
  echo "   for this token. Token page -> Configure SSO -> Authorize for ${ORG}."
  exit 1
fi
echo "  SSO/org access: ok"

# Push permission on a sample repo (the RC workflow needs write to branch/issue).
SAMPLE_REPO="${VERIFY_REPO:-auro-hyperlink}"
PERM="$(auth_api "repos/${ORG}/${SAMPLE_REPO}/collaborators/${TOKEN_LOGIN}/permission" -q .permission 2>/dev/null || true)"
case "${PERM}" in
  write|maintain|admin) echo "  push access on ${SAMPLE_REPO}: ${PERM}" ;;
  read|"")              echo "⚠️  push access on ${SAMPLE_REPO}: '${PERM:-unknown}' — RC automation may 404 on branch/issue create." ;;
  *)                    echo "  push access on ${SAMPLE_REPO}: ${PERM}" ;;
esac
echo

# ---- Build the target repo list -------------------------------------------
if [ "${MODE}" = "all" ]; then
  echo "MODE=all: targeting every repo in '${ORG}' (limit ${REPO_LIMIT})."
  gh repo list "${ORG}" --limit "${REPO_LIMIT}" --json name -q '.[].name' > "${REPOS_FILE}"
else
  echo "Discovering repos with a repo-level '${SECRET_NAME}' secret (limit ${REPO_LIMIT})..."
  : > "${REPOS_FILE}"
  for r in $(gh repo list "${ORG}" --limit "${REPO_LIMIT}" --json name -q '.[].name'); do
    if gh api "repos/${ORG}/${r}/actions/secrets/${SECRET_NAME}" >/dev/null 2>&1; then
      echo "${r}" | tee -a "${REPOS_FILE}"
    fi
  done
fi

REPO_COUNT="$(wc -l < "${REPOS_FILE}" | tr -d ' ')"
echo
echo "→ ${REPO_COUNT} repo(s) written to ${REPOS_FILE}"
if [ "${REPO_COUNT}" -eq 0 ]; then
  echo "Nothing to update. Exiting."
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
    echo "  Confirm the run succeeds and the new RC issue/branch is authored by '${TOKEN_LOGIN}'."
  else
    echo "  ⚠️  Could not trigger the workflow (name/ref may be wrong, or it lacks workflow_dispatch)."
  fi
fi

# ---- Cleanup reminder -----------------------------------------------------
echo
echo "Cleanup:"
echo "  - unset NEW_TOKEN   # clear the PAT from your shell env"
echo "  - Review ${REPOS_FILE} and delete it if you don't need the record."
echo "  - Close any stray RC issues left behind by earlier failed runs."

if [ "${DRY_RUN}" != "1" ] && [ "${fail:-0}" -gt 0 ]; then
  exit 1
fi
