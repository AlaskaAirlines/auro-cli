import chalk from "chalk";
import { fetchLatestVersion } from "#utils/fetchManifest.js";

/** A component whose installed version is behind its latest published release. */
export interface OutdatedComponent {
  pkg: string;
  installed: string;
  latest: string;
}

/**
 * Compare each installed package against its latest published release and return
 * the ones that are behind. Best-effort and network-dependent — a package whose
 * latest version cannot be resolved is treated as current (never reported).
 */
export async function checkOutdated(
  installed: Map<string, string>,
): Promise<OutdatedComponent[]> {
  const entries = [...installed.entries()];
  const latest = await Promise.all(
    entries.map(([pkg]) => fetchLatestVersion(pkg)),
  );

  const outdated: OutdatedComponent[] = [];
  entries.forEach(([pkg, version], index) => {
    const newest = latest[index];
    if (newest && newest !== version) {
      outdated.push({ pkg, installed: version, latest: newest });
    }
  });
  return outdated;
}

/**
 * Render the "components behind latest" notice as a bold, bordered banner with
 * an aligned version table and a ready-to-run update command. Colors degrade
 * automatically (chalk disables them when the stream is not a TTY, e.g.
 * redirected to a file), while the border and heading keep it prominent
 * regardless. Meant for stderr so it never pollutes command output on stdout.
 */
export function renderOutdatedBanner(outdated: OutdatedComponent[]): string {
  const heading = `⚠  ${outdated.length} Auro component(s) are NOT on the latest release`;
  const pkgWidth = Math.max(...outdated.map((o) => o.pkg.length));
  const installedWidth = Math.max(...outdated.map((o) => o.installed.length));

  const rows = outdated.map(
    (o) =>
      `  ${chalk.bold(o.pkg.padEnd(pkgWidth))}  ${chalk.dim(
        o.installed.padStart(installedWidth),
      )} ${chalk.dim("→")} ${chalk.green.bold(o.latest)}`,
  );

  const updateCmd = `npm install ${outdated
    .map((o) => `${o.pkg}@latest`)
    .join(" ")}`;

  // Border width tracks the widest visible line (ignoring color codes), capped
  // so a long update command doesn't blow out the terminal.
  const visibleWidths = [
    heading.length,
    ...outdated.map(
      (o) => 2 + pkgWidth + 2 + installedWidth + 3 + o.latest.length,
    ),
  ];
  const width = Math.min(Math.max(...visibleWidths), 78);
  const border = "─".repeat(width);

  return [
    "",
    chalk.yellow.bold(`┌${border}┐`),
    chalk.yellow.bold(heading),
    chalk.yellow.bold(`└${border}┘`),
    ...rows,
    "",
    chalk.dim("  Update all with:"),
    `  ${chalk.cyan(updateCmd)}`,
    "",
  ].join("\n");
}
