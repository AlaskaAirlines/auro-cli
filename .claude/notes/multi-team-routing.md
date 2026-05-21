# Multi-team routing — design notes

## Why this doc exists

The auro version-bot is intentionally limited to a single ADO destination during the testing phase: every ticket lands on `E_Retain_Content\Auro Design System` (Jordan's team's board, via Lindsey). That's a deliberate safety choice for rollout, not the end-state design.

**The production goal:** tickets are routed to the **consumer team's** appropriate work-tracker destination — the team that actually owns the repo with the outdated dependency — not to the Auro team's board.

This doc captures the implications, open questions, and sequencing for getting from the current single-board state to a multi-team consumer state. It also serves as the conversation prompt for the eventual scoping discussion with Lindsey.

**This doc does NOT yet contain decisions.** Those happen in conversation. What it does contain: the problem space mapped out so the conversation can be efficient.

---

## Today vs production

| Dimension | Today (testing) | Production goal |
|---|---|---|
| Destination | Hardcoded `itsals` / `E_Retain_Content` / `E_Retain_Content\Auro Design System` | Per-candidate, derived from repo → team mapping |
| Number of orgs/projects written to | 1 | Many (potentially every team in `Alaska-ECommerce` with a repo using Auro) |
| Trackers supported | ADO only | Possibly ADO + Jira + Linear + GitHub Issues, depending on which trackers consumer teams use |
| Authentication | One personal/bot PAT with write to `E_Retain_Content` | Service account PAT(s) with write to many destinations |
| Governance | Lindsey owns review of every ticket | Each consumer team owns review of their own tickets |
| Opt-in model | Explicit (Lindsey chose to participate) | Per-team opt-in required before any tickets are created on their board |
| Rate limiting | No (we just use `--limit` manually) | Per-team caps to prevent backlog floods |

---

## Why today's design doesn't yet support multi-team

**`createADOWorkItem` hardcodes the destination.** Reference: `src/scripts/ado/index.ts:372-374`.

```typescript
const orgUrl = "https://dev.azure.com/itsals";
const projectName = "E_Retain_Content";
const areaPath = "E_Retain_Content\\Auro Design System";
```

The Phase 4 refactor pulled `title` / `descriptionHtml` / `tags` / `acceptanceCriteriaHtml` up to be caller-specified, but `orgUrl` / `projectName` / `areaPath` stayed inside because at the time every caller wanted the same destination. Multi-team breaks that assumption.

This is fixable — they become inputs on `CreateADOWorkItemInput` — but the parameterization is the smallest part of the work. The real work is the upstream mapping problem: where does the bot learn each repo's destination?

---

## Hard problems to solve (mostly NOT code problems)

### A. Discovery — repo → team mapping

The bot needs, for every consumer repo:
- The owning team's identity
- Their preferred work-tracker (ADO? Jira? Linear? GitHub Issues?)
- The specific destination within that tracker (project, area path, board, etc.)
- Any team-specific conventions (priority defaults, sprint handling, custom fields)

**Possible sources of truth, with tradeoffs:**

| Source | Pros | Cons |
|---|---|---|
| Static JSON in `auro-cli` (`team-routing.json`) | Centralized, easy to read, versioned with code | Drifts as teams reorg; one team has to maintain it forever |
| GitHub `CODEOWNERS` on consumer repos | Decentralized, each team owns their own; already used for review routing | Only points at GitHub teams, not work-tracker destinations; needs an extra layer to map team → tracker |
| GitHub repo topics (e.g. `team:retail`, `tracker:ado`, `area-path:E_Retain_Content/Retail`) | Decentralized, easy to set per-repo | Topics are flat strings — encoding conventions get messy fast |
| Lindsey's existing dashboard data | She may already maintain this for her own routing — worth asking | Couples the bot to dashboard internals |
| Backstage (`sdp-backstage` is in the workspace) | Backstage is the canonical "who owns what" registry at many orgs | Requires Backstage to actually be populated for these repos; may not be |
| Central wiki / Slack | Human-readable | Not machine-readable without scraping |

**Recommendation to discuss with Lindsey:** does she already have a repo → team mapping for her dashboard? If yes, that's the path of least resistance. If no, leaning toward `CODEOWNERS` + a small per-team config file (`.auro-version-bot.json` or similar) committed to each consumer repo, so each team owns their own routing config.

### B. Permissions / PAT scope

Today: Jordan's personal PAT writes to one ADO project. Works because of `Work Items: Read, write, & manage` scope.

Multi-team: a bot account needs write access to potentially every team's project. Three patterns:

1. **Org-wide write scope.** Bot account is admin in `itsals`. Easiest technically; biggest InfoSec concern. Likely rejected.
2. **Per-team explicit grant.** Each consumer team adds the bot account to their project with appropriate scope. Slow rollout (paced by each team's responsiveness) but minimal blast radius if PAT leaks.
3. **Sponsorship model.** Lindsey's team's bot has blanket write access via a Service Connection or similar mechanism, with audit trail to the Auro team. Compromise — needs platform team buy-in.

**This is an InfoSec / Platform conversation, not a code conversation.** The bot account itself is a Tier 3 prereq Jordan hasn't started yet (deliberately). Multi-team routing piles more requirements onto that conversation.

### C. Governance and opt-in

If the bot creates 50 tickets on a random team's backlog overnight, that team will rightfully be upset. Production design needs:

1. **Opt-in per consumer team.** A team must explicitly sign up to receive bot tickets. Probably implemented as the same `.auro-version-bot.json` (or repo topic) that carries routing config — its presence = consent.
2. **Per-team rate limits.** No more than N new tickets per week per team. The bot suppresses overflow until the next window.
3. **Pre-notification.** Slack / email to the team's lead before the first batch. "The Auro team is going to start opening tickets on your board for outdated dep upgrades. Reply STOP to opt out."
4. **Self-service unsubscribe.** A team should be able to remove the opt-in marker and stop receiving tickets without filing a ticket against the Auro team.
5. **Audit trail.** Every ticket the bot creates is logged with timestamp + destination + candidate metadata, queryable by team.

This is an org-behavior design problem, not a coding problem. Worth talking to other teams that have automated work-item creation in Alaska to see what patterns have already been tried.

### D. Multi-tracker support

Some Alaska teams may not be on ADO. Likely candidates:
- Jira (especially product / non-engineering teams)
- Linear (newer teams)
- GitHub Issues (smaller teams without ADO setup)

Production may need:
- An adapter layer per tracker — `createADOWorkItem`, `createJiraIssue`, `createLinearIssue`, `createGitHubIssue` — all conforming to a shared interface
- Per-tracker auth (more env vars: `JIRA_TOKEN`, `LINEAR_TOKEN`, `GH_BOT_TOKEN`)
- Per-tracker field mapping (a "User Story" in ADO is not 1:1 the same as a Jira "Story" or a Linear "Issue") — the template + AC + tags need translation
- Per-tracker dedupe queries (each tracker has different query languages)

This is where the lift gets significantly larger. **Worth pinning down which trackers consumer teams actually use before designing this** — if 95% of `Alaska-ECommerce` consumer teams are on ADO, this can be deferred until the long tail forces it.

### E. Dedupe across teams

Today's planned dedupe (Tier 2) queries one ADO project for existing tickets. Multi-team dedupe is more complex:

- Bot needs to dedupe per destination (a ticket on Team A's board has nothing to do with one on Team B's)
- For multi-tracker, each tracker has its own query mechanism
- A potential alternative: maintain a local "tickets I've created" log (per-run JSON file) the bot consults before each create. Decouples dedupe from per-tracker query languages.

The local-log approach is more robust for multi-tracker but harder to reconcile if someone manually closes a ticket in the destination tracker (the local log doesn't know).

**Recommendation:** start with per-destination WIQL-style queries during ADO-only testing. Revisit when the second tracker shows up.

### F. Failure isolation

If Team A's ADO project is down or the bot's PAT scope changed for Team B, the batch shouldn't fail entirely. Today's `processCandidate` catches per-candidate errors and continues — that pattern works for multi-team too, but verify:

- A 401 from one destination doesn't poison the connection used for other destinations (Octokit / azdev connection objects per-destination, not shared)
- Per-destination error reporting in the summary so it's clear which team's run had issues
- Optionally, a per-destination "circuit breaker": if 3 consecutive failures hit one destination, skip remaining candidates for that destination and continue with others

---

## Questions for Lindsey

The list to bring to the scoping conversation. Phrased as decisions she can confirm or redirect, not as open-ended brainstorms.

### Discovery / mapping
1. Does her existing dashboard maintain a repo → team mapping the bot can consume? If yes, what's the format and how is it kept fresh?
2. If no centralized mapping exists, what's the right path of least resistance — `CODEOWNERS` + per-repo config, repo topics, Backstage, or something new?
3. How are reorgs handled today (a team splits, a team renames, ownership changes)? Whatever that process is, the bot's mapping needs to flow through it.

### Permissions
4. Has Lindsey or anyone else talked to platform / InfoSec about a service account with write access to multiple ADO projects? What was the outcome?
5. If per-team explicit grant is the model, is there an existing precedent (which other automated tools do this) and roughly how long is the per-team turnaround?

### Governance
6. Is there an existing convention at Alaska for cross-team automated ticket creation? What patterns have worked / failed?
7. Is opt-in or opt-out the right default? (Strong recommendation: opt-in for v1; consider opt-out only after multiple teams have run with it for months.)
8. Per-team rate limits — what's a reasonable cap that won't flood a backlog? Lindsey may know what consumer teams will tolerate.
9. Should her team's board still receive a weekly *summary* ticket (e.g. "the bot opened 23 tickets across 7 teams this week") even when individual tickets route elsewhere?

### Trackers
10. How many `Alaska-ECommerce` consumer teams use ADO vs. Jira / Linear / GitHub Issues? If it's ~all-ADO, multi-tracker can be deferred.
11. Is there a known list of teams that have already opted out of ADO (or never used it)? Those are the trackers that have to be supported in v1.

### Sequencing
12. Is multi-team routing a v1.1 (close on heels of testing-phase success) or a v2 (after months of single-board operation) initiative?
13. Should the first consumer team (after Lindsey's) be a known-friendly team Jordan / Lindsey have a working relationship with, or run via a more formal process?

---

## What changes in code (once design is settled)

**These don't happen until the discovery + permissions + governance design is settled.** Listed here for completeness so future sessions know the lift.

1. **`createADOWorkItem` becomes truly generic.** `orgUrl` / `projectName` / `areaPath` move from hardcoded constants into `CreateADOWorkItemInput` fields.
2. **New `routing` module** — `src/scripts/version-bot/routing.ts`. Single function `resolveDestination(candidate: UpgradeCandidate): Destination | null`. Returns `null` if the consumer team hasn't opted in (suppress ticket creation for that candidate).
3. **`processCandidate` looks up destination per candidate.** If `null`, skip with a "team-not-opted-in" log line; otherwise call helper with the resolved destination.
4. **`check-tokens` validates against destinations the bot will actually write to.** Instead of just `itsals/E_Retain_Content`, iterate over distinct destinations from the routing config and verify write scope on each. Slow on first run, but catches PAT-scope problems before any `--apply`.
5. **Dedupe (Tier 2) extends to per-destination queries.** `runCreateTickets` accumulates a per-destination cache of "already exists" results so the same WIQL query doesn't fire twice in a batch.
6. **Per-destination summary in the summary footer.** Counts of applied / skipped / failed grouped by destination so a reader sees which teams got which.
7. **Per-team rate limit logic.** Probably: per-destination, count tickets already created in the last N days (via WIQL or local log), suppress if cap hit.
8. **(If multi-tracker) New tracker adapters.** Each conforms to a shared `WorkItemTracker` interface. `processCandidate` dispatches to the right adapter based on `Destination.tracker`.
9. **Pre-notification mechanism.** Probably out-of-band (Slack webhook / email) rather than in the CLI; the CLI just checks "has this team been notified" before its first ticket lands there.

---

## Sequencing / dependencies

In rough chronological order. Some can run in parallel.

```
[NOW] Testing phase → first --apply with Lindsey on E_Retain_Content
   |
   v
[Phase B from handoff doc] Tier 2 dedupe (single-destination WIQL)
   |
   v
[Org work] Bot service account provisioned for E_Retain_Content
   |
   v
[Phase C from handoff doc] GitHub Actions cron, single-destination
   |
   v
================================================================
Multi-team routing work begins here
================================================================
   |
   +--- [Org] Conversations with Lindsey (this doc's question list)
   |      |
   |      v
   |    Discovery design settled (where mapping lives)
   |    Permissions design settled (who has access to what)
   |    Governance design settled (opt-in mechanics)
   |      |
   |      v
   +--- [Code] Refactor createADOWorkItem to take destination
   |
   +--- [Code] Add routing module + integration in processCandidate
   |
   +--- [Code] Per-destination dedupe + check-tokens validation
   |
   +--- [Org] First non-Auro team opts in (pilot)
   |      |
   |      v
   |    Single-team multi-team test (real --apply against pilot's board)
   |      |
   |      v
   +--- [Code, if needed] Multi-tracker adapter layer
   |
   +--- [Org] Gradual rollout to additional teams
```

**Total elapsed time guess:** 2–6 months from "first single-team --apply works" to "first multi-team --apply works." Most of that is org / governance, not code.

---

## Status

- **2026-05-08:** Doc created. Captures the design space; no decisions made yet. Conversation with Lindsey not yet scheduled.
- **TBD:** Lindsey conversation date.
- **TBD:** Discovery / permissions / governance decisions.
- **TBD:** First multi-team `--apply`.

Update this section as decisions land.
