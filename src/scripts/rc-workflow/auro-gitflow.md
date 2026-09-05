# Auro Teams GitFlow

This document describes how the Auro teams plan, track, and release work now that
release tracking lives in Azure DevOps (ADO) rather than GitHub.

## Background

Previously, the Release Candidate (RC) process created a new GitHub issue and linked
the RC pull request to it. Since the team now does all work tracking in ADO, that
GitHub-based linkage no longer surfaces in our boards — the tracking is effectively
lost. The process below re-establishes release tracking in ADO using a dedicated
**Release Candidate ticket** per repository.

## Sprint Planning

- During sprint planning the team continues to pick an explicit list of tickets that
  it intends to complete and release that sprint. These are the **committed** tickets.
- Only committed tickets are released that sprint, unless the team determines that a
  new ticket has become high enough priority that it *must* ship that sprint. In that
  case the team makes a collective decision to roll it into the committed work.
- Once the committed work for the sprint is settled, create one new **Release
  Candidate (RC) ticket** in ADO for **each repository** that has committed tickets
  that sprint.
  - Link every committed ticket for that repo to its repo's RC ticket as a child.
  - Immediately set the RC ticket's state to **Active**.

## Ticket States and Lifecycle

### Committed (child) tickets

- When a committed child ticket is merged to `dev`, it is marked **Done** (not
  **Resolved**).
  - We no longer use **Resolved** for merged children. The RC ticket is now the
    thing that tracks what still needs to be *released*, so once code is on `dev`
    the child's own work is complete — it is **Done**.

### Release Candidate ticket

- **Active** — created at sprint planning; its committed children are in progress.
- **Ready for Acceptance** — the team has decided to begin the RC process (see
  Standup below). Testing begins and a merge freeze on `dev` is in effect.
- **Done** — the release has been cut.

## Standup and the RC Decision

Each day at standup the team reviews all RC tickets.

- If **all** of an RC ticket's children are **Done**, the team decides whether to
  begin the RC process for that ticket.
- If the team decides **yes**:
  1. Move the RC ticket to **Ready for Acceptance**.
  2. Testing begins.
  3. **A merge freeze goes into effect: no further merges may be applied to the
     `dev` branch until the release is cut.**
- Once the release is cut, mark the RC ticket **Done**.

## Approved Tickets

"Approved" tickets are work the team allows engineers to *pick up* once their
committed work is done, but which is **not** automatically part of the sprint's
release.

- Once committed tickets are done, engineers may pick up **Approved** tickets.
- Approved tickets **cannot be merged to `dev` without team approval** — ask during
  standup.
- If the team approves a merge, the ticket must be linked to the RC ticket as another
  child.
- An Approved ticket may move into **Ready for Acceptance** during the sprint; it
  simply may not be merged without approval.
- If no approval is given during the current sprint, then at the next sprint's
  planning the team decides whether to include the ticket in that sprint's RC. If so,
  link it to the new RC ticket for that sprint.

## Summary of the Cycle

1. **Sprint planning** — pick committed tickets; create an **Active** RC ticket per
   repo and link its committed children.
2. **During the sprint** — children merge to `dev` and become **Done**; engineers may
   pick up Approved tickets (merge only with team approval, then link as children).
3. **Standup** — when all of an RC ticket's children are **Done**, decide whether to
   start the RC process. If yes: RC → **Ready for Acceptance**, testing begins, `dev`
   is frozen.
4. **Cut the release** — RC ticket → **Done**; `dev` reopens for merges.
