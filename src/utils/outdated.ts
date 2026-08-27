import chalk from "chalk";
import { fetchLatestVersion } from "#utils/fetchManifest.js";

/** A component whose installed version is behind its latest published release. */
export interface OutdatedComponent {
  pkg: string;
  installed: string;
  latest: string;
}

const SEMVER =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u;

function parseSemver(
  version: string,
): { main: [number, number, number]; pre: string[] } | null {
  const match = SEMVER.exec(version.trim());
  if (!match) {
    return null;
  }
  return {
    main: [Number(match[1]), Number(match[2]), Number(match[3])],
    // Build metadata (after `+`) is ignored for precedence; only the prerelease
    // identifiers (after `-`) matter.
    pre: match[4] ? match[4].split(".") : [],
  };
}

/**
 * Compare two version strings by semver precedence. Returns a negative number
 * when `a` is older than `b`, a positive number when newer, and 0 when equal.
 * Numeric main segments compare numerically, and a version carrying a
 * prerelease tag (`13.0.0-beta.1`) ranks *below* the same version without one,
 * per the semver spec. Returns null when either side isn't valid semver, so a
 * caller can decline to guess rather than compare non-comparable strings.
 */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    return null;
  }

  for (let i = 0; i < 3; i += 1) {
    if (pa.main[i] !== pb.main[i]) {
      return pa.main[i] < pb.main[i] ? -1 : 1;
    }
  }

  // Equal main version: a release outranks any prerelease of the same version.
  if (pa.pre.length === 0 && pb.pre.length === 0) {
    return 0;
  }
  if (pa.pre.length === 0) {
    return 1;
  }
  if (pb.pre.length === 0) {
    return -1;
  }

  // Both prereleases: compare identifier by identifier (numeric < alphanumeric,
  // and a shorter set of identifiers has lower precedence when all else ties).
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i += 1) {
    const ai = pa.pre[i];
    const bi = pb.pre[i];
    if (ai === undefined) {
      return -1;
    }
    if (bi === undefined) {
      return 1;
    }
    const aNum = /^\d+$/u.test(ai);
    const bNum = /^\d+$/u.test(bi);
    if (aNum && bNum) {
      const diff = Number(ai) - Number(bi);
      if (diff !== 0) {
        return diff < 0 ? -1 : 1;
      }
    } else if (aNum !== bNum) {
      return aNum ? -1 : 1;
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return 0;
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
    if (!newest) {
      return;
    }
    // Report only when the installed version is *strictly older* than latest.
    // A version that is equal, ahead (a prerelease / `@next` / linked workspace
    // copy such as 13.0.0-beta vs a 12.3.0 latest), or non-comparable is treated
    // as current, so the banner never advises `install @latest` as a downgrade.
    const cmp = compareVersions(version, newest);
    if (cmp !== null && cmp < 0) {
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
  // Self-guard: with no components the width math (`Math.max(...[])`) would
  // yield -Infinity and garble the banner. Callers already skip the empty case,
  // but returning "" keeps this safe for any future caller.
  if (outdated.length === 0) {
    return "";
  }

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
    // `⚠` (U+26A0) renders as two terminal columns but `.length` counts it as
    // one, so add 1 or the border falls a column short of the heading.
    heading.length + 1,
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
