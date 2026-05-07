import fs from "node:fs";
import path from "node:path";
import type { UpgradeCandidate } from "./types.ts";

export interface PreviewInput {
  candidate: UpgradeCandidate;
  title: string;
  bodyHtml: string;
  tags: string[];
  changelogInlined: boolean;
}

/**
 * Writes one styled HTML file per candidate to `dir` so a reviewer can open
 * it in a browser and walk the auro-docs §2.4 validation checklist without
 * touching ADO. Filename: `<repo>__<package-flat>.html`.
 */
export function writePreviewFile(dir: string, input: PreviewInput): string {
  ensureDir(dir);
  const filename = buildFilename(input.candidate);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, renderHtml(input));
  return filePath;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildFilename(candidate: UpgradeCandidate): string {
  const flatPkg = candidate.package.replace(/^@/, "").replace(/\//g, "-");
  return `${sanitize(candidate.repo)}__${sanitize(flatPkg)}.html`;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function renderHtml(input: PreviewInput): string {
  const { candidate, title, bodyHtml, tags, changelogInlined } = input;
  const tagPills = tags
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join(" ");
  const changelogBadge = changelogInlined
    ? '<span class="badge badge-good">CHANGELOG inlined</span>'
    : '<span class="badge badge-warn">link-only fallback</span>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font: 14px/1.55 -apple-system, system-ui, "Segoe UI", sans-serif; max-width: 760px; margin: 2em auto; padding: 0 1.2em; color: #1f2328; }
    h1 { font-size: 1.35em; padding-bottom: 0.4em; border-bottom: 1px solid #d1d9e0; margin-bottom: 0.6em; }
    h3 { margin-top: 1.6em; font-size: 1.05em; color: #1f2328; }
    h4 { margin-top: 1.2em; font-size: 0.95em; color: #1f2328; }
    h5 { margin: 0.9em 0 0.2em; color: #57606a; font-size: 0.9em; font-weight: 600; }
    p { margin: 0.5em 0; }
    code { background: #eff1f3; padding: 0.1em 0.35em; border-radius: 3px; font-size: 90%; font-family: ui-monospace, SFMono-Regular, monospace; }
    a { color: #0969da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { padding-left: 1.5em; }
    li { margin: 0.2em 0; }
    .meta { color: #57606a; font-size: 0.88em; margin-bottom: 1em; }
    .meta strong { color: #1f2328; }
    .tag { display: inline-block; background: #ddf4ff; color: #0550ae; padding: 0.05em 0.55em; margin-right: 0.25em; border-radius: 2em; font-size: 0.82em; }
    .badge { display: inline-block; padding: 0.1em 0.5em; border-radius: 3px; font-size: 0.78em; margin-left: 0.4em; }
    .badge-good { background: #dafbe1; color: #1a7f37; }
    .badge-warn { background: #fff1c2; color: #7d4e00; }
    .preview-banner { background: #fff8c5; border: 1px solid #d4a72c; padding: 0.6em 1em; border-radius: 6px; margin-bottom: 1.5em; font-size: 0.9em; color: #633c01; }
  </style>
</head>
<body>
  <div class="preview-banner">
    <strong>Dry-run preview.</strong> No ADO ticket was created. This file shows the HTML body
    that <code>createADOWorkItem</code> would set as <code>System.Description</code>.
  </div>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    <strong>Repo:</strong> <a href="${escapeAttr(candidate.repoUrl)}">${escapeHtml(candidate.repo)}</a> &nbsp;·&nbsp;
    <strong>Package:</strong> <code>${escapeHtml(candidate.package)}</code> &nbsp;·&nbsp;
    <strong>Versions:</strong> <code>${escapeHtml(candidate.pinned)}</code> → <code>${escapeHtml(candidate.latest)}</code> &nbsp;·&nbsp;
    <strong>Majors behind:</strong> ${candidate.majorsBehind} ${changelogBadge}<br>
    <strong>Tags:</strong> ${tagPills}
  </div>
  <hr>
  ${bodyHtml}
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
