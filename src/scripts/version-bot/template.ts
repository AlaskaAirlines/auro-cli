import type { BreakingChange, ChangelogSlice } from "./changelog.ts";
import type { UpgradeCandidate } from "./types.ts";
import type { UsageInventory } from "./usage-inventory.ts";

export interface StoryBodyInput {
  candidate: UpgradeCandidate;
  changelogSlice: ChangelogSlice | null;
  changelogUrl: string;
  breakingChanges: BreakingChange[];
  /** GitHub Code Search result for the consumer repo — list of files that
   *  reference the package(s). Renders into a "Where this package is used"
   *  section. Null means the search was skipped or failed; section is
   *  omitted. */
  usage?: UsageInventory | null;
  /** When this ticket replaces an earlier bot ticket via close-and-recreate. */
  supersedes?: number;
}

/**
 * Generic verification bullets that apply to every upgrade. Per-upgrade
 * specifics (e.g. "verify breaking change X is handled") are appended
 * downstream by `buildAcceptanceCriteria`.
 */
function genericAcceptanceBullets(c: UpgradeCandidate): string[] {
  const pkg = escapeHtml(c.package);
  const latest = escapeHtml(c.latest);
  const target = c.targetPackage ? escapeHtml(c.targetPackage) : null;
  const manifestPhrase = describeManifestsInline(c.manifestPaths);
  const lockfileWord = `lockfile${c.manifestPaths && c.manifestPaths.length > 1 ? "s" : ""}`;
  // A migration is a real rewrite when the package short-name changes too
  // (e.g. auro-checkbox → auro-formkit). When only the scope changes
  // (@alaskaairux/auro-button → @aurodesignsystem/auro-button), the
  // component is the same and a rename + lockfile update is enough.
  const isRealMigration =
    c.status === "Unsupported" &&
    target &&
    !isScopeRename(c.package, c.targetPackage);
  let firstBullet: string;
  if (isRealMigration && target) {
    firstBullet = `Migrate from <code>${pkg}</code> to <code>${target}@${latest}</code> in ${manifestPhrase} (and the matching ${lockfileWord}). <b>This is a code migration, not a drop-in replacement</b> — the successor exposes different exports and APIs. Review its documentation, update imports and usage, and retest every surface that used <code>${pkg}</code>.`;
  } else if (target) {
    firstBullet = `Replace <code>${pkg}</code> with <code>${target}@${latest}</code> in ${manifestPhrase} (and the matching ${lockfileWord}). Update all import paths from <code>${pkg}</code> to <code>${target}</code>.`;
  } else {
    firstBullet = `Update <code>${pkg}</code> to <code>${latest}</code> in ${manifestPhrase} (and the matching ${lockfileWord}).`;
  }
  const smokeRef = target ?? pkg;
  return [
    firstBullet,
    "<code>npm ci</code> succeeds with no peer-dep warnings or lockfile drift caused by the upgrade.",
    "Build / TypeScript compile passes with no new errors introduced by the upgrade.",
    "Lint passes (no new violations).",
    "Existing test suite passes.",
    `Manual smoke check: every UI surface using <code>${smokeRef}</code> renders without new console errors and matches the prior visual baseline.`,
  ];
}

function isScopeRename(
  fromPackage: string,
  toPackage: string | undefined,
): boolean {
  if (!toPackage) return false;
  const shortName = (p: string) => p.replace(/^@[^/]+\//, "");
  return shortName(fromPackage) === shortName(toPackage);
}

/**
 * Returns a short HTML phrase describing where a dependency lives in the
 * repo, for inline use inside the first AC bullet. Defaults to "the
 * consumer's <code>package.json</code>" when manifest paths are unknown or
 * trivial (single root). When the dep lives in a subdirectory manifest, or
 * spans multiple manifests, names them explicitly so the engineer's update
 * checklist is unambiguous.
 */
function describeManifestsInline(paths: string[] | undefined): string {
  if (!paths || paths.length === 0) {
    return "the consumer's <code>package.json</code>";
  }
  if (paths.length === 1 && paths[0] === "package.json") {
    return "the consumer's <code>package.json</code>";
  }
  if (paths.length === 1) {
    return `<code>${escapeHtml(paths[0])}</code>`;
  }
  const items = paths.map((p) => `<code>${escapeHtml(p)}</code>`).join(", ");
  return `each of the ${paths.length} manifests where it appears (${items})`;
}

/**
 * Acceptance criteria = the generic verification bullets + at most ONE
 * summary bullet that points back to the body's "Breaking changes in this
 * upgrade" section. Long-jump upgrades can carry double-digit breaking
 * changes across many majors; per-item AC bullets become repetitive
 * noise that pushes the meaningful build/lint/test/smoke checkpoints
 * out of view. The body already enumerates each breaking change with
 * version + description; the AC's job is the verification checkpoint,
 * not a second copy of the list.
 */
export function buildAcceptanceCriteria(
  c: UpgradeCandidate,
  breakingChanges: BreakingChange[] = [],
): string {
  const bullets = genericAcceptanceBullets(c).map((b) => `  <li>${b}</li>`);
  if (breakingChanges.length > 0) {
    const count = breakingChanges.length;
    const plural = count === 1 ? "" : "s";
    bullets.push(
      `  <li>Verify each of the ${count} breaking change${plural} listed in the "Breaking changes in this upgrade" section is handled in your codebase.</li>`,
    );
  }
  return ["<ul>", ...bullets, "</ul>"].join("\n");
}

export function buildStoryTitle(c: UpgradeCandidate): string {
  // Deprecation/replacement tickets get a distinct title: the action is a
  // migration to a different package, not a version bump. "(deprecated)" sits
  // flush against the old package@version so it can only modify that one —
  // putting the qualifier at the end of the title (or near the successor)
  // would read as if the new package were unsupported.
  if (c.status === "Unsupported" && c.targetPackage) {
    return `Replace ${c.package}@${c.pinned} (deprecated) with ${c.targetPackage}@${c.latest} in ${c.repo}`;
  }
  const plural = c.majorsBehind > 1 ? "s" : "";
  return `Upgrade ${c.package} in ${c.repo} (${c.pinned} -> ${c.latest}, ${c.majorsBehind} major${plural} behind)`;
}

export function buildStoryBody({
  candidate,
  changelogSlice,
  changelogUrl,
  breakingChanges,
  usage,
  supersedes,
}: StoryBodyInput): string {
  const {
    repo,
    package: pkg,
    pinned,
    latest,
    majorsBehind,
    repoUrl,
  } = candidate;
  const plural = majorsBehind > 1 ? "s" : "";

  const targetPackage = candidate.targetPackage;
  const isRealMigration =
    candidate.status === "Unsupported" &&
    !!targetPackage &&
    !isScopeRename(pkg, targetPackage);
  const headlineSentence = isRealMigration
    ? `<p>The repo <a href="${repoUrl}"><b>${escapeHtml(repo)}</b></a> is using <code>${escapeHtml(pkg)}@${escapeHtml(pinned)}</code>, which has been <b>deprecated and replaced</b> by <code>${escapeHtml(targetPackage as string)}@${escapeHtml(latest)}</code>. Migrating off the deprecated package keeps the repo on a supported track for a11y, security patches, and design-system parity.</p>`
    : `<p>The repo <a href="${repoUrl}"><b>${escapeHtml(repo)}</b></a> is using <code>${escapeHtml(pkg)}@${escapeHtml(pinned)}</code> but the latest published version is <code>${escapeHtml(latest)}</code> — that's <b>${majorsBehind} major version${plural} behind</b>. Staying current keeps a11y, security patches, and design-system parity in step with the rest of the Auro fleet.</p>`;
  const transitionCallout = !targetPackage
    ? ""
    : isRealMigration
      ? `<p><b>⚠ Package deprecated — code migration required:</b> <code>${escapeHtml(pkg)}</code> is no longer maintained. The successor <code>${escapeHtml(targetPackage)}</code> is a different package with a different API surface, not a renamed version of the same component. Migration involves removing <code>${escapeHtml(pkg)}</code>, adding <code>${escapeHtml(targetPackage)}</code>, and rewriting source code that referenced the old package. Plan for review time proportional to a real refactor, not a version bump.</p>`
      : `<p><b>⚠ Namespace rename:</b> active development of this library moved to <code>${escapeHtml(targetPackage)}</code>. Upgrading requires renaming the dependency in <code>package.json</code> from <code>${escapeHtml(pkg)}</code> to <code>${escapeHtml(targetPackage)}</code> AND updating any matching import paths in source files. The version number bridges both scopes — <code>${escapeHtml(latest)}</code> is the latest on the new scope.</p>`;
  const contextSection = [
    "<h3>Context</h3>",
    headlineSentence,
    transitionCallout,
    buildManifestPathsCallout(candidate.manifestPaths, pinned),
    supersedes !== undefined
      ? `<p><i>This ticket supersedes work item #${supersedes}, which was closed because a newer version of <code>${escapeHtml(pkg)}</code> has shipped since that ticket was created.</i></p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const incidentCallout = buildIncidentCallout(candidate.notes);

  const usageSection = buildUsageSection(usage ?? null, pkg, targetPackage);

  const breakingSection = buildBreakingChangesSection(
    candidate,
    changelogSlice,
    breakingChanges,
  );

  const whatsNewSection = buildWhatsNewSection(
    changelogSlice,
    changelogUrl,
    pkg,
    pinned,
    latest,
  );

  return [
    contextSection,
    "",
    incidentCallout,
    "",
    usageSection,
    "",
    breakingSection,
    "",
    whatsNewSection,
    "",
    "<p><i>This ticket was auto-generated by the Auro Version Support bot.</i></p>",
  ]
    .filter((s) => s !== "")
    .join("\n");
}

/**
 * Renders an inline callout naming the package.json files where this
 * dependency lives. Skipped entirely for the trivial single-root case
 * (one `package.json` at the repo root, which is the assumption a reader
 * already makes). For non-root single manifests OR multi-manifest cases,
 * surfaces the paths explicitly so the engineer knows exactly which files
 * to update — the original scan bug was missing exactly this signal.
 *
 * The `pinned` parameter is mostly future-proofing — once we surface
 * per-manifest pins (lockfile parsing, Step 3 in the recommendation),
 * this callout will list each manifest's actual pin rather than the
 * worst-case-behind value that drives the title. For now it's recorded
 * here to flag that the displayed `pinned` is the lowest across manifests.
 */
function buildManifestPathsCallout(
  paths: string[] | undefined,
  _pinned: string,
): string {
  if (!paths || paths.length === 0) return "";
  if (paths.length === 1 && paths[0] === "package.json") return "";

  if (paths.length === 1) {
    return `<p><b>📍 Manifest location:</b> this dependency is declared in <code>${escapeHtml(paths[0])}</code>, not the repo's root <code>package.json</code>. Make sure your upgrade edits the right file.</p>`;
  }

  const items = paths.map((p) => `<code>${escapeHtml(p)}</code>`).join(", ");
  return `<p><b>⚠ Multiple manifests:</b> this dependency is declared in <b>${paths.length}</b> <code>package.json</code> files — all must be updated to upgrade the repo consistently: ${items}.</p>`;
}

/**
 * Renders a warning callout carrying the catalog's incident `notes` text.
 * The notes field is the catalog's incident knob: when a release has a
 * known regression, an engineer pins `targetVersion` to the last-known-good
 * version and adds `notes` describing the situation. Every ticket the bot
 * files for that package then surfaces this callout so consumers don't go
 * spelunking through Slack for the context.
 *
 * Empty string when notes is absent — Stories without an incident render
 * unchanged. Plain text in; HTML-escaped on the way out so a stray `<` in
 * the catalog can't break ADO's renderer.
 */
function buildIncidentCallout(notes: string | undefined): string {
  if (!notes) return "";
  return `<p><b>⚠ Incident notice:</b> ${escapeHtml(notes)}</p>`;
}

/**
 * Renders the "What's new" section: a deterministic summary of how many
 * Features and Bug Fixes shipped in (pinned, latest], followed by a link
 * to the full CHANGELOG. Replaces the previous "Migration guide" section
 * which inlined the entire structured CHANGELOG slice — bodies for
 * long-jump upgrades routinely cleared the 50KB ADO render budget, and
 * pushed the meaningful per-version migration content out of view.
 *
 * The full CHANGELOG remains one click away. Breaking changes are already
 * extracted into their own section above this one, so removing the inline
 * dump doesn't lose actionable signal. Falls back to a link-only paragraph
 * when the slice was unfetchable.
 */
function buildWhatsNewSection(
  slice: ChangelogSlice | null,
  changelogUrl: string,
  pkg: string,
  pinned: string,
  latest: string,
): string {
  if (!slice) {
    return [
      "<h3>What's new</h3>",
      `<p>See the <a href="${changelogUrl}">CHANGELOG for ${escapeHtml(pkg)}</a> for changes between <code>${escapeHtml(pinned)}</code> and <code>${escapeHtml(latest)}</code>.</p>`,
    ].join("\n");
  }
  let features = 0;
  let bugFixes = 0;
  for (const version of slice.versions) {
    for (const section of version.sections) {
      if (section.type === "features") features += section.bullets.length;
      else if (section.type === "bugFixes") bugFixes += section.bullets.length;
    }
  }
  const featuresLine = `Features: <b>${features}</b>`;
  const bugFixesLine = `Bug fixes: <b>${bugFixes}</b>`;
  return [
    "<h3>What's new</h3>",
    `<p>Between <code>${escapeHtml(pinned)}</code> and <code>${escapeHtml(latest)}</code>:</p>`,
    "<ul>",
    `  <li>${featuresLine}</li>`,
    `  <li>${bugFixesLine}</li>`,
    "</ul>",
    `<p>See the <a href="${changelogUrl}">full CHANGELOG for ${escapeHtml(pkg)}</a> for the details.</p>`,
  ].join("\n");
}

/**
 * Renders a "Where this package is used in your codebase" section from a
 * GitHub Code Search result. Returns an empty string when there's no
 * inventory (search skipped/failed) or when totalCount is 0 — the body
 * stays clean in those cases instead of carrying a "we couldn't find
 * usages" disclaimer that adds no information.
 *
 * The section lives between Context and Breaking changes so it gives the
 * reviewer a sense of scope (how big is the change in *my* repo?) before
 * the migration content.
 */
function buildUsageSection(
  usage: UsageInventory | null,
  pkg: string,
  targetPackage: string | undefined,
): string {
  if (!usage || usage.totalCount === 0) {
    return "";
  }
  const fileWord = usage.totalCount === 1 ? "file" : "files";
  const sampleSize = Math.min(usage.sampleFiles.length, 10);
  const fileItems = usage.sampleFiles
    .slice(0, sampleSize)
    .map(
      (f) =>
        `  <li><a href="${f.htmlUrl}"><code>${escapeHtml(f.path)}</code></a></li>`,
    )
    .join("\n");
  const moreNote =
    usage.totalCount > sampleSize
      ? `<p>… and ${usage.totalCount - sampleSize} more. <a href="${usage.searchUrl}">View all results on GitHub</a>.</p>`
      : "";
  const pkgLabel = targetPackage
    ? `<code>${escapeHtml(pkg)}</code> or <code>${escapeHtml(targetPackage)}</code>`
    : `<code>${escapeHtml(pkg)}</code>`;
  return [
    "<h3>Where this package is used in your codebase</h3>",
    `<p>GitHub Code Search found ${pkgLabel} referenced in <b>${usage.totalCount}</b> ${fileWord} in this repo:</p>`,
    "<ul>",
    fileItems,
    "</ul>",
    moreNote,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Renders a "Breaking changes in this upgrade" section derived from the
 * BREAKING CHANGES subheadings in the CHANGELOG slice. Returns an empty
 * string when the changelog wasn't fetchable (so the section is omitted
 * entirely); returns an explicit "none detected" paragraph when the
 * changelog exists but contains no breaking-change entries.
 */
function buildBreakingChangesSection(
  candidate: UpgradeCandidate,
  changelogSlice: ChangelogSlice | null,
  breakingChanges: BreakingChange[],
): string {
  const { package: pkg, pinned, latest } = candidate;
  if (!changelogSlice) {
    return "";
  }
  if (breakingChanges.length === 0) {
    return [
      "<h3>Breaking changes in this upgrade</h3>",
      `<p>No breaking changes detected in <code>${escapeHtml(pkg)}</code> between <code>${escapeHtml(pinned)}</code> and <code>${escapeHtml(latest)}</code>.</p>`,
    ].join("\n");
  }
  const bullets = breakingChanges
    .map((bc) => renderBreakingChangeBullet(bc, candidate))
    .join("\n");
  return [
    "<h3>Breaking changes in this upgrade</h3>",
    "<ul>",
    bullets,
    "</ul>",
  ].join("\n");
}

function renderBreakingChangeBullet(
  bc: BreakingChange,
  candidate: UpgradeCandidate,
): string {
  const baseText = `<b>${escapeHtml(bc.version)}:</b> ${renderInline(bc.text)}`;
  const searchLink = buildBreakingChangeSearchLink(bc.text, candidate);
  if (!searchLink) {
    return `  <li>${baseText}</li>`;
  }
  return `  <li>${baseText} <span class="bot-find-link">${searchLink}</span></li>`;
}

/**
 * Returns an anchor tag pointing at a GitHub Code Search URL scoped to
 * the consumer repo for any identifier-shaped tokens (alphanumeric +
 * dashes/underscores) the CHANGELOG author wrapped in backticks.
 * Returns null when the breaking-change text has no such tokens —
 * the bullet renders without a search suffix in that case.
 *
 * The URL combines the package's short name AND the identifier(s) so the
 * search returns files that reference both, which is a fair proxy for
 * "files using this component that mention the changed identifier."
 * Pure URL building — no API call from the bot side; the reviewer
 * clicks if they want to investigate.
 */
function buildBreakingChangeSearchLink(
  rawText: string,
  candidate: UpgradeCandidate,
): string | null {
  const identifiers = extractIdentifiers(rawText);
  if (identifiers.length === 0) return null;

  let org: string;
  let repoName: string;
  try {
    const url = new URL(candidate.repoUrl);
    const segs = url.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return null;
    [org, repoName] = segs;
  } catch {
    return null;
  }

  const shortName = (candidate.targetPackage ?? candidate.package).replace(
    /^@[^/]+\//,
    "",
  );
  const idsQuoted = identifiers.map((i) => `"${i}"`).join(" OR ");
  const idsClause = identifiers.length > 1 ? `(${idsQuoted})` : idsQuoted;
  const q = `repo:${org}/${repoName} "${shortName}" ${idsClause}`;
  const href = `https://github.com/search?q=${encodeURIComponent(q)}&type=code`;
  const labelTokens = identifiers
    .map((i) => `<code>${escapeHtml(i)}</code>`)
    .join(", ");
  return `<a href="${href}">→ find ${labelTokens} in this repo</a>`;
}

/**
 * Pulls identifier-shaped tokens from backticked spans in CHANGELOG text.
 * "Identifier-shaped" = starts with a letter, then letters/digits/dashes/
 * underscores only, 2+ chars. This filters out non-searchable spans like
 * sentence fragments, URLs, or quoted snippets.
 */
function extractIdentifiers(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const ident = match[1].trim();
    if (/^[A-Za-z][\w-]{1,}$/.test(ident)) {
      found.add(ident);
    }
  }
  return [...found];
}

function renderInline(text: string): string {
  // Inline markdown that survives raw in a CHANGELOG bullet: `code` and
  // [label](url) links. Escape first so URL chars are safe before we
  // re-inject HTML tags.
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
