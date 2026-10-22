import * as azdev from "azure-devops-node-api";
import type { WorkItem } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";
import {
  WorkItemErrorPolicy,
  WorkItemExpand,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi.js";

// ADO organization and project details (shared with src/scripts/ado/index.ts)
const ADO_ORG_URL = "https://dev.azure.com/itsals";
const ADO_PROJECT = "E_Retain_Content";

// Tag that identifies a Release Candidate ticket in ADO.
const RELEASE_TICKET_TAG = "auro-rcs";

// Release tickets are User Stories. `Closed` is the only state in ADO's
// Completed category and `Removed` the only one in its Removed category, so a
// ticket in either has shipped or was abandoned. `Resolved` is In Progress and
// stays a candidate.
const CLOSED_STATES = new Set(["closed", "removed"]);

export interface ReleaseTicket {
  id: number;
  url: string;
  title: string;
}

type CommitLike = { message?: string; subject?: string; body?: string };

/**
 * Extract unique Azure Boards work item ids referenced in commit messages using
 * the `AB#<id>` mention syntax (e.g. "ci: bump node AB#1597898").
 */
export function extractWorkItemIds(commits: CommitLike[]): number[] {
  const ids = new Set<number>();
  const pattern = /AB#(\d+)/gi;

  for (const commit of commits) {
    const text =
      commit.message ?? `${commit.subject ?? ""}\n${commit.body ?? ""}`;
    for (const match of text.matchAll(pattern)) {
      const id = Number.parseInt(match[1], 10);
      if (!Number.isNaN(id)) {
        ids.add(id);
      }
    }
  }

  return [...ids];
}

/**
 * Build an authenticated Azure DevOps Work Item Tracking client.
 * @throws if ADO_TOKEN is not set.
 */
async function getWorkItemTrackingApi(): Promise<IWorkItemTrackingApi> {
  const adoToken = process.env.ADO_TOKEN;
  if (!adoToken) {
    throw new Error(
      "ADO_TOKEN environment variable is required to resolve the Release ticket.",
    );
  }

  const authHandler = azdev.getPersonalAccessTokenHandler(adoToken);
  const connection = new azdev.WebApi(ADO_ORG_URL, authHandler);
  return connection.getWorkItemTrackingApi();
}

/** Parse the trailing work item id from an ADO relation URL, or null. */
function parseRelatedWorkItemId(url: string | undefined): number | null {
  if (!url) {
    return null;
  }
  const match = url.match(/\/workItems\/(\d+)(?:\/)?$/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** True when a work item's `System.Tags` field contains the release tag. */
function hasReleaseTag(workItem: WorkItem): boolean {
  const tags = workItem.fields?.["System.Tags"];
  if (typeof tags !== "string") {
    return false;
  }
  return tags
    .split(";")
    .map((tag) => tag.trim().toLowerCase())
    .includes(RELEASE_TICKET_TAG);
}

/**
 * Checks whether a work item is still open, meaning its `System.State` isn't
 * `Closed` or `Removed`. A work item with no state counts as open.
 */
function isOpen(workItem: WorkItem): boolean {
  const state = workItem.fields?.["System.State"];
  return typeof state !== "string" || !CLOSED_STATES.has(state.toLowerCase());
}

/**
 * Keeps only the Release tickets that are still open and logs the ones it
 * drops. A commit can mention a work item from a release that already shipped,
 * or a carried-over ticket can stay linked to the previous sprint's Release
 * ticket, and either one links in that closed Release ticket too.
 */
export function filterOpenReleaseTickets(tickets: WorkItem[]): WorkItem[] {
  const open = tickets.filter(isOpen);
  const closed = tickets.filter((ticket) => !isOpen(ticket));
  if (closed.length > 0) {
    console.log(
      `Ignoring ${closed.length} closed Release ticket(s):` +
        `\n  ${closed.map(describeTicket).join("\n  ")}`,
    );
  }
  return open;
}

/** Lowercase and collapse separators so "auro-accordion" matches "Auro Accordion". */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Names a repo may go by in ADO: the full repo name ("auro-accordion") and, for
 * `auro-*` repos, the bare component name ("accordion").
 */
function repoNameVariants(repo: string): string[] {
  const full = normalizeName(repo);
  const short = full.replace(/^auro /, "");
  return [...new Set([full, short])].filter(Boolean);
}

/** True when the work item's Area Path has a segment naming the repo. */
function areaPathMatchesRepo(workItem: WorkItem, names: string[]): boolean {
  const areaPath = workItem.fields?.["System.AreaPath"];
  if (typeof areaPath !== "string") {
    return false;
  }
  return areaPath
    .split("\\")
    .map(normalizeName)
    .some((segment) => names.includes(segment));
}

/** True when the work item's title mentions the repo as a whole word/phrase. */
function titleMatchesRepo(workItem: WorkItem, names: string[]): boolean {
  const title = workItem.fields?.["System.Title"];
  if (typeof title !== "string") {
    return false;
  }
  const padded = ` ${normalizeName(title)} `;
  return names.some((name) => padded.includes(` ${name} `));
}

function describeTicket(workItem: WorkItem): string {
  const title = workItem.fields?.["System.Title"] ?? "(no title)";
  const areaPath = workItem.fields?.["System.AreaPath"] ?? "(no area path)";
  const state = workItem.fields?.["System.State"] ?? "(no state)";
  return `#${workItem.id} "${title}" [${areaPath}] (${state})`;
}

/**
 * When several Release tickets are linked to the committed work items, pick the
 * one belonging to `repo` — first by Area Path, then by title.
 *
 * @throws if no ticket, or more than one, can be attributed to the repo.
 */
export function selectReleaseTicketForRepo(
  tickets: WorkItem[],
  repo: string,
): WorkItem {
  const names = repoNameVariants(repo);
  const candidates = `\n  ${tickets.map(describeTicket).join("\n  ")}`;

  for (const [label, matches] of [
    ["Area Path", areaPathMatchesRepo],
    ["title", titleMatchesRepo],
  ] as const) {
    const matched = tickets.filter((ticket) => matches(ticket, names));
    if (matched.length === 1) {
      console.log(
        `Found ${tickets.length} Release tickets; selected #${matched[0].id} for "${repo}" by ${label}.`,
      );
      return matched[0];
    }
    if (matched.length > 1) {
      throw new Error(
        `Found ${matched.length} Release tickets whose ${label} matches "${repo}":` +
          `\n  ${matched.map(describeTicket).join("\n  ")}` +
          "\nOnly one Release Candidate ticket per repo is supported.",
      );
    }
  }

  throw new Error(
    `Found ${tickets.length} Release tickets but none could be matched to "${repo}" by Area Path or title:${candidates}`,
  );
}

/**
 * Resolves the open ADO Release ticket (tagged `auro-rcs`) that the RC PR
 * references, from the ids of the committed work items. It ignores closed
 * Release tickets and, when several open ones are linked, picks the one for
 * `repo` by Area Path or title. It returns `null` when the commits link to no
 * open Release ticket, and the caller then skips the Release PR.
 *
 * @throws If `workItemIds` isn't empty and the `ADO_TOKEN` environment variable
 *   isn't set.
 * @throws If several open Release tickets are linked and neither Area Path nor
 *   title narrows them to one for `repo`.
 */
export async function findReleaseTicket(
  workItemIds: number[],
  repo: string,
): Promise<ReleaseTicket | null> {
  if (workItemIds.length === 0) {
    console.log(
      "No ADO work item references (AB#<id>) found in the RC commits.",
    );
    return null;
  }

  const witApi = await getWorkItemTrackingApi();

  // 1. Fetch the committed work items with their relations. `Omit` skips any id
  //    that is deleted or inaccessible rather than failing the whole batch.
  const committedItems = await witApi.getWorkItems(
    workItemIds,
    undefined,
    undefined,
    WorkItemExpand.Relations,
    WorkItemErrorPolicy.Omit,
    ADO_PROJECT,
  );

  // 2. Collect the ids of every related work item, regardless of link direction.
  const relatedIds = new Set<number>();
  for (const item of committedItems ?? []) {
    for (const relation of item.relations ?? []) {
      const relatedId = parseRelatedWorkItemId(relation.url);
      if (relatedId !== null) {
        relatedIds.add(relatedId);
      }
    }
  }

  if (relatedIds.size === 0) {
    console.log(
      `None of the committed work items (${workItemIds.join(", ")}) link to another work item in ADO.`,
    );
    return null;
  }

  // 3. Fetch the related items with their tags and keep the open ones tagged
  //    auro-rcs.
  const relatedItems = await witApi.getWorkItems(
    [...relatedIds],
    ["System.Title", "System.Tags", "System.AreaPath", "System.State"],
    undefined,
    undefined,
    WorkItemErrorPolicy.Omit,
    ADO_PROJECT,
  );

  const releaseTickets = filterOpenReleaseTickets(
    (relatedItems ?? []).filter(hasReleaseTag),
  );

  if (releaseTickets.length === 0) {
    console.log(
      `No open Release ticket (tagged "${RELEASE_TICKET_TAG}") is linked to the committed work items (${workItemIds.join(", ")}).`,
    );
    return null;
  }

  const releaseTicket =
    releaseTickets.length === 1
      ? releaseTickets[0]
      : selectReleaseTicketForRepo(releaseTickets, repo);
  if (releaseTicket.id === undefined) {
    throw new Error("Failed to resolve the Release ticket details from ADO.");
  }

  const title =
    typeof releaseTicket.fields?.["System.Title"] === "string"
      ? (releaseTicket.fields["System.Title"] as string)
      : `Work item ${releaseTicket.id}`;

  const url =
    releaseTicket._links?.html?.href ??
    `${ADO_ORG_URL}/${ADO_PROJECT}/_workitems/edit/${releaseTicket.id}`;

  return { id: releaseTicket.id, url, title };
}
