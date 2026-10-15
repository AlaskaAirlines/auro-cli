# Auro CI/CD Pipeline Guide

This guide covers four things:

- How the Auro repos build, test and release.
- Where each token is used and what it needs.
- How the branch rules gate releases.
- How to maintain all of it: rotating tokens, setting up a repo, and fixing a stuck release.

It is written for the engineers who maintain the pipeline: members of `@AlaskaAirlines/auro-engineers`, plus the admins who manage secrets and rulesets.

Everything here was checked against the live repos on 2026-10-12. When a workflow, ruleset or script changes, update this guide in the same PR.

### Related docs

- [Auro Teams GitFlow](../src/scripts/rc-workflow/auro-gitflow.md): the sprint process, ticket states and the RC decision.
- [Manual Release Candidate Process](../src/scripts/rc-workflow/manual-rc-process.md): how to cut an RC by hand.
- [README: Release pipeline](../README.md#release-pipeline): the `auro rc-workflow`, `auro pr-release` and `auro check-commits` commands.

---

## 1. Where the pipeline lives

The pipeline is split across several repos.

| Repo | What it holds |
| --- | --- |
| [`auro-actions`](https://github.com/AlaskaAirlines/auro-actions) | The shared workflows every component calls (`workflow_call`), plus the composite actions they use (`build`, `test`, `check-commits`, `pr-preview`). |
| [`auro-templates`](https://github.com/AlaskaAirlines/auro-templates) | The `.github/workflows/*.yml` files each repo uses to call the shared workflows. There are two templates: `default` for standalone components and `formkit` for the monorepo. `auro sync` copies them into a repo. |
| [`auro-config`](https://github.com/AlaskaAirlines/auro-config) | The shared semantic-release config, `configs/releaserc.json`. Component repos pull it in with `"extends": ["@aurodesignsystem/auro-config/releaserc"]`. |
| `auro-cli` (this repo) | The commands the workflows run (`auro rc-workflow`, `auro pr-release`, `auro cc`). Also the `admin-scripts/` used to rotate secrets and reset team access. |
| Each component repo | Its own copy of the template workflows, its repo secrets and its branch rulesets. |

> **Every shared workflow is used at `@main`.** auro-actions has no tags or releases, and the composite actions are also pinned to `@main`. A push to auro-actions `main` takes effect in every component repo straight away. See [Changing a shared workflow](#64-change-a-shared-workflow).

### Which repos use which setup

- **Standalone components** (auro-button, auro-hyperlink, auro-dialog, auro-icon, …) use the `default` template.
- **auro-formkit** uses the `formkit` template and adds a few things. See [auro-formkit differences](#33-auro-formkit-differences).
- **auro-cli** writes its own workflows and doesn't use the templates. See [auro-cli's pipeline](#4-auro-clis-pipeline).
- **Older repos** (`icons`, `AuroDocsSite`) still use a `master` branch and the old auro-library workflows. This guide doesn't cover them.

---

## 2. Branches and the release flow

Three kinds of branch matter:

- `dev`: the default branch, where pull requests merge.
- `rc/<ticketId>`: one release candidate per sprint, named after the ADO Release ticket.
- `main`: what's been released.

```text
feature branch ──PR──▶ dev ──RC Workflow──▶ rc/<ticketId> ──RC PR──▶ main ──Sync Tags──▶ dev
                  │                             │                      │
          PR build on npm               prerelease on npm       release on npm
  (@aurodesignsystem-dev, 0.0.0-prN.i)   (dist-tag rc)          (dist-tag latest)
```

### 2.1 Step by step (component repos)

| # | Event | Workflows that run | Token used | Result |
| --- | --- | --- | --- | --- |
| 1 | A PR is opened or updated against `dev` | **PR Workflow** (`pull-request.yml`), **Check Commits**, **Review Policy** (`check-pr.yml`). auro-formkit also runs **Chromatic** and **Coverage**. | Built-in `GITHUB_TOKEN`, plus OIDC/`NPM_TOKEN` for the npm publish | Builds and tests on Node 22.22.1 and 24, then reports one `action / test-results` check. Publishes a test build to `@aurodesignsystem-dev/<pkg>@0.0.0-pr<N>.<i>` and deploys a preview under `gh-pages/pr-preview/`. Check Commits sets the `semantic-status: …` label. |
| 2 | The PR is closed | PR Workflow (`preview-cleanup`) | `GITHUB_TOKEN` | Removes the PR preview. |
| 3 | The PR merges into `dev` | **Dev Demo** and the **RC Workflow**. auro-formkit also runs the Chromatic baseline. | `GITHUB_TOKEN` for the demo. `GH_TOKEN` and `ADO_TOKEN` for the RC. | Dev Demo publishes the demo to GitHub Pages. The RC Workflow runs `auro rc-workflow` (see 2.2), which creates or updates `rc/<ticketId>` and opens or updates the `RC #<ticketId>` PR to `main`. |
| 4 | `rc/<ticketId>` is pushed | **Release Workflow** (`release.yml`) | OIDC for npm. `GITHUB_TOKEN` for tags and releases. | Builds and tests again, then semantic-release publishes a prerelease such as `12.4.1-rc-1657161.1` on npm dist-tag `rc`, along with a GitHub prerelease. This run's `action / test-results` is the check the `main` ruleset requires on the RC PR. |
| 5 | The RC PR gets one code-owner approval and merges into `main` (merge commit only) | **Release Workflow** and **Sync Tags**, which run in parallel | OIDC for npm. `GITHUB_TOKEN` for the release. `GH_TOKEN` for sync. | semantic-release publishes the stable version on dist-tag `latest` and creates a GitHub release and tag. Sync Tags fast-forwards `dev` to `main`. |
| 6 | Sync Tags pushes to `dev` | Dev Demo and the RC Workflow run again | as in step 3 | The RC Workflow finds nothing on `dev` that isn't on `main`, and skips. |

Two things about versions:

- semantic-release doesn't commit anything back to the repo (`@semantic-release/git` isn't in the plugin list). `package.json` stays at `0.0.0` and `CHANGELOG.md` isn't committed. Releases exist only as git tags, GitHub releases and npm versions.
- The commit messages decide the version bump (conventional commits). `docs(README)`, `refactor` and `style` commits count as patches.

### 2.2 How the RC Workflow picks the release

`auro rc-workflow` creates a release candidate only when the commits on `dev` that aren't on `main` lead to an ADO Release ticket:

1. It collects every `AB#<id>` from those commits.
2. It reads each ticket's links in ADO (org `itsals`) and keeps the linked tickets tagged **`auro-rcs`**. `/auro:create-rcs` creates these Release tickets each sprint, one per repo.
3. If it finds more than one, it keeps the one whose Area Path or title names the repo (for example `auro-button` or `Button`).
4. If it finds none, it logs "No ADO Release ticket is linked…" and **ends successfully without creating an RC**. That's expected when nothing is ready to release, but it looks just like the workflow not working.

Steps 2–4 of the [manual process](../src/scripts/rc-workflow/manual-rc-process.md) document the same logic.

---

## 3. Workflow reference (component repos)

### 3.1 Workflow files in each repo (from `auro-templates/templates/default`)

| File | Runs on | Calls (`auro-actions/.github/workflows/…@main`) | Secrets it passes |
| --- | --- | --- | --- |
| `add-project.yml` | issue opened | `add-project.yml` | none |
| `check-commits.yml` | PR opened, reopened, unlabeled or updated | `check-commits.yml` | none |
| `check-pr.yml` | review submitted, edited or dismissed; PR labeled or updated | `check-pr.yml` | none |
| `codeql.yml` | push to `main`; PR to `main` | `codeql.yml` | none |
| `dev-demo.yml` | push to `dev` | `dev-demo.yml` | none |
| `pull-request.yml` | PR opened, updated, reopened or closed (skipped when the base is `main` or `rc/**`) | `pull-request.yml` | `NPM_TOKEN` |
| `release-candidate.yml` | push to `dev`; manual run | `release-candidate.yml` | `GH_TOKEN`, `ADO_TOKEN` |
| `release.yml` | push to `main` or `rc/**`; manual run | `release.yml` | `NPM_TOKEN` |
| `sync-tags.yml` | push to `main`; manual run | `sync-tags.yml` | `GH_TOKEN` |

### 3.2 What each shared workflow does

| Shared workflow | What it does | Tokens |
| --- | --- | --- |
| `pull-request.yml` | Builds, runs the test matrix and reports the `test-results` check. Publishes the PR build with `auro pr-release` and `npm publish --provenance`. Deploys and later removes the preview. | `NODE_AUTH_TOKEN: NPM_TOKEN` (OIDC is also enabled), `GITHUB_TOKEN` |
| `release.yml` | Builds, runs the test matrix and reports `test-results`. On **push events only**, runs `npx semantic-release` (Node 22.22.1, npm 11.12.1). | `GITHUB_TOKEN`, `NPM_TOKEN` (fallback); OIDC through `id-token: write` |
| `release-candidate.yml` | Runs `npx @aurodesignsystem/auro-cli auro rc-workflow`, using the **latest published** auro-cli, not this repo's `dev`. | `GITHUB_TOKEN: GH_TOKEN \|\| GITHUB_TOKEN`, `ADO_TOKEN` (required) |
| `sync-tags.yml` | Fast-forwards `dev` to `main`. Errors if `dev` has commits that aren't on `main`. | `GH_TOKEN` (required, used for checkout and push) |
| `check-commits.yml` | Runs `auro cc -l -d`, which checks commit messages and sets the `semantic-status` label. | `GITHUB_TOKEN` |
| `check-pr.yml` | Requires one approval on PRs labeled `semantic-status: breaking`, and posts a sticky comment until it gets one. | `GITHUB_TOKEN` |
| `dev-demo.yml` | Builds the demo and deploys it to `gh-pages` from `dev`. | `GITHUB_TOKEN` |
| `chromatic.yml` | Runs Chromatic visual tests on PRs and accepts the baseline on `dev`. | `CHROMATIC_PROJECT_TOKEN` |
| `codeql.yml` | **Turned off** (`if: false`). It always shows as skipped. | none |
| `add-project.yml` | Adds new issues to org project 19. **It currently fails on every run** (see [Known issues](#8-known-issues)). | `GITHUB_TOKEN` |
| `no-build_pull-request.yml`, `no-build_release.yml` | Versions of the PR and release workflows for packages with no build step. | same as the build versions |

**Names the shared workflows depend on:**

- The shared RC workflow's fallback runs **`release.yml`** by file name, so the release workflow must keep that name and its `workflow_dispatch` trigger.
- Branches are `dev`, `main` and `rc/*`. The `rc/**` ruleset also requires names that match `^rc/\d+(\.\d+)?$`.
- PR previews go on `gh-pages` under `pr-preview/`.

### 3.3 auro-formkit differences

- It adds `chromatic.yml` (needs `CHROMATIC_PROJECT_TOKEN`) and an inline `coverage.yml` that runs `test:wtr` and uploads to Codecov.
- `pull-request.yml` and `release.yml` add a Playwright install, `npm run test:dist`, a 15-part `test-matrix`, and extra `cache-dirs`. The `formkit` template doesn't have these yet; auro-templates PR #34 adds some of them.
- `.releaserc` is an **inline copy** of the auro-config release config instead of an `extends`, so changes to auro-config don't reach it.

---

## 4. auro-cli's pipeline

auro-cli doesn't call the shared workflows. Its own workflows are:

| File | Runs on | What it does | Tokens |
| --- | --- | --- | --- |
| `test-and-release.yml` | Push to `main` or `rc/**`. PRs to `main`, `rc/**` or `dev`. | `test` runs on ubuntu and windows with Node 22 and 24; these four jobs are the required checks. `release` runs only on pushes to `main` or `rc/*`: Node 22, npm 12, `npm audit signatures`, build, `npx semantic-release`. | `GITHUB_TOKEN: ACCESS_TOKEN` (PAT), `NPM_TOKEN`, OIDC |
| `pr-release.yml` | PRs, skipped when the base is `main` or `rc/**` | Publishes a PR build and comments on the PR. | `NPM_TOKEN`, OIDC, `GITHUB_TOKEN` |
| `check-commits.yml` | PR opened or updated | `auro-internal cc -l -d` | `ACCESS_TOKEN` |
| `sync-tags.yml` | `release: published`, only for releases from `main` | Fast-forwards `dev` to the release tag. | `ACCESS_TOKEN` |
| `codeql.yml` | Push to `main`; PRs to `main` | CodeQL. This one actually runs. | `GITHUB_TOKEN` |

How auro-cli's setup differs from the components:

- **No RC Workflow yet.** RCs are created by running `auro rc-workflow` locally (see [6.5](#65-cut-an-rc-by-hand)). Adding `.github/workflows/release-candidate.yml` is tracked in **AB#1662438**. The repo already has the `GH_TOKEN` and `ADO_TOKEN` secrets it needs.
- **Releases use `ACCESS_TOKEN`, not the built-in token.** Because a PAT publishes the GitHub release, the `release: published` event fires, so `sync-tags.yml` can still listen for it. The component repos moved Sync Tags to push-to-`main` because their releases are published by the built-in token, which doesn't trigger other workflows.
- **`dev` only allows rebase merges.** The component repos allow merge or rebase.

---

## 5. Tokens and secrets

### 5.1 Why some steps need personal access tokens

GitHub's built-in `GITHUB_TOKEN` handles most steps, but it has two limits that matter here:

1. **Anything it pushes or publishes doesn't start other workflows.** If the RC Workflow created `rc/<id>` with the built-in token, the Release Workflow wouldn't run on it.
2. **It can't bypass rulesets.** `dev` requires a pull request, so only an account on the ruleset's bypass list can push there directly, which is what Sync Tags does.

Those steps use a personal access token (PAT) instead. **Automation acts as whoever owns the PAT**, so that account needs the right access, and it can't be the one to approve PRs the automation opens. To see who owns a token:

```sh
gh api user -H "Authorization: token <PAT>" -q .login
```

### 5.2 Secret reference

| Secret | What it is | Used by | What it needs | Where it's set | How to rotate |
| --- | --- | --- | --- | --- | --- |
| `GH_TOKEN` | GitHub PAT | RC Workflow (creates `rc/<id>` and the RC PR so the Release Workflow runs) and Sync Tags (pushes to `dev`) | Classic: `repo` and `workflow`. Fine-grained: Contents, Issues, Pull requests and Workflows set to Read & write. **SSO-authorized for AlaskaAirlines.** The owner needs write access to the repos and must be in **`auro-release-managers`**, the `dev` bypass team. | Repo secret on every repo that runs the RC Workflow | `admin-scripts/update-repo-secret-GH_TOKEN.sh` |
| `ADO_TOKEN` | Azure DevOps PAT, org `itsals` | RC Workflow (finds the `auro-rcs` Release ticket) | **Work Items: Read** only. Set an expiry date and plan to rotate before it. | Repo secret on the same repos as `GH_TOKEN` | `admin-scripts/update-repo-secret-ADO_TOKEN.sh` |
| `ACCESS_TOKEN` | GitHub PAT | **auro-cli only**: semantic-release GitHub steps, Check Commits and Sync Tags. The `icons` repo also uses it. It's set on the component repos, but no component workflow reads it. | Classic: `repo` and `workflow` (plus `read:org` if needed). Fine-grained: Contents, Pull requests and Workflows set to Read & write. | Repo secret on all 44 Auro repos | `admin-scripts/update-repo-secret-ACCESS_TOKEN.sh` |
| `NPM_TOKEN` | npm automation token | **Backup only.** Releases authenticate with npm trusted publishing (OIDC); the logs show the OIDC exchange succeeding. PR builds (`npm publish --provenance`) pass it as `NODE_AUTH_TOKEN`, and it isn't confirmed whether they use OIDC or the token. | Publish access to `@aurodesignsystem` and `@aurodesignsystem-dev` | Repo secret | No script; set it by hand (see [6.3](#63-rotate-npm_token)) |
| `CHROMATIC_PROJECT_TOKEN` | Chromatic project token | Chromatic workflow (auro-formkit) | Comes from the Chromatic project | auro-formkit | Set it by hand |
| `GITHUB_TOKEN` | Built-in, created for each run | Everything else: previews, demos, labels, comments, and semantic-release tags and releases in the component repos | Permissions come from each workflow's `permissions:` block. The repo default is `write`. | Automatic | — |

**Leftovers you can ignore:**

- The org secrets `AURO_SURGE_TOKEN`, `SONAR_TOKEN`, `SONAR_TOKEN_STAGE` and `SONAR_URL_STAGE` aren't used by any current workflow. `pull-request.yml` still declares `AURO_SURGE_TOKEN` as optional, but nothing reads it; Surge was replaced by GitHub Pages previews.
- auro-formkit's `ANTHROPIC_API_KEY` isn't used by any workflow on `dev`.

To list a repo's secrets (names only):

```sh
gh secret list -R AlaskaAirlines/<repo>
gh api repos/AlaskaAirlines/<repo>/actions/organization-secrets --jq '.secrets[].name'
```

### 5.3 Token hygiene

- **Never paste a token into chat, a PR, an issue or a commit.** If one leaks, revoke it right away, create a new one, and update every secret that held it (see section 6).
- When running the scripts, use the prompt or `export NEW_TOKEN=…` instead of passing the token as an argument; arguments show up in shell history and the process list.
- Write down each PAT's expiry date. An expired `GH_TOKEN` or `ADO_TOKEN` makes RCs fail across every repo at once.

---

## 6. How-to guides

All the admin scripts are in `admin-scripts/`. You need:

- `gh` installed and logged in, with SAML SSO authorized for AlaskaAirlines.
- Admin access to the target repos.

Each script supports `DRY_RUN=1` (`update-repo-teams.sh` is a dry run unless you set `APPLY=1`). **Always do a dry run first.**

### 6.1 Rotate `GH_TOKEN` or `ACCESS_TOKEN`

1. **Create the PAT** with the scopes from [5.2](#52-secret-reference). Do this on the account the automation should act as.
2. **Authorize it for SSO:** Settings → Tokens → Configure SSO → AlaskaAirlines. A token without SSO "fails silently".
3. **For `GH_TOKEN`:** confirm the owner is in `auro-release-managers`. Otherwise Sync Tags can't push to `dev`.
4. **Run the script**, dry run first:

   ```sh
   export NEW_TOKEN='<new PAT>'   # or leave it unset and the script prompts
   DRY_RUN=1 ./admin-scripts/update-repo-secret-GH_TOKEN.sh
   ./admin-scripts/update-repo-secret-GH_TOKEN.sh
   # optional: start the RC Workflow on one repo as a check
   VERIFY_REPO=auro-hyperlink ./admin-scripts/update-repo-secret-GH_TOKEN.sh
   ```

   - **`update-repo-secret-GH_TOKEN.sh`** finds the repos that already have a `GH_TOKEN` secret (`MODE=discover`, the default). Use `MODE=all` to cover every repo in the org. Before writing anything, it checks that the token resolves to a user, can read the org, and has push access.
   - **`update-repo-secret-ACCESS_TOKEN.sh`** updates a fixed list of 44 repos, written in the script.
5. **Revoke the old PAT**, and `unset NEW_TOKEN`.

### 6.2 Rotate `ADO_TOKEN`

1. Create an Azure DevOps PAT in org `itsals` with **Work Items: Read**, at <https://itsals.visualstudio.com/_usersSettings/tokens>.
2. Run the script, dry run first:

   ```sh
   export NEW_TOKEN='<new ADO PAT>'
   DRY_RUN=1 ./admin-scripts/update-repo-secret-ADO_TOKEN.sh
   ./admin-scripts/update-repo-secret-ADO_TOKEN.sh
   ```

   It checks the PAT against `https://dev.azure.com/itsals/_apis/connectionData` first. It finds target repos by looking for the `GH_TOKEN` secret (`DISCOVER_BY_SECRET`).
3. Note the new expiry date, then revoke the old PAT.

### 6.3 Rotate `NPM_TOKEN`

There's no script. For each repo that needs it:

```sh
gh secret set NPM_TOKEN --repo AlaskaAirlines/<repo>   # prompts for the value
```

Releases use OIDC trusted publishing, so `NPM_TOKEN` is only a backup there. **Don't delete it** until it's confirmed that PR builds to `@aurodesignsystem-dev` also use OIDC. That requires trusted-publisher settings for each package on npmjs.com.

### 6.4 Change a shared workflow

Changes to auro-actions `main` take effect in every repo straight away, so:

1. Make the change on a branch in auro-actions.
2. In **one** component repo, on a test branch, point the workflow at your branch, e.g. `uses: AlaskaAirlines/auro-actions/.github/workflows/release.yml@<your-branch>`. Run it with `workflow_dispatch` or a test PR.
3. Merge to auro-actions `main`, then remove the test branch.
4. If the change adds a **required** secret or input, update **both templates** in auro-templates and every repo that calls the workflow, *before* merging. Otherwise those repos fail when the run starts.

### 6.5 Cut an RC by hand

Do this when the RC Workflow doesn't exist yet (as in auro-cli) or failed. Run it from an up-to-date local `dev`:

```sh
git checkout dev && git pull --ff-only
GITHUB_TOKEN=$(gh auth token) ADO_TOKEN=$ADO_PAT auro rc-workflow
```

- Locally, `auro rc-workflow` compares `origin/main` with your **local** `dev`, so if `dev` is behind it finds nothing to release.
- Your `gh` account becomes the RC PR's author, so you can't approve that PR yourself.
- The fully manual steps are in [manual-rc-process.md](../src/scripts/rc-workflow/manual-rc-process.md).

To re-run a repo's RC Workflow without merging anything:

```sh
gh workflow run "RC Workflow" --ref dev -R AlaskaAirlines/<repo>
```

### 6.6 Set up the pipeline in a new or out-of-date repo

1. **Workflows.** Run `auro sync` to copy `.github/` from auro-templates. Until the template bugs in [Known issues](#8-known-issues) are fixed, also do these by hand:
   - In `release-candidate.yml`, add `ADO_TOKEN: ${{ secrets.ADO_TOKEN }}` under `secrets:`.
   - In `sync-tags.yml`, check that the result says `GH_TOKEN: ${{ secrets.GH_TOKEN }}` and not `GH_TOKEN: $`.
2. **Secrets.** Add `GH_TOKEN`, `ADO_TOKEN` and `NPM_TOKEN`, plus `CHROMATIC_PROJECT_TOKEN` for formkit-style repos. Rerun the rotation scripts with `MODE=all`, or `gh secret set` each one.
3. **Teams and CODEOWNERS.** Add the repo to the lists in `update-repo-teams.sh` and `update-repo-secret-ACCESS_TOKEN.sh`, then run `update-repo-teams.sh` (a dry run first, then `APPLY=1`). It:
   - Grants auro-admin admin, auro-engineers maintain, alaska-internal-contributors push, and auro-team pull.
   - Removes the old teams and any individual collaborators.
   - Commits `.github/CODEOWNERS` = `* @AlaskaAirlines/auro-engineers` directly to the default branch.
4. **Rulesets.** Create the three rulesets in [section 7](#7-branch-rulesets) by copying an existing repo's (Settings → Rules → Rulesets → Import/Export).
5. **ADO.** Create the repo's Area Path under `E_Retain_Content\Auro Design System\<repo>` so `/auro:create-rcs` can make its Release tickets.

---

## 7. Branch rulesets

None of the repos use classic branch protection. Each one has three repository rulesets, and no org-level rulesets were found.

| Rule | **Dev** (`refs/heads/dev`) | **Main** (`refs/heads/main`) | **Release branches** (`refs/heads/rc/**`) |
| --- | --- | --- | --- |
| Bypass list | team `auro-release-managers` (always) | **none** | none |
| Block deletion and force push | yes / yes | yes / yes | no / yes |
| Pull request required | yes | yes | — |
| Approvals required | 1 | 1 | — |
| Must be a code owner | no | **yes** | — |
| Approval must come after the last push | no | yes on auro-cli and auro-formkit, **no on auro-button** | — |
| New pushes dismiss old approvals | yes | yes | — |
| All conversations resolved | yes | yes | — |
| Merge methods | auro-cli: rebase only. Components: merge or rebase. | merge only | — |
| Required checks | Components: `action / test-results`. auro-cli: `test (ubuntu-latest, 22)`, `(ubuntu-latest, 24)`, `(windows-latest, 22)`, `(windows-latest, 24)` | same as Dev | — |
| Branch name rule | — | — | `^rc/\d+(\.\d+)?$` |

### Who can approve an RC PR

CODEOWNERS is `* @AlaskaAirlines/auro-engineers` in every repo, and the Main ruleset requires a code-owner approval. So **an RC PR needs one approval from an `auro-engineers` member who has write access to the repo**, and that person can't be the PR's author (whoever owns the token that opened the PR).

If someone has two GitHub accounts, only the one on the team counts. If a PR shows "Review required" after it has been approved, check whose approval it is:

```sh
gh api orgs/AlaskaAirlines/teams/auro-engineers/memberships/<login> --jq .state   # 404 = not on the team
gh api repos/AlaskaAirlines/<repo>/collaborators/<login>/permission --jq .permission
```

To read a repo's rules:

```sh
gh api repos/AlaskaAirlines/<repo>/rules/branches/main
gh api repos/AlaskaAirlines/<repo>/rulesets --jq '.[] | [.id, .name] | @tsv'
gh api repos/AlaskaAirlines/<repo>/rulesets/<id>
```

---

## 8. Known issues

These were all open as of 2026-10-12. Remove each one when it's fixed.

| Issue | Effect | Fix |
| --- | --- | --- |
| Template `release-candidate.yml` (both templates, upstream too) doesn't pass `ADO_TOKEN`, but the shared workflow requires it. | A repo set up fresh from the templates gets an RC Workflow that fails when it starts. Every live repo has added the line by hand. | Add `ADO_TOKEN: $\{{ secrets.ADO_TOKEN }}` to both templates. |
| Template `sync-tags.yml` uses `${{` without escaping it (every other template uses `$\{{`). | `auro sync` renders it as `GH_TOKEN: $`. | Escape it as `$\{{ secrets.GH_TOKEN }}` in both templates. |
| The RC Workflow's backup path for when there's no `GH_TOKEN` can't publish. | It runs `release.yml` by `workflow_dispatch`, but the release job only runs on `push`. It also picks the highest-numbered `rc/*` branch, which may not be the new one. | Keep `GH_TOKEN` set on every repo, or fix the backup path in auro-actions. |
| `add-project.yml` fails on every run ("Could not resolve to a ProjectV2 with the number 19"). | New issues aren't added to the project board. | Use a PAT or GitHub App token with `project` scope, or fix the project number. |
| CodeQL is turned off in auro-actions (`if: false`). | No CodeQL scanning on component repos. auro-cli's own CodeQL still runs. | Turn it back on, or remove it. |
| Everything uses `@main` (no tags). The RC Workflow uses the latest published auro-cli. | One bad push to auro-actions `main`, or one bad auro-cli release, breaks every repo. | Consider tagged auro-actions releases. |
| The `rc/**` ruleset blocks force pushes with no bypass, but `auro rc-workflow` and the manual process force-update existing RC branches. | Updating an RC branch should fail when it isn't a fast-forward. Not tested. | Allow a bypass, or recreate the RC branch instead of force-pushing. |
| The Main ruleset's "approval must come after the last push" setting differs (auro-button `false`, the others `true`). | Inconsistent behavior. For RC PRs it makes no practical difference. | Pick one value and apply it to every repo. |
| The `dev` bypass team, `auro-release-managers`, is one of the teams `update-repo-teams.sh` removes from repos. | Retiring the team would quietly remove the only `dev` bypass and break Sync Tags. | Keep the team, or move the bypass to another team before retiring it. |
| auro-button's team access doesn't match: `auro-team` has admin, `nonauroteamwriteaccess` has push, and there are no `auro-engineers` or `auro-admin` grants. | Code-owner reviews depend on access inherited through `auro-team`. | Run `update-repo-teams.sh` for auro-button again. |
| `update-repo-secret-ACCESS_TOKEN.sh` passes the token with `--body`. | The token shows up in the process list while the script runs. | Pass it on stdin, as the `GH_TOKEN` and `ADO_TOKEN` scripts do. |
| No rotation script for `NPM_TOKEN`, and it isn't confirmed whether PR builds use OIDC or the token. | You can't safely retire `NPM_TOKEN` yet. | Confirm trusted publishing for `@aurodesignsystem-dev/*`, then decide. |
| The auro-actions README still lists `AURO_SURGE_TOKEN` as required and calls `NPM_TOKEN` required. | Misleading setup instructions. | Update the README. |
| auro-cli has no RC Workflow. | RCs have to be cut by hand. | AB#1662438 |

---

## 9. Troubleshooting

| What you see | Likely cause | What to do |
| --- | --- | --- |
| RC Workflow succeeds but no RC branch or PR appears | No `AB#<id>` in the commits on `dev` that aren't on `main`, or the tickets aren't linked to an `auro-rcs` Release ticket | Check the run log. Link the work to the sprint's Release ticket (`/auro:create-rcs`) and run the workflow again. |
| RC Workflow fails: "Found N Release tickets but none could be matched to `<repo>`" | Several `auro-rcs` tickets are linked, and none (or more than one) names the repo | Fix the Release ticket's Area Path or title so exactly one names the repo. |
| RC Workflow fails right away about the `ADO_TOKEN` secret | The repo's `release-candidate.yml` doesn't pass `ADO_TOKEN` | Add it (see [6.6](#66-set-up-the-pipeline-in-a-new-or-out-of-date-repo)). |
| RC Workflow fails reaching ADO (401, or an HTML sign-in page) | `ADO_TOKEN` has expired or lacks Work Items Read | Rotate it ([6.2](#62-rotate-ado_token)). |
| `rc/<id>` exists, but no Release Workflow or checks ran on it | `GH_TOKEN` is missing or expired, so the branch was pushed by the built-in token | Rotate `GH_TOKEN` ([6.1](#61-rotate-gh_token-or-access_token)), then run the RC Workflow again. |
| The RC PR still says "Review required" after it's been approved | The approver isn't on `auro-engineers`, has read-only access, or is the PR's author; or a newer push dismissed the approval | See [Who can approve an RC PR](#who-can-approve-an-rc-pr). |
| The RC PR is blocked on checks | `action / test-results` (components) or the four `test (…)` jobs (auro-cli) failed or haven't run on the latest commit | Fix the tests on `dev`. Merging the fix updates the RC. |
| Sync Tags fails: "dev has commits not on main" | Something was merged to `dev` while the RC was open, so `dev` can't fast-forward to `main` | Nothing is lost, but `dev` won't have `main`'s release merge commit or tag. Merge `main` into `dev` with a PR, or run Sync Tags by hand (`gh workflow run "Sync Tags" --ref main -R AlaskaAirlines/<repo>`) once `dev` has no unreleased commits. |
| Sync Tags fails to push to `dev` | `GH_TOKEN` has expired, or its owner isn't in `auro-release-managers` | Rotate the token or fix the owner's team membership. |
| Rotation scripts fail with 403 or SAML errors | Your `gh` session or the PAT isn't SSO-authorized, or you aren't an admin on the repo | Authorize SSO, then `gh auth refresh -h github.com -s repo,read:org` (the teams script also needs `admin:org`). |
| A workflow broke in every repo at once | A recent push to auro-actions `main`, or a new auro-cli release (the RC Workflow runs the latest published one) | Check the recent auro-actions commits and auro-cli releases, then revert or fix. |
