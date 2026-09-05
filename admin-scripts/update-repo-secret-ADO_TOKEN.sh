#!/usr/bin/env bash
#
# update-repo-secret-ADO_TOKEN.sh
# Sets the ADO_TOKEN repo-level GitHub Actions secret across the Auro repos that
# run the RC Workflow, so `auro rc-workflow` can read the Azure DevOps Release
# ticket. By default it targets the repos that already carry a GH_TOKEN secret
# (the RC Workflow repos); ADO_TOKEN is a new secret, so there is nothing to
# "discover" by its own name yet.
#
# It ALSO wires each repo's RC caller workflow to forward the secret. Setting the
# repo secret is not sufficient on its own: the RC Workflow calls a reusable
# workflow in auro-actions, and a called workflow only sees the secrets its caller
# explicitly passes. The reusable workflow declares ADO_TOKEN as required, so a
# caller that forwards only GH_TOKEN fails before the job runs. For each repo that
# needs it, this script opens a PR into `dev` adding the ADO_TOKEN forwarding line
# (dev is PR-protected, so it cannot be committed directly). Set UPDATE_CALLER=0
# to only set the secret and skip this.
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
#   UPDATE_CALLER=0 ./update-repo-secret-ADO_TOKEN.sh
#                                                 # only set the secret; do NOT
#                                                 # open caller-forwarding PRs
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
#   UPDATE_CALLER=1   CALLER_PATH=.github/workflows/release-candidate.yml
#   CALLER_BASE_BRANCH=dev   FIX_BRANCH=chore/forward-ado-token-secret
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

# Caller-forwarding pass (see the header notes). Opens a PR per repo whose RC
# caller does not yet forward ADO_TOKEN.
UPDATE_CALLER="${UPDATE_CALLER:-1}"                 # 1 = patch callers | 0 = skip
CALLER_PATH="${CALLER_PATH:-.github/workflows/release-candidate.yml}"
CALLER_BASE_BRANCH="${CALLER_BASE_BRANCH:-dev}"
FIX_BRANCH="${FIX_BRANCH:-chore/forward-ado-token-secret}"
CALLER_COMMIT_MSG="${CALLER_COMMIT_MSG:-ci: forward ADO_TOKEN to the RC reusable workflow}"

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

# ---- Ensure callers forward ADO_TOKEN to the reusable workflow -------------
# The secret existing on the repo is not enough: the RC Workflow calls a reusable
# workflow, and a called workflow only sees the secrets its caller explicitly
# passes. Each caller (CALLER_PATH) must forward ADO_TOKEN alongside GH_TOKEN.
# We open a PR into CALLER_BASE_BRANCH (dev) per repo that needs it, because dev
# is PR-protected and cannot be committed to directly.

# Insert `ADO_TOKEN: ${{ secrets.ADO_TOKEN }}` on the line below the GH_TOKEN
# forwarding line, matching its indentation. Reads stdin, writes stdout.
insert_ado_token_line() {
  awk '
    { print }
    /secrets\.GH_TOKEN/ {
      match($0, /^[ \t]*/)
      printf "%sADO_TOKEN: ${{ secrets.ADO_TOKEN }}\n", substr($0, 1, RLENGTH)
    }
  '
}

# Ensure a single repo forwards ADO_TOKEN; opens a PR if a change is needed.
# Returns non-zero only on an unexpected failure (not on skip/idempotent cases).
ensure_caller_forwards_ado_token() {
  local repo="$1"
  local raw_file new_file dev_sha file_sha b64 existing_pr pr_url
  raw_file="$(mktemp)"; new_file="$(mktemp)"

  # 1) Read the caller on the base branch (raw bytes).
  if ! gh api "repos/${ORG}/${repo}/contents/${CALLER_PATH}?ref=${CALLER_BASE_BRANCH}" \
        -H "Accept: application/vnd.github.raw" > "${raw_file}" 2>/dev/null; then
    echo "  ⏭  ${repo}: no ${CALLER_PATH} on ${CALLER_BASE_BRANCH} (skipping)"
    rm -f "${raw_file}" "${new_file}"; return 0
  fi

  # 2) Idempotency / shape guards.
  if grep -q 'ADO_TOKEN' "${raw_file}"; then
    echo "  ✓ ${repo}: caller already forwards ADO_TOKEN"
    rm -f "${raw_file}" "${new_file}"; return 0
  fi
  if grep -qE '^[[:space:]]*secrets:[[:space:]]*inherit[[:space:]]*$' "${raw_file}"; then
    echo "  ✓ ${repo}: caller uses 'secrets: inherit' (already covered)"
    rm -f "${raw_file}" "${new_file}"; return 0
  fi
  if ! grep -q 'secrets\.GH_TOKEN' "${raw_file}"; then
    echo "  ⚠️  ${repo}: caller does not forward GH_TOKEN in the expected form; skipping for manual review"
    rm -f "${raw_file}" "${new_file}"; return 0
  fi

  if [ "${DRY_RUN}" = "1" ]; then
    echo "  would open PR on ${repo}: add ADO_TOKEN forwarding to ${CALLER_PATH}"
    rm -f "${raw_file}" "${new_file}"; return 0
  fi

  # 3) Produce the edited file.
  insert_ado_token_line < "${raw_file}" > "${new_file}"

  # 4) Ensure the fix branch exists (created from the base branch head).
  dev_sha="$(gh api "repos/${ORG}/${repo}/git/ref/heads/${CALLER_BASE_BRANCH}" -q '.object.sha' 2>/dev/null || true)"
  if [ -z "${dev_sha}" ]; then
    echo "  ⚠️  ${repo}: cannot resolve ${CALLER_BASE_BRANCH} head; skipping"
    rm -f "${raw_file}" "${new_file}"; return 0
  fi
  gh api "repos/${ORG}/${repo}/git/refs" \
    -f ref="refs/heads/${FIX_BRANCH}" -f sha="${dev_sha}" >/dev/null 2>&1 || true

  # 5) Commit the edit to the fix branch (unless a prior run already did).
  if gh api "repos/${ORG}/${repo}/contents/${CALLER_PATH}?ref=${FIX_BRANCH}" \
        -H "Accept: application/vnd.github.raw" 2>/dev/null | grep -q 'ADO_TOKEN'; then
    echo "  ↻ ${repo}: fix already committed on ${FIX_BRANCH}"
  else
    file_sha="$(gh api "repos/${ORG}/${repo}/contents/${CALLER_PATH}?ref=${FIX_BRANCH}" -q '.sha' 2>/dev/null || true)"
    b64="$(base64 < "${new_file}" | tr -d '\n')"
    if ! gh api -X PUT "repos/${ORG}/${repo}/contents/${CALLER_PATH}" \
          -f message="${CALLER_COMMIT_MSG}" \
          -f content="${b64}" \
          -f branch="${FIX_BRANCH}" \
          -f sha="${file_sha}" >/dev/null 2>&1; then
      echo "  ❌ ${repo}: failed to commit caller change"
      rm -f "${raw_file}" "${new_file}"; return 1
    fi
  fi

  # 6) Ensure a PR is open from the fix branch into the base branch.
  existing_pr="$(gh pr list --repo "${ORG}/${repo}" --head "${FIX_BRANCH}" \
    --base "${CALLER_BASE_BRANCH}" --state open --json url -q '.[0].url' 2>/dev/null || true)"
  if [ -n "${existing_pr}" ]; then
    echo "  ↻ ${repo}: PR already open ${existing_pr}"
  else
    pr_url="$(gh pr create --repo "${ORG}/${repo}" \
      --base "${CALLER_BASE_BRANCH}" --head "${FIX_BRANCH}" \
      --title "${CALLER_COMMIT_MSG}" \
      --body "Forward the repo-level ADO_TOKEN secret to the reusable RC workflow so \`auro rc-workflow\` can resolve the Azure DevOps Release ticket. The reusable workflow declares ADO_TOKEN as required; without this the RC Workflow fails before it starts. Opened automatically by admin-scripts/update-repo-secret-ADO_TOKEN.sh." 2>&1)" \
      && echo "  ✅ ${repo}: ${pr_url}" \
      || echo "  ⚠️  ${repo}: could not open PR: ${pr_url}"
  fi

  rm -f "${raw_file}" "${new_file}"
  return 0
}

if [ "${UPDATE_CALLER}" = "1" ]; then
  echo
  echo "Ensuring RC callers forward ADO_TOKEN (file '${CALLER_PATH}', base '${CALLER_BASE_BRANCH}', fix branch '${FIX_BRANCH}')."
  [ "${DRY_RUN}" = "1" ] && echo "(DRY RUN — no branches, commits, or PRs will be created)"
  echo
  caller_fail=0
  while read -r r; do
    [ -n "${r}" ] || continue
    ensure_caller_forwards_ado_token "${r}" || caller_fail=$((caller_fail+1))
  done < "${REPOS_FILE}"
  echo
  echo "Caller forwarding pass complete. Failures: ${caller_fail}"
  echo "Review and merge the opened PRs so the forwarding takes effect."
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
if [ "${UPDATE_CALLER}" = "1" ]; then
  echo "  - Review and merge the caller-forwarding PRs opened above (branch"
  echo "    '${FIX_BRANCH}' into '${CALLER_BASE_BRANCH}'); forwarding only takes"
  echo "    effect once merged."
fi

if [ "${DRY_RUN}" != "1" ] && { [ "${fail:-0}" -gt 0 ] || [ "${caller_fail:-0}" -gt 0 ]; }; then
  exit 1
fi
