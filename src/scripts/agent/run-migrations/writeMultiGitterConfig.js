import fs from "node:fs/promises";
import path from "node:path";
import ora from "ora";

const JsonConfig = {
  "auth-type": "workspace-token",
  "author-email": null,
  "author-name": null,
  "base-branch": "main",
  "base-url": null,
  "clone-dir": ".gitter-temp",
  "code-search": null,
  concurrent: 4,
  "conflict-strategy": "replace",
  draft: false,
  "dry-run": true,
  "fetch-depth": 1,
  fork: false,
  "fork-owner": null,
  "git-type": "go",
  group: null,
  "include-subgroups": false,
  insecure: false,
  interactive: false,
  labels: null,
  "log-file": "'-'",
  "log-format": "'text'",
  "log-level": "'error'",
  "max-reviewers": 0,
  "max-team-reviewers": 0,
  org: null,
  output: "'-'",
  "plain-output": false,
  platform: "github",
  project: null,
  "push-only": false,
  repo: [
    "AlaskaAirlines/auro-accordion",
    "AlaskaAirlines/auro-alert",
    "AlaskaAirlines/auro-avatar",
    "AlaskaAirlines/auro-background",
    "AlaskaAirlines/auro-backtotop",
    "AlaskaAirlines/auro-button",
    "AlaskaAirlines/auro-badge",
    "AlaskaAirlines/auro-banner",
    "AlaskaAirlines/auro-card",
    "AlaskaAirlines/auro-carousel",
    "AlaskaAirlines/auro-datetime",
    "AlaskaAirlines/auro-dialog",
    "AlaskaAirlines/auro-drawer",
    "AlaskaAirlines/auro-flight",
    "AlaskaAirlines/auro-flightline",
    "AlaskaAirlines/auro-header",
    "AlaskaAirlines/auro-hyperlink",
    "AlaskaAirlines/auro-icon",
    "AlaskaAirlines/auro-loader",
    "AlaskaAirlines/auro-lockup",
    "AlaskaAirlines/auro-nav",
    "AlaskaAirlines/auro-pane",
    "AlaskaAirlines/auro-popover",
    "AlaskaAirlines/auro-sidenav",
    "AlaskaAirlines/auro-skeleton",
    "AlaskaAirlines/auro-slideshow",
    "AlaskaAirlines/auro-table",
    "AlaskaAirlines/auro-tabs",
    "AlaskaAirlines/auro-toast",
    // UNCOMMENT BELOW WHEN MAIN/MASTER BRANCHES ARE READY
    // "AlaskaAirlines/AuroDocsSite"
  ],
  "repo-exclude": null,
  "repo-include": null,
  "repo-search": null,
  reviewers: null,
  "skip-forks": false,
  "skip-pr": false,
  "skip-repo": null,
  "ssh-auth": false,
  "team-reviewers": null,
};

function toYaml(config) {
  return Object.entries(config)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n  - ${value.join("\n  - ")}`;
      }
      if (typeof value === "object" && value !== null) {
        return `${key}:\n${Object.entries(value)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n")}`;
      }
      return `${key}: ${value}`;
    })
    .join("\n");
}

export async function createMultiGitterDependencyTreeConfig(outputPath) {
  const spinner = ora("Writing multi-gitter configuration...").start();
  const configContent = toYaml(JsonConfig);
  const configPath = path.join(outputPath, "multi-gitter_DEPENDENCY_TREE.yml");

  try {
    await fs.writeFile(configPath, configContent, "utf8");
    spinner.succeed(`Multi-gitter configuration written to ${configPath}`);
  } catch (error) {
    spinner.fail("Error writing multi-gitter configuration:");
    console.error(error);
  }
}
