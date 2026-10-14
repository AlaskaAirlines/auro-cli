// Saves the Figma data the build scripts read, one file per component set: <snapshotDir>/<node-id>.json. This is the only script that uses the network.
//
// The URLs come from ctx.figmaNodes: the Figma connector config (figma-connector.config.ts).
// Needs a Figma personal access token in FIGMA_ACCESS_TOKEN. The saved file keeps only what the build scripts use (file name, version,
// last-modified time, and each node's name, type and componentPropertyDefinitions), so it is small and has no expiring links.
// The other build scripts never fetch: re-run this one, then the others, when the Figma file changes.
// Exit codes: 0 ok, 2 bad input, a missing token, or a failed request.
import fs from "node:fs";
import path from "node:path";
import { guard, loadComponent } from "./binding-core.mjs";

export function run(argv, ctx) {
  return guard("fetch-figma", async () => {
    const { tag, fail, nodeRefs } = loadComponent(
      "fetch-figma",
      argv,
      ctx,
      [],
      { sourceOnly: true, translateOptional: true },
    );
    const token = process.env.FIGMA_ACCESS_TOKEN;
    if (!token)
      fail("FIGMA_ACCESS_TOKEN is not set (a Figma personal access token)");

    const shown = (p) => {
      const rel = path.relative(ctx.cwd ?? process.cwd(), p);
      return rel.startsWith("..") ? p : rel;
    };
    for (const r of nodeRefs) {
      const res = await fetch(
        `https://api.figma.com/v1/files/${encodeURIComponent(r.fileKey)}/nodes?ids=${encodeURIComponent(r.nodeId)}`,
        { headers: { "X-Figma-Token": token } },
      );
      if (!res.ok)
        fail(
          `Figma API answered ${res.status} ${res.statusText} for node ${r.nodeId} of file ${r.fileKey}${res.status === 403 ? " (check the token and that it can read this file)" : ""}`,
        );
      const json = await res.json();
      const doc = json.nodes?.[r.nodeId]?.document;
      if (!doc) fail(`node ${r.nodeId} not found in file ${r.fileKey}`);
      if (!doc.componentPropertyDefinitions)
        fail(
          `node ${r.nodeId} ("${doc.name}", ${doc.type}) has no componentPropertyDefinitions; expected a component set`,
        );
      const text = `${JSON.stringify(
        {
          name: json.name,
          lastModified: json.lastModified,
          version: json.version,
          nodes: {
            [r.nodeId]: {
              document: {
                id: doc.id,
                name: doc.name,
                type: doc.type,
                componentPropertyDefinitions: doc.componentPropertyDefinitions,
              },
            },
          },
        },
        null,
        2,
      )}\n`;
      const same =
        fs.existsSync(r.snapshotPath) &&
        fs.readFileSync(r.snapshotPath, "utf8") === text;
      if (!same) {
        fs.mkdirSync(path.dirname(r.snapshotPath), { recursive: true });
        fs.writeFileSync(r.snapshotPath, text);
      }
      console.log(
        `${tag}: ${shown(r.snapshotPath)} ${same ? "unchanged" : "saved"} (${json.name} / ${doc.name}, file version ${json.version})`,
      );
    }
  });
}
