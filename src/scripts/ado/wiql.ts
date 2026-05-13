import * as azdev from "azure-devops-node-api";
import type { WorkItem } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";

const ADO_ORG_URL = "https://dev.azure.com/itsals";
const ADO_PROJECT_NAME = "E_Retain_Content";
const ADO_AREA_PATH = "E_Retain_Content\\Auro Design System";

export interface OpenBotTicket {
  id: number;
  title: string;
  state: string;
  url: string;
}

/**
 * Returns open upgrade tickets that match a given (repo, package) pair.
 * "Open" means not Removed/Closed/Done. Matching is anchored on the Auro
 * area path plus title substrings for both the repo and package, which is
 * narrow enough that an unrelated ticket would almost never collide.
 *
 * Manual tickets that happen to contain both substrings are also returned;
 * the caller filters them out via `parseLatestFromTitle` (manual titles
 * don't match the bot's `<pinned> -> <latest>` regex, so they're treated
 * as "skip" rather than overwritten).
 */
export async function findOpenBotTickets({
  repo,
  pkg,
}: {
  repo: string;
  pkg: string;
}): Promise<OpenBotTicket[]> {
  const adoToken = process.env.ADO_TOKEN;
  if (!adoToken) {
    throw new Error("ADO_TOKEN environment variable is required");
  }

  const authHandler = azdev.getPersonalAccessTokenHandler(adoToken);
  const connection = new azdev.WebApi(ADO_ORG_URL, authHandler);
  const api = await connection.getWorkItemTrackingApi();

  // WIQL string-literal escaping: single quotes get doubled. Project/area
  // path are constants we control so they don't need escaping.
  const escape = (s: string) => s.replace(/'/g, "''");
  const wiql = {
    query: `
      SELECT [System.Id] FROM WorkItems
      WHERE [System.TeamProject] = '${ADO_PROJECT_NAME}'
        AND [System.AreaPath] UNDER '${ADO_AREA_PATH}'
        AND [System.WorkItemType] = 'User Story'
        AND [System.State] <> 'Removed'
        AND [System.State] <> 'Closed'
        AND [System.State] <> 'Done'
        AND [System.Title] CONTAINS '${escape(pkg)}'
        AND [System.Title] CONTAINS '${escape(repo)}'
    `,
  };

  const result = await api.queryByWiql(wiql, { project: ADO_PROJECT_NAME });
  const ids =
    result.workItems
      ?.map((w) => w.id)
      .filter((id): id is number => typeof id === "number") ?? [];
  if (ids.length === 0) return [];

  const items: WorkItem[] = await api.getWorkItems(
    ids,
    ["System.Id", "System.Title", "System.State"],
    undefined,
    undefined,
    undefined,
    ADO_PROJECT_NAME,
  );
  return items.map((item) => ({
    id: item.id ?? 0,
    title: (item.fields?.["System.Title"] as string) ?? "",
    state: (item.fields?.["System.State"] as string) ?? "",
    url: item._links?.html?.href ?? "",
  }));
}

/**
 * Parses the `latest` version from a bot-generated title like
 *   `Upgrade <pkg> in <repo> (<pinned> -> <latest>, N major(s) behind)`
 * Returns null if the title doesn't match the expected format (e.g. a
 * hand-edited title).
 */
export function parseLatestFromTitle(title: string): string | null {
  const m = title.match(/\(\s*([\d.]+)\s*->\s*([\d.]+)\s*,/);
  return m ? m[2] : null;
}
