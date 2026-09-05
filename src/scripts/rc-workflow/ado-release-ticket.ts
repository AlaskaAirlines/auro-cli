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
 * Given the ids of committed work items, resolve the single ADO Release ticket
 * (the related work item tagged `auro-rcs`) that the RC PR should reference.
 *
 * Returns null when the new commits do not roll up to a Release ticket (no
 * `AB#<id>` references, no linked work items, or none tagged `auro-rcs`) — the
 * caller should skip creating the Release PR in that case.
 *
 * @throws if more than one distinct Release ticket is found (a misconfiguration —
 *   only one Release Candidate ticket per repo is supported).
 */
export async function findReleaseTicket(
  workItemIds: number[],
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

  // 3. Fetch the related items with their tags and keep the ones tagged auro-rcs.
  const relatedItems = await witApi.getWorkItems(
    [...relatedIds],
    ["System.Title", "System.Tags"],
    undefined,
    undefined,
    WorkItemErrorPolicy.Omit,
    ADO_PROJECT,
  );

  const releaseTickets = (relatedItems ?? []).filter(hasReleaseTag);

  const distinctIds = [
    ...new Set(releaseTickets.map((item) => item.id)),
  ].filter((id): id is number => typeof id === "number");

  if (distinctIds.length === 0) {
    console.log(
      `No Release ticket (tagged "${RELEASE_TICKET_TAG}") is linked to the committed work items (${workItemIds.join(", ")}).`,
    );
    return null;
  }

  if (distinctIds.length > 1) {
    throw new Error(
      `Expected exactly one Release ticket but found ${distinctIds.length}: ${distinctIds.join(", ")}. ` +
        "Only one Release Candidate ticket per repo is supported.",
    );
  }

  const releaseTicket = releaseTickets.find(
    (item) => item.id === distinctIds[0],
  );
  if (!releaseTicket || releaseTicket.id === undefined) {
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
