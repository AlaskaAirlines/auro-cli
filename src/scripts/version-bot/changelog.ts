import { Octokit } from "@octokit/rest";
import { parseSemver } from "./npm-registry.ts";
import type { SemverParts } from "./types.ts";

const REPO_OWNER = "AlaskaAirlines";
const sliceCache = new Map<string, ChangelogSlice | null>();

export type ChangelogSectionType =
  | "features"
  | "bugFixes"
  | "breakingChanges"
  | "other";

export interface ChangelogSection {
  type: ChangelogSectionType;
  /** Original heading text from the CHANGELOG (e.g. "Bug Fixes"). */
  title: string;
  /** Plain-text bullets with semantic-release PR/commit suffixes stripped. */
  bullets: string[];
}

export interface ChangelogVersionSlice {
  version: string;
  dateStr: string | null;
  sections: ChangelogSection[];
}

export interface ChangelogSlice {
  versions: ChangelogVersionSlice[];
  /** HTML rendering of the same slice, for direct inclusion in the ticket body. */
  html: string;
}

interface ParsedSection {
  version: string;
  dateStr: string | null;
  body: string;
}

/**
 * Fetches CHANGELOG.md from AlaskaAirlines/<short-pkg-name>, slices the
 * sections that fall in (pinned, latest], and returns both a structured
 * representation (per-version sub-sections by type: features / bug fixes /
 * breaking changes / other) and a rendered HTML string suitable for direct
 * inclusion in a work item description.
 *
 * Returns null on any failure — missing GH_TOKEN, 404, unparseable structure,
 * empty slice, etc. Callers should fall back to a plain CHANGELOG link.
 *
 * Results are cached in-process by (pkg, pinned, latest) so the same package
 * isn't refetched (or re-parsed) for every consumer repo in one run.
 */
export async function fetchChangelogStructured(
  pkg: string,
  pinned: string,
  latest: string,
): Promise<ChangelogSlice | null> {
  const cacheKey = `${pkg}|${pinned}|${latest}`;
  if (sliceCache.has(cacheKey)) {
    return sliceCache.get(cacheKey) ?? null;
  }
  const result = await fetchAndSlice(pkg, pinned, latest);
  sliceCache.set(cacheKey, result);
  return result;
}

/**
 * Back-compat wrapper for callers that only need the rendered HTML.
 * Prefer `fetchChangelogStructured` for new code.
 */
export async function fetchChangelogSlice(
  pkg: string,
  pinned: string,
  latest: string,
): Promise<string | null> {
  const slice = await fetchChangelogStructured(pkg, pinned, latest);
  return slice ? slice.html : null;
}

async function fetchAndSlice(
  pkg: string,
  pinned: string,
  latest: string,
): Promise<ChangelogSlice | null> {
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    return null;
  }

  const shortName = pkg.replace(/^@[^/]+\//, "");
  const octokit = new Octokit({ auth: ghToken });

  let raw: string;
  try {
    const response = await octokit.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: shortName,
      path: "CHANGELOG.md",
    });
    if (Array.isArray(response.data) || response.data.type !== "file") {
      return null;
    }
    if (!("content" in response.data) || !response.data.content) {
      return null;
    }
    raw = Buffer.from(response.data.content, "base64").toString("utf8");
  } catch {
    return null;
  }

  const sections = parseSections(raw);
  if (sections.length === 0) {
    return null;
  }

  const sliced = sliceSections(sections, pinned, latest);
  if (sliced.length === 0) {
    return null;
  }

  const versions = sliced.map(toStructuredVersion);
  const html = versions.map(renderVersion).join("\n");
  return { versions, html };
}

function parseSections(raw: string): ParsedSection[] {
  // Semantic-release uses `## [x.y.z]` for patch releases and `# [x.y.z]` for
  // minor/major. Both are real version sections and must be captured.
  const headingRegex = /^#{1,2}\s+\[([^\]]+)\][^\n]*$/gm;
  const matches = [...raw.matchAll(headingRegex)];
  const sections: ParsedSection[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const version = m[1];
    const headingLine = m[0];
    const start = (m.index ?? 0) + headingLine.length;
    const end =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? raw.length)
        : raw.length;
    const body = raw.slice(start, end).trim();

    const dateMatch = headingLine.match(/\((\d{4}-\d{2}-\d{2})\)/);
    const dateStr = dateMatch ? dateMatch[1] : null;

    sections.push({ version, dateStr, body });
  }

  return sections;
}

function sliceSections(
  sections: ParsedSection[],
  pinned: string,
  latest: string,
): ParsedSection[] {
  const pinnedSemver = parseSemver(pinned);
  const latestSemver = parseSemver(latest);
  if (!pinnedSemver || !latestSemver) {
    return [];
  }
  return sections.filter((s) => {
    const semver = parseSemver(s.version);
    if (!semver) {
      return false;
    }
    return (
      compareSemver(semver, pinnedSemver) > 0 &&
      compareSemver(semver, latestSemver) <= 0
    );
  });
}

function compareSemver(a: SemverParts, b: SemverParts): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function classifySection(title: string): ChangelogSectionType {
  const normalized = title.trim().toLowerCase();
  if (normalized.includes("breaking")) return "breakingChanges";
  if (normalized.startsWith("feature")) return "features";
  if (normalized.includes("bug fix") || normalized.startsWith("fix")) {
    return "bugFixes";
  }
  return "other";
}

function toStructuredVersion(section: ParsedSection): ChangelogVersionSlice {
  const sections: ChangelogSection[] = [];
  let current: ChangelogSection | null = null;

  const flush = () => {
    if (current) {
      sections.push(current);
      current = null;
    }
  };

  for (const line of section.body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const subHeadingMatch = trimmed.match(/^###\s+(.+)$/);
    if (subHeadingMatch) {
      flush();
      const title = subHeadingMatch[1].trim();
      current = { type: classifySection(title), title, bullets: [] };
      continue;
    }

    const bulletMatch = trimmed.match(/^[*-]\s+(.+)$/);
    if (bulletMatch && current) {
      current.bullets.push(stripBulletSuffix(bulletMatch[1]));
    }
  }

  flush();
  return { version: section.version, dateStr: section.dateStr, sections };
}

/**
 * Strips trailing semantic-release commit/PR references like
 * `text ([#123](url))` or `text ([abc1234](url))`.
 */
function stripBulletSuffix(text: string): string {
  return text.replace(/\s*\(\[[^\]]+\]\([^)]+\)\)/g, "").trim();
}

function renderVersion(version: ChangelogVersionSlice): string {
  const heading = version.dateStr
    ? `<h4>[${escapeHtml(version.version)}] — ${escapeHtml(version.dateStr)}</h4>`
    : `<h4>[${escapeHtml(version.version)}]</h4>`;
  const parts: string[] = [heading];
  for (const sec of version.sections) {
    parts.push(`<h5>${escapeHtml(sec.title)}</h5>`);
    if (sec.bullets.length > 0) {
      const bullets = sec.bullets
        .map((b) => `<li>${renderInline(b)}</li>`)
        .join("");
      parts.push(`<ul>${bullets}</ul>`);
    }
  }
  return parts.join("\n");
}

function renderInline(text: string): string {
  // Already had its semantic-release suffix stripped during parse; just
  // handle inline markdown for `code` and [label](url) links.
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label, url) => `<a href="${url}">${label}</a>`,
  );
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convenience: flattens all breaking-change bullets across the slice,
 * tagged with the version they came from. Used by the template to render
 * a top-level "Breaking changes" section and by AC to emit one bullet
 * per breaking change.
 */
export interface BreakingChange {
  version: string;
  text: string;
}

export function extractBreakingChanges(slice: ChangelogSlice): BreakingChange[] {
  const out: BreakingChange[] = [];
  for (const v of slice.versions) {
    for (const sec of v.sections) {
      if (sec.type !== "breakingChanges") continue;
      for (const bullet of sec.bullets) {
        out.push({ version: v.version, text: bullet });
      }
    }
  }
  return out;
}
