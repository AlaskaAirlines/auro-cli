#!/usr/bin/env bash
#
# update-repo-teams.sh
# Reconfigures Auro team access + CODEOWNERS across the Auro component repos
# and the OTHER repos (same set as update-repo-secret-ACCESS_TOKEN.sh).
#
# Target end-state, per repo - ONLY these teams keep a grant:
#   auro-admin                    -> admin
#   auro-team                     -> read (pull)
#   auro-engineers                -> maintain         [+ CODEOWNERS everywhere]
#   alaska-internal-contributors  -> write (push)
#   auro-designers                -> maintain on AuroDesignTokens ONLY (removed elsewhere)
#                                    [+ CODEOWNERS on AuroDesignTokens only]
# Every OTHER team is removed from every repo (see REMOVE_TEAMS below):
#   auro-product-scrum-leadership, auro-release-managers, auroteamreviewers,
#   generalauroreviewers, non-auro-contributors, nonauroteamwriteaccess,
#   aurosupportteam, contentenablement.
#   Direct user collaborators     -> ALL removed, so access is team-only. Removal
#                                    happens only AFTER auro-admin=admin is confirmed
#                                    on the repo; the acting user is removed LAST.
#                                    Keep specific accounts via EXCLUDE_USERS.
# Team grants are only REMOVED, never deleted - the teams themselves still exist
# org-wide; retire any now-unused ones manually.
#
# CODEOWNERS is written by DIRECT COMMIT to each repo's default branch (no PR).
#
# Usage:
#   ./update-repo-teams.sh          # DRY RUN (default) - prints intended actions
#   APPLY=1 ./update-repo-teams.sh  # apply team perms + CODEOWNERS + strip direct users
#
# Optional overrides:
#   ORG=AlaskaAirlines
#   EXCLUDE_USERS="ci-bot svc-account"   # direct users to KEEP (space/comma separated)
#
# ---------------------------------------------------------------------------
# REQUIREMENTS (read before running):
#     - You must be a MAINTAINER of the teams being changed and have
#       ADMIN on each target repo. Org-owner is NOT required.
#     - Token scope: write:org (team perms + membership) AND repo (CODEOWNERS
#       commits). admin:org also works (it includes write:org).
#       Re-auth with: gh auth refresh -h github.com -s admin:org,repo
#     - Direct CODEOWNERS commits to a protected default branch will be REJECTED
#       unless branch protection allows admin bypass (enforce-admins off). Any
#       such repos are reported as failures - deliver those via PR instead.
#     - After this runs, auro-admin (1 member) is the only admin team. Org owners
#       keep admin regardless. Confirm that is intended.
#     - Stripping direct users revokes access for anyone NOT on an Auro team,
#       including CI/service accounts. REVIEW the DRY-RUN "remove direct user"
#       lines and add any accounts to keep to EXCLUDE_USERS before APPLY=1.
# ---------------------------------------------------------------------------

set -euo pipefail

ORG="${ORG:-AlaskaAirlines}"
APPLY="${APPLY:-0}"
if [ "${APPLY}" = "1" ]; then DRY_RUN=0; else DRY_RUN=1; fi

# ---- Preconditions --------------------------------------------------------
command -v gh >/dev/null 2>&1 || { echo "❌ gh CLI not found. Install: https://cli.github.com"; exit 1; }
command -v base64 >/dev/null 2>&1 || { echo "❌ base64 not found."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ gh is not authenticated. Run: gh auth login"; exit 1; }

# Required access differs by operation. In DRY RUN we only warn, so you can
# preview the plan before obtaining any scope upgrade.
fail_or_warn() { # <message>
  if [ "${DRY_RUN}" = "1" ]; then echo "⚠️  ${1} (dry run - preview only)"; else echo "❌ ${1}"; exit 1; fi
}

# Org access probe. Being an org member is enough (team-maintainer + repo-admin
# do the real work; org-owner is NOT required), so we stay silent on success and
# only speak up when the org can't be read - typically a token not SAML-authorized.
if ! role="$(gh api "user/memberships/orgs/${ORG}" --jq '.role' 2>/dev/null)" || [ -z "${role}" ]; then
  echo "ℹ️  Org access: could not read (token not SAML-authorized for ${ORG}, or insufficient access)."
  echo "    If APPLY calls later fail with a SAML 403, authorize your token for ${ORG}:"
  echo "    https://github.com/settings/tokens -> Configure SSO."
  printf '\n'
fi

# Token scopes. write:org covers team perms + membership; repo covers CODEOWNERS
# commits; admin:org (which includes write:org) also works.
scopes="$(gh api -i user 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="x-oauth-scopes"{print $2}')"
if [ -n "${scopes}" ]; then
  norm=",${scopes//[[:space:]]/},"
  has_write_org=0
  case "${norm}" in *,admin:org,*) has_write_org=1 ;; esac
  case "${norm}" in *,write:org,*) has_write_org=1 ;; esac
  if [ "${has_write_org}" != "1" ]; then
    fail_or_warn "Token lacks 'write:org' (has: ${scopes}). Needed for team perms + membership. Run: gh auth refresh -h github.com -s admin:org,repo"
  fi
else
  echo "ℹ️  Could not read classic token scopes (fine-grained token?). Ensure org 'Members' write + repo Contents write."
fi

# ---- Repo list (same set as update-repo-secret-ACCESS_TOKEN.sh) -----------
# NOTE: the three auro-devops-* repos are intentionally NOT here, matching the
# active OTHER array in the sibling script. Add them if team config should cover them.
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

REPOS=("${COMPONENTS[@]}" "${OTHER[@]}")

# Repo whose design-tokens content is owned by designers.
DESIGN_TOKENS_REPO="AuroDesignTokens"

# Teams to strip from EVERY repo so only the allowed teams (auro-admin, auro-team,
# auro-engineers, alaska-internal-contributors) remain. Discovered by scanning all
# repos in update-repo-secret-ACCESS_TOKEN.sh; a 404 on any repo where the team has
# no grant is treated as success. (auro-designers is handled separately: kept on
# AuroDesignTokens, removed elsewhere.)
REMOVE_TEAMS=(
  auro-product-scrum-leadership
  auro-release-managers
  auroteamreviewers
  generalauroreviewers
  non-auro-contributors
  nonauroteamwriteaccess
  aurosupportteam
  contentenablement
)

# Authenticated user - their own direct grant is removed LAST (after auro-admin
# is confirmed as admin) so the run can't lock itself out mid-repo.
ME="$(gh api user --jq '.login' 2>/dev/null || echo '')"

# EXCLUDE_USERS: optional space/comma-separated logins to KEEP as direct
# collaborators (e.g. CI/service accounts not on any team). Default: none.
EXCLUDE_USERS="${EXCLUDE_USERS:-}"

# ---- Helpers --------------------------------------------------------------
ok=0; fail=0; failed_actions=()

is_excluded() { # <login> -> 0 if login is in EXCLUDE_USERS
  local list=",${EXCLUDE_USERS//[[:space:]]/,},"
  case "${list}" in *",${1},"*) return 0 ;; *) return 1 ;; esac
}

# run <human description> <gh args...>
run() {
  local desc="$1"; shift
  if [ "${DRY_RUN}" = "1" ]; then
    echo "    would: ${desc}"
    return 0
  fi
  if gh "$@" >/dev/null 2>&1; then
    echo "    ✅ ${desc}"; ok=$((ok+1)); return 0
  else
    echo "    ❌ ${desc}"; fail=$((fail+1)); failed_actions+=("${desc}"); return 1
  fi
}

set_perm() { # <team> <repo> <pull|push|maintain|admin>
  run "set ${1} = ${3} on ${ORG}/${2}" \
      api --method PUT "orgs/${ORG}/teams/${1}/repos/${ORG}/${2}" -f permission="${3}"
}

remove_perm() { # <team> <repo> [reason]  (ignore 404 - grant already absent)
  local desc="remove ${1} direct grant on ${ORG}/${2} (${3:-inherit auro-team})"
  if [ "${DRY_RUN}" = "1" ]; then echo "    would: ${desc}"; return 0; fi
  if gh api --method DELETE "orgs/${ORG}/teams/${1}/repos/${ORG}/${2}" >/dev/null 2>&1; then
    echo "    ✅ ${desc}"; ok=$((ok+1))
  else
    # 404 == no direct grant existed, which is the desired state; treat as success.
    echo "    ✅ ${desc} (nothing to remove)"; ok=$((ok+1))
  fi
}


codeowners_body() { # <repo> -> prints CODEOWNERS file content
  local repo="$1"
  printf '# Managed by admin-scripts/update-repo-teams.sh - do not edit by hand.\n'
  printf '# The Auro engineers team is the default code owner for everything in the repo.\n'
  if [ "${repo}" = "${DESIGN_TOKENS_REPO}" ]; then
    printf '* @%s/auro-engineers @%s/auro-designers\n' "${ORG}" "${ORG}"
  else
    printf '* @%s/auro-engineers\n' "${ORG}"
  fi
}

write_codeowners() { # <repo>
  local repo="$1" path=".github/CODEOWNERS" content b64 default_branch sha desc
  content="$(codeowners_body "${repo}")"
  desc="commit ${path} on ${ORG}/${repo}"

  if [ "${DRY_RUN}" = "1" ]; then
    echo "    would: ${desc}:"
    printf '%s\n' "${content}" | sed 's/^/           | /'
    return 0
  fi

  default_branch="$(gh api "repos/${ORG}/${repo}" --jq '.default_branch' 2>/dev/null || echo "")"
  if [ -z "${default_branch}" ]; then
    echo "    ❌ ${desc} (could not resolve default branch)"; fail=$((fail+1)); failed_actions+=("${desc}"); return 0
  fi
  b64="$(printf '%s' "${content}" | base64 | tr -d '\n')"
  sha="$(gh api "repos/${ORG}/${repo}/contents/${path}?ref=${default_branch}" --jq '.sha' 2>/dev/null || true)"

  local args=(api --method PUT "repos/${ORG}/${repo}/contents/${path}"
              -f message="chore: point CODEOWNERS at auro-engineers"
              -f content="${b64}" -f branch="${default_branch}")
  [ -n "${sha}" ] && args+=(-f sha="${sha}")

  if gh "${args[@]}" >/dev/null 2>&1; then
    echo "    ✅ ${desc} (@${default_branch})"; ok=$((ok+1))
  else
    echo "    ❌ ${desc} (@${default_branch} - branch protection? deliver via PR)"; fail=$((fail+1)); failed_actions+=("${desc}")
  fi
}

# Remove every DIRECT user collaborator so access is team-only. MUST be called
# only after auro-admin=admin is confirmed on the repo (the caller gates this),
# so removing admins - including the acting user - can't lock anyone out. The
# acting user (${ME}) is always removed LAST. Users in EXCLUDE_USERS are kept.
strip_direct_users() { # <repo>
  local repo="$1" logins others=() self_found=0 u
  # affiliation=direct = users granted directly on the repo (team/org-derived excluded).
  logins="$(gh api "repos/${ORG}/${repo}/collaborators?affiliation=direct&per_page=100" \
              --paginate --jq '.[].login' 2>/dev/null || true)"
  if [ -z "${logins}" ]; then
    echo "    (no direct users to remove)"
    return 0
  fi
  while IFS= read -r u; do
    [ -n "${u}" ] || continue
    if is_excluded "${u}"; then
      echo "    keep direct user ${u} (in EXCLUDE_USERS)"
      continue
    fi
    if [ -n "${ME}" ] && [ "${u}" = "${ME}" ]; then
      self_found=1   # defer self to last
      continue
    fi
    others+=("${u}")
  done <<< "${logins}"

  for u in ${others[@]+"${others[@]}"}; do
    run "remove direct user ${u} on ${ORG}/${repo}" \
        api --method DELETE "repos/${ORG}/${repo}/collaborators/${u}"
  done
  if [ "${self_found}" = "1" ]; then
    run "remove direct user ${ME} on ${ORG}/${repo} (self - removed last)" \
        api --method DELETE "repos/${ORG}/${repo}/collaborators/${ME}"
  fi
}

# ---- Go -------------------------------------------------------------------
echo "Org: ${ORG} | repos: ${#REPOS[@]} | mode: $([ "${DRY_RUN}" = "1" ] && echo 'DRY RUN (set APPLY=1 to apply)' || echo 'APPLY')"
echo

echo "== Per-repo permissions + CODEOWNERS =="
for repo in "${REPOS[@]}"; do
  echo "-- ${ORG}/${repo}"
  # auro-admin MUST be granted FIRST so admin access is guaranteed via the team
  # before any other change (esp. removing direct admin users) runs on this repo.
  if set_perm auro-admin "${repo}" admin; then admin_ok=1; else admin_ok=0; fi
  set_perm    auro-team      "${repo}" pull
  set_perm    auro-engineers "${repo}" maintain
  set_perm    alaska-internal-contributors "${repo}" push
  # Strip every non-allowed team so only the four allowed teams remain.
  for t in "${REMOVE_TEAMS[@]}"; do
    remove_perm "${t}" "${repo}" "consolidated into allowed teams"
  done
  # auro-designers: keep on AuroDesignTokens, remove everywhere else.
  if [ "${repo}" = "${DESIGN_TOKENS_REPO}" ]; then
    set_perm  auro-designers "${repo}" maintain
  else
    remove_perm auro-designers "${repo}" "consolidated into allowed teams"
  fi
  write_codeowners "${repo}"
  # Strip direct users only once auro-admin=admin is in place (team keeps access).
  if [ "${admin_ok}" = "1" ]; then
    strip_direct_users "${repo}"
  else
    echo "    ⚠️  skipped direct-user removal (auro-admin=admin not confirmed - avoids lockout)"
  fi
done

echo
echo "Note: the deprecated teams (auro-release-managers, auroteamreviewers,"
echo "      generalauroreviewers, non-auro-contributors) are NOT deleted by this"
echo "      script - retire them manually via an org admin once nothing references them."

echo
if [ "${DRY_RUN}" = "1" ]; then
  echo "DRY RUN complete. Re-run with APPLY=1 to apply perms + CODEOWNERS."
else
  echo "Done. Succeeded: ${ok}   Failed: ${fail}"
  if [ "${fail}" -gt 0 ]; then
    printf '  failed: %s\n' "${failed_actions[@]}"
    exit 1
  fi
fi
