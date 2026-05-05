import { Octokit } from "@octokit/rest";
import { parseSemver } from "./npm-registry.ts";
import type { SemverParts } from "./types.ts";

const REPO_OWNER = "AlaskaAirlines";
const sliceCache = new Map<string, string | null>();

interface ParsedSection {
  version: string;
  dateStr: string | null;
  body: string;
}

/**
 * Fetches CHANGELOG.md from AlaskaAirlines/<short-pkg-name>, slices the
 * sections that fall in (pinned, latest], and renders them as HTML for
 * inclusion in an ADO work item description.
 *
 * Returns null on any failure — missing GH_TOKEN, 404, unparseable structure,
 * empty slice, etc. Callers should fall back to a plain CHANGELOG link.
 *
 * Results are cached in-process by (pkg, pinned, latest) so the same package
 * isn't refetched for every consumer repo in one run.
 */
export async function fetchChangelogSlice(
  pkg: string,
  pinned: string,
  latest: string,
): Promise<string | null> {
  const cacheKey = `${pkg}|${pinned}|${latest}`;
  if (sliceCache.has(cacheKey)) {
    return sliceCache.get(cacheKey) ?? null;
  }
  const result = await fetchAndSlice(pkg, pinned, latest);
  sliceCache.set(cacheKey, result);
  return result;
}

async function fetchAndSlice(
  pkg: string,
  pinned: string,
  latest: string,
): Promise<string | null> {
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

  return sliced.map(renderSection).join("\n");
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

function renderSection(section: ParsedSection): string {
  const heading = section.dateStr
    ? `<h4>[${escapeHtml(section.version)}] — ${escapeHtml(section.dateStr)}</h4>`
    : `<h4>[${escapeHtml(section.version)}]</h4>`;
  const parts: string[] = [heading];

  let bullets: string[] = [];
  const flushList = () => {
    if (bullets.length > 0) {
      parts.push(`<ul>${bullets.join("")}</ul>`);
      bullets = [];
    }
  };

  for (const line of section.body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    const subHeadingMatch = trimmed.match(/^###\s+(.+)$/);
    if (subHeadingMatch) {
      flushList();
      parts.push(`<h5>${escapeHtml(subHeadingMatch[1])}</h5>`);
      continue;
    }

    const bulletMatch = trimmed.match(/^[*-]\s+(.+)$/);
    if (bulletMatch) {
      bullets.push(`<li>${renderInline(bulletMatch[1])}</li>`);
    }
  }

  flushList();
  return parts.join("\n");
}

function renderInline(text: string): string {
  // Strip semantic-release commit/PR link suffixes at the end of bullets:
  // `text ([#123](url))`, `text ([abc1234](url))`.
  const stripped = text.replace(/\s*\(\[[^\]]+\]\([^)]+\)\)/g, "").trim();
  // Escape first so URL chars (`&`, `"`, etc.) are safe in href attributes.
  let html = escapeHtml(stripped);
  // `code` -> <code>code</code>
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // [label](url) -> <a href="url">label</a>
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
