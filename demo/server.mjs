import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PREVIEW_DIR = path.join(
  PROJECT_ROOT,
  "test-fixtures",
  "version-bot",
  "preview-output",
);
const PORT = process.env.DEMO_PORT ? Number(process.env.DEMO_PORT) : 4477;

const FLAG_REFERENCE = [
  {
    flag: "--apply",
    desc: "Switches from dry-run (default) to live writes against ADO. Every scenario without this flag is read-only.",
  },
  {
    flag: "--no-tags",
    desc: "Skip setting System.Tags on new tickets. Used in this demo while we wait on the ADO permission needed to write tags; dedupe works without tags by matching title substrings within the Auro area path.",
  },
  {
    flag: "--limit <n>",
    desc: "Cap the number of tickets created in this run. Used during testing to bound blast radius; production cron omits it.",
  },
  {
    flag: "--repo <name>",
    desc: "Restrict to candidates from a single consumer repo. Used during bounded first-live runs.",
  },
  {
    flag: "--min-majors <n>",
    desc: "Filter out candidates fewer than N major versions behind. Default is 2; lowering to 1 surfaces minor-impact upgrades.",
  },
  {
    flag: "--candidates <file>",
    desc: "Use a fixture JSON file instead of the live scan output. Lets the demo run without re-scanning Alaska-ECommerce each time.",
  },
  {
    flag: "--preview-dir <dir>",
    desc: "Write one styled HTML preview per candidate to this directory. The preview is what reviewers would see if the ticket were created.",
  },
  {
    flag: "cleanup --last",
    desc: "Subcommand that rolls back the most recent --apply run by reading the audit log.",
  },
  {
    flag: "cleanup --list",
    desc: "Read-only listing of every historical run-id in the audit log. Pass a run-id to `cleanup --run-id <id>` to roll that specific run back.",
  },
];

const SCENARIOS = [
  {
    id: "00-tokens",
    label: "0. Validate setup",
    danger: false,
    description: "Verify both PATs are valid before anything else runs.",
    walkthrough:
      "Every later scenario calls GitHub or Azure DevOps using these two Personal Access Tokens. If either fails here, downstream scenarios will hang or 401. You should see two green PASS lines; a red FAIL means the corresponding env var is missing, expired, or has the wrong scope.",
    command: ["node", "scripts/check-tokens.js"],
    displayCommand: "npm run check-tokens",
  },
  {
    id: "01-scan-info",
    label: "1. About `auro version-scan` (informational)",
    danger: false,
    description: "What the scan does, without actually running it.",
    walkthrough:
      "This scenario describes `auro version-scan` rather than executing it. The real scan crawls every non-archived repo in Alaska-ECommerce (~2,500 of them), fetches each one's package.json over the GitHub API, and looks up the latest version of every Auro package on npm. That takes 3–5 minutes — too long for a live demo, and the cache makes subsequent runs incremental anyway. The candidates list scenario 2 will summarize comes from a real scan run on 2026-05-11 that found 436 upgrade candidates. In production, this command runs quarterly via a GitHub Actions cron.",
    command: ["node", "demo/scan-info.mjs"],
    displayCommand: "auro version-scan",
  },
  {
    id: "02-overview",
    label: "2. Scan results overview",
    danger: false,
    description: "Aggregate stats from the cached scan output.",
    walkthrough:
      "The numbers come from a real scan against Alaska-ECommerce (~2,500 repos, ~436 upgrade candidates). The scan itself takes 3–5 minutes so we cached its output rather than running it live. This gives a sense of how much work the bot would automate in one quarterly cron run, and where the work clusters by package and repo.",
    command: ["node", "demo/scan-overview.mjs"],
  },
  {
    id: "03-dry-single",
    label: "3. Dry-run: 1 ticket + HTML preview",
    danger: false,
    description:
      "Render one ticket end-to-end and write a styled HTML preview.",
    walkthrough:
      'This is the heart of the demo. The bot fetches auro-button\'s CHANGELOG from GitHub, slices it to the versions between pinned (11.5.1) and latest (12.3.2), parses out the breaking-change entries, and renders them into a body section enumerating each one. The acceptance criteria collapses to a single summary bullet that points back to that section by count (e.g. "Verify each of the N breaking changes…") — earlier designs emitted one AC bullet per breaking change, which buried the build/lint/test checkpoints under noise on long-jump upgrades. Open the preview link to see two more derived sections: "Where this package is used in your codebase" (file links from GitHub Code Search scoped to LoungeMembership-Web) and per-breaking-change "→ find <identifier> in this repo" search-URL links inside the body bullets. Every part is derived per-candidate, not boilerplate.',
    command: [
      "node",
      "./dist/auro-cli.js",
      "version-tickets",
      "--candidates",
      "./test-fixtures/version-bot/scenario-1-clean-upgrade.json",
      "--preview-dir",
      "./test-fixtures/version-bot/preview-output",
      "--min-majors",
      "1",
    ],
    displayCommand:
      "auro version-tickets --candidates ./test-fixtures/version-bot/scenario-1-clean-upgrade.json --preview-dir ./test-fixtures/version-bot/preview-output --min-majors 1",
    previewGlob: "LoungeMembership-Web__*.html",
  },
  {
    id: "04-dry-batch",
    label: "4. Dry-run: filter a batch by severity",
    danger: false,
    description:
      "Three candidates of mixed severity. Watch one get filtered out.",
    walkthrough:
      "The fixture intentionally contains three candidates at different upgrade severities: auro-button (1 major behind), auro-input (2 majors), and icons (3 majors). Running with `--min-majors 2` filters auro-button out — watch the summary line at the bottom go from 'Total candidates in JSON: 3' down to 'After filters: 2', with only auro-input and icons appearing in the rendered list. This is the knob a team would tune to control noise: they get paged for substantial upgrades, not every minor bump.",
    command: [
      "node",
      "./dist/auro-cli.js",
      "version-tickets",
      "--candidates",
      "./test-fixtures/version-bot/scenario-3-mixed-thresholds.json",
      "--min-majors",
      "2",
    ],
    displayCommand:
      "auro version-tickets --candidates ./test-fixtures/version-bot/scenario-3-mixed-thresholds.json --min-majors 2",
  },
  {
    id: "05-dry-namespace",
    label: "5. Dry-run: cross-namespace rename",
    danger: false,
    description:
      "@alaskaairux/auro-icon → @aurodesignsystem/auro-icon. Shows the rename callout.",
    walkthrough:
      "Most Auro packages were republished from `@alaskaairux` to `@aurodesignsystem`, so a consumer pinned on the legacy scope (e.g. `@alaskaairux/auro-icon@^1.0.1`) looks 'up to date' at the last legacy version even though active development is now at `@aurodesignsystem/auro-icon@9.x`. The bot's alias map resolves both scopes in parallel via npm and picks the higher version; when the upgrade crosses scopes, the candidate carries a `targetPackage` field. The rendered preview shows two things you don't see in scenario 3: a yellow \"⚠ Namespace rename\" callout at the top of the Context section, and a rewritten first AC bullet — \"Replace `@alaskaairux/auro-icon` with `@aurodesignsystem/auro-icon` in package.json…\" — making the rename the explicit first step. The usage inventory section searches both scopes and merges results, so a consumer mid-migration that still has legacy imports will see them flagged here.",
    command: [
      "node",
      "./dist/auro-cli.js",
      "version-tickets",
      "--candidates",
      "./test-fixtures/version-bot/scenario-4-cross-namespace.json",
      "--preview-dir",
      "./test-fixtures/version-bot/preview-output",
      "--min-majors",
      "1",
    ],
    displayCommand:
      "auro version-tickets --candidates ./test-fixtures/version-bot/scenario-4-cross-namespace.json --preview-dir ./test-fixtures/version-bot/preview-output --min-majors 1",
    previewGlob: "dated-flight-ui__*.html",
  },
  {
    id: "05b-dry-incident-notes",
    label: "5b. Dry-run: incident callout (catalog notes)",
    danger: false,
    description:
      "Surfaces a design-system-authored regression notice above breaking changes.",
    walkthrough:
      'Real situation that hit us recently: Auro shipped 12.4 with a regression in the disabled-state focus trap. Hundreds of consumer repos would have been told by the bot to upgrade — to the bad version. Today, the only intervention is hand-editing every candidate row before each scan. The compliance catalog gives engineers a one-line knob instead: an entry in `policy-catalog.ts` with `targetVersion: "12.3.2"` + `notes: "Skip 12.4 — regression in..."` pins the bot to the last-known-good major AND surfaces the explanation in every ticket. This fixture has the notes field pre-set so you can see the resulting ticket without editing the catalog. In the preview, look for the orange Incident notice callout above the Breaking changes section — that\'s the new advisory surface. Remove `notes` from the fixture JSON and rerun to see it disappear; the rest of the ticket is unchanged.',
    command: [
      "node",
      "./dist/auro-cli.js",
      "version-tickets",
      "--candidates",
      "./test-fixtures/version-bot/scenario-5-incident-notes.json",
      "--preview-dir",
      "./test-fixtures/version-bot/preview-output",
      "--min-majors",
      "1",
    ],
    displayCommand:
      "auro version-tickets --candidates ./test-fixtures/version-bot/scenario-5-incident-notes.json --preview-dir ./test-fixtures/version-bot/preview-output --min-majors 1",
    previewGlob: "LoungeMembership-Web__*.html",
  },
  {
    id: "06-apply-single",
    label: "6. APPLY: 1 ticket to ADO",
    danger: true,
    description: "First real write. One ticket, bounded by safety flags.",
    walkthrough:
      "Three flags work together to constrain blast radius. `--repo Web-AccountOverview` limits which consumer repo is in scope, `--limit 1` caps total tickets created regardless of how many candidates qualify, and `--min-majors 2` filters out the smallest upgrades. (Web-AccountOverview has 13 candidates ≥ 2 majors behind in the cached scan output, so the filter does real work here, not just notional work — and `--limit 1` is what keeps us from creating all 13 at once.) The run-id printed at the top is your rollback handle — copy it if you want to roll this run back later in scenario 9.",
    command: [
      "node",
      "./dist/auro-cli.js",
      "version-tickets",
      "--apply",
      "--no-tags",
      "--limit",
      "1",
      "--repo",
      "Web-AccountOverview",
      "--min-majors",
      "2",
    ],
    displayCommand:
      "auro version-tickets --apply --no-tags --limit 1 --repo Web-AccountOverview --min-majors 2",
  },
  {
    id: "07-apply-batch",
    label: "7. APPLY: small batch (3 tickets)",
    danger: true,
    description: "Same as scenario 6 but creates up to 3 tickets in one run.",
    walkthrough:
      "Identical to scenario 6 except `--limit 3` lets multiple tickets through. All tickets created here share a single run-id in the audit log, so the cleanup in scenario 9 will treat them as a unit. In production the quarterly cron omits `--limit` entirely and creates as many tickets as candidates qualify — dedupe (scenario 8) is what prevents that from spamming.",
    command: [
      "node",
      "./dist/auro-cli.js",
      "version-tickets",
      "--apply",
      "--no-tags",
      "--limit",
      "3",
      "--repo",
      "Web-AccountOverview",
      "--min-majors",
      "2",
    ],
    displayCommand:
      "auro version-tickets --apply --no-tags --limit 3 --repo Web-AccountOverview --min-majors 2",
  },
  {
    id: "08-rerun-dedupe",
    label: "8. APPLY again → dedupe path",
    danger: true,
    description:
      "Re-run scenario 6. The dedupe gate prevents duplicate tickets.",
    walkthrough:
      "Identical command to scenario 6, run a second time. You actually already saw dedupe happen during scenario 7 — when its `--limit 3` returned candidates #1, #2, and #3, candidate #1 was the same one scenario 6 ticketed, so scenario 7's summary showed `Dedupe: 1 skipped, Applied: 2`. This scenario isolates that behavior: every candidate `--limit 1` returns is one we've already ticketed, so this run should produce zero new tickets and one skip. The dedupe gate works by querying ADO for any open User Story under the Auro area path whose title contains both this candidate's package name and consumer repo; if `latest` hasn't moved, it's a true dupe (skip); if `latest` advanced since the original ticket was created, the old ticket is closed and a new one is created with a 'Supersedes #N' link.",
    command: [
      "node",
      "./dist/auro-cli.js",
      "version-tickets",
      "--apply",
      "--no-tags",
      "--limit",
      "1",
      "--repo",
      "Web-AccountOverview",
      "--min-majors",
      "2",
    ],
    displayCommand:
      "auro version-tickets --apply --no-tags --limit 1 --repo Web-AccountOverview --min-majors 2",
  },
  {
    id: "09-cleanup-last",
    label: "9. CLEANUP: roll back last run",
    danger: true,
    description:
      "Set every ticket from the most recent --apply run to Removed.",
    walkthrough:
      "Reads the most recent run-id from the audit log, then sets every ticket from that run to `Removed` state with a history comment naming the cleanup run. This is a soft delete — hard delete requires ADO admin permissions most users don't have. The cleanup itself is logged as a new audit entry, so a future inspector can trace 'which run created this ticket, and which cleanup later removed it.'",
    command: [
      "node",
      "./dist/auro-cli.js",
      "version-tickets",
      "cleanup",
      "--last",
      "--apply",
    ],
    displayCommand: "auro version-tickets cleanup --last --apply",
  },
  {
    id: "10-list-runs",
    label: "10. List run IDs",
    danger: false,
    description: "Read-only inventory of every historical run.",
    walkthrough:
      "Lists every `--apply` and cleanup run recorded in the audit log, with timestamps and ticket counts. To roll back a specific older run (not just the most recent), grab its run-id from this list and pass it to `auro version-tickets cleanup --run-id <id> --apply`. This is the audit surface a manager would want to see if they ever ask 'what did the bot create last month, and which of it has since been undone?'",
    command: [
      "node",
      "./dist/auro-cli.js",
      "version-tickets",
      "cleanup",
      "--list",
    ],
    displayCommand: "auro version-tickets cleanup --list",
  },
];

function commandFor(scenario) {
  return scenario.displayCommand ?? scenario.command.join(" ");
}

// Match SGR (color) escapes plus cursor-movement codes ([2K, [1G, ...).
const ANSI = /\[[0-9;?]*[a-zA-Z]/g;
function stripAnsi(s) {
  return s.replace(ANSI, "");
}

const CACHE_DIR = path.join(PROJECT_ROOT, ".cache", "version-bot");
const FINDINGS_FILE = path.join(CACHE_DIR, "auro-compliance-findings.json");
const CANDIDATES_FILE = path.join(CACHE_DIR, "auro-upgrade-candidates.json");
const SCAN_CACHE_FILE = path.join(
  CACHE_DIR,
  "auro-deps-by-ecommerce-repo.json",
);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/") return serveIndex(res);
    if (url.pathname === "/dashboard") return serveDashboard(res);
    if (url.pathname === "/scenarios") return serveScenarios(res);
    if (url.pathname === "/run") return runScenario(url, res);
    if (url.pathname === "/api/findings") return serveFindings(res);
    if (url.pathname.startsWith("/preview/")) return servePreview(url, res);
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`Server error: ${err instanceof Error ? err.message : err}`);
  }
});

server.listen(PORT, () => {
  console.log(`\nAuro Version Bot demo → http://localhost:${PORT}\n`);
  console.log("Open that URL in a browser. Press Ctrl-C here to stop.\n");
});

function serveIndex(res) {
  const html = fs.readFileSync(path.join(__dirname, "index.html"));
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveDashboard(res) {
  const html = fs.readFileSync(path.join(__dirname, "dashboard.html"));
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/**
 * Aggregates the cached scan output into the shape the dashboard needs:
 * KPIs, status distribution, top-10 repos, top-10 packages, and a
 * deprecation-surface summary. Dashboard fetches this once on load
 * instead of pulling the raw findings JSON (which can be 1k+ rows).
 */
function serveFindings(res) {
  if (!fs.existsSync(FINDINGS_FILE)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "No compliance-findings file found. Run `node ./dist/auro-cli.js version-scan` first.",
      }),
    );
    return;
  }

  let findings;
  let candidates = [];
  let reposScanned = 0;
  try {
    findings = JSON.parse(fs.readFileSync(FINDINGS_FILE, "utf8"));
    if (fs.existsSync(CANDIDATES_FILE)) {
      candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, "utf8"));
    }
    if (fs.existsSync(SCAN_CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(SCAN_CACHE_FILE, "utf8"));
      reposScanned = Object.values(cache.repos ?? {}).filter(
        (r) => !r.error && !r.archived,
      ).length;
    }
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `Could not parse scan output: ${err instanceof Error ? err.message : err}`,
      }),
    );
    return;
  }

  const total = findings.length;
  const statusCounts = {};
  for (const f of findings) {
    statusCounts[f.status] = (statusCounts[f.status] ?? 0) + 1;
  }
  const currentCount = statusCounts.Current ?? 0;
  const behindCount = statusCounts.Behind ?? 0;
  const unsupportedCount = statusCounts.Unsupported ?? 0;
  const compliancePct = total ? Math.round((currentCount / total) * 100) : 0;

  // Top repos by candidate count — every (repo) with N candidates needing
  // tickets, sorted descending. Surfaces "Borealis: 13" type signals.
  const candidatesByRepo = new Map();
  for (const c of candidates) {
    candidatesByRepo.set(c.repo, (candidatesByRepo.get(c.repo) ?? 0) + 1);
  }
  const topRepos = [...candidatesByRepo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([repo, count]) => ({ repo, count }));

  // Top packages by consumer count: how many consumer repos are behind on
  // each package? Surfaces "auro-button: 91 consumers behind" — the
  // packages with the broadest org-wide upgrade story.
  const consumersByPackage = new Map();
  for (const c of candidates) {
    consumersByPackage.set(
      c.package,
      (consumersByPackage.get(c.package) ?? 0) + 1,
    );
  }
  const topPackages = [...consumersByPackage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pkg, count]) => ({ package: pkg, count }));

  // Deprecation surface — Unsupported broken down by successor. Surfaces
  // "formkit migration: 73 deprecation tickets across 8 packages."
  const deprecationGroups = new Map();
  for (const c of candidates) {
    if (c.status !== "Unsupported") continue;
    const successor = c.targetPackage ?? "(unknown)";
    if (!deprecationGroups.has(successor)) {
      deprecationGroups.set(successor, {
        successor,
        packages: new Set(),
        repos: new Set(),
        count: 0,
      });
    }
    const g = deprecationGroups.get(successor);
    g.packages.add(c.package);
    g.repos.add(c.repo);
    g.count += 1;
  }
  const deprecationSurface = [...deprecationGroups.values()]
    .map((g) => ({
      successor: g.successor,
      packageCount: g.packages.size,
      packages: [...g.packages].sort(),
      repoCount: g.repos.size,
      ticketCount: g.count,
    }))
    .sort((a, b) => b.ticketCount - a.ticketCount);

  // Per-repo compliance breakdown. Findings drive the counts (they include
  // Current rows that candidates drop); candidates drive the drilldown
  // (which packages does this repo actually need to action?). Joining by
  // repo gives each row both the "where you stand" summary and the
  // "what's left to do" list.
  const repoMap = new Map();
  for (const f of findings) {
    if (!repoMap.has(f.repository)) {
      repoMap.set(f.repository, {
        repo: f.repository,
        repoUrl: `https://github.com/Alaska-ECommerce/${f.repository}`,
        total: 0,
        current: 0,
        behind: 0,
        unsupported: 0,
        issues: [],
      });
    }
    const r = repoMap.get(f.repository);
    r.total += 1;
    if (f.status === "Current") r.current += 1;
    else if (f.status === "Behind") r.behind += 1;
    else if (f.status === "Unsupported") r.unsupported += 1;
  }
  for (const c of candidates) {
    const r = repoMap.get(c.repo);
    if (!r) continue;
    r.issues.push({
      package: c.package,
      pinned: c.pinned,
      recommended: c.latest,
      status: c.status ?? "Behind",
      successorPackage: c.targetPackage ?? null,
      majorsBehind: c.majorsBehind,
    });
  }
  // Sort each repo's issues so Unsupported floats to the top of the
  // drilldown, then Behind by descending majorsBehind. Engineers reading
  // the row see the riskiest items first.
  const statusRank = { Unsupported: 0, Behind: 1, "Review needed": 2 };
  for (const r of repoMap.values()) {
    r.issues.sort((a, b) => {
      const sa = statusRank[a.status] ?? 9;
      const sb = statusRank[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return (b.majorsBehind ?? 0) - (a.majorsBehind ?? 0);
    });
  }
  const repoBreakdown = [...repoMap.values()]
    .map((r) => ({
      ...r,
      compliancePct: r.total
        ? Math.round((r.current / r.total) * 100)
        : 0,
    }))
    // Default sort: lowest compliance first (most work at top). Ties
    // broken by descending Unsupported count, then by total package count
    // so high-surface-area repos float to the top of equally-bad rows.
    .sort((a, b) => {
      if (a.compliancePct !== b.compliancePct) {
        return a.compliancePct - b.compliancePct;
      }
      if (a.unsupported !== b.unsupported) {
        return b.unsupported - a.unsupported;
      }
      return b.total - a.total;
    });

  const meta = findings[0]
    ? { scanRunId: findings[0].scanRunId, scannedAt: findings[0].scannedAt }
    : { scanRunId: null, scannedAt: null };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      meta,
      kpis: {
        reposScanned,
        totalFindings: total,
        candidatesNeedingTickets: candidates.length,
        compliancePct,
      },
      statusBreakdown: {
        Current: currentCount,
        Behind: behindCount,
        Unsupported: unsupportedCount,
      },
      topRepos,
      topPackages,
      deprecationSurface,
      repoBreakdown,
    }),
  );
}

function serveScenarios(res) {
  const scenarios = SCENARIOS.map((scenario) => {
    const { command, previewGlob, displayCommand, ...rest } = scenario;
    return {
      ...rest,
      commandDisplay: commandFor(scenario),
      hasPreview: Boolean(previewGlob),
    };
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ scenarios, flagReference: FLAG_REFERENCE }));
}

function runScenario(url, res) {
  const id = url.searchParams.get("id");
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Unknown scenario");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  send(res, "meta", {
    label: scenario.label,
    commandDisplay: commandFor(scenario),
  });

  const child = spawn(scenario.command[0], scenario.command.slice(1), {
    cwd: PROJECT_ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  child.stdout.on("data", (chunk) => {
    send(res, "stdout", stripAnsi(chunk.toString()));
  });
  child.stderr.on("data", (chunk) => {
    send(res, "stderr", stripAnsi(chunk.toString()));
  });
  child.on("error", (err) => {
    send(res, "stderr", `spawn error: ${err.message}\n`);
  });
  child.on("close", (code) => {
    const previewUrls = scenario.previewGlob
      ? listPreviewMatches(scenario.previewGlob)
      : [];
    send(res, "done", { exitCode: code, previewUrls });
    res.end();
  });

  res.socket?.on("close", () => {
    if (child.exitCode === null) child.kill("SIGTERM");
  });
}

function send(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function listPreviewMatches(glob) {
  if (!fs.existsSync(PREVIEW_DIR)) return [];
  const prefix = glob.replace(/\*.*$/, "");
  const matches = fs
    .readdirSync(PREVIEW_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".html"))
    .map((f) => `/preview/${encodeURIComponent(f)}`);
  return matches;
}

function servePreview(url, res) {
  const fileName = decodeURIComponent(url.pathname.slice("/preview/".length));
  // Reject anything that tries to escape the preview dir.
  if (fileName.includes("/") || fileName.includes("..")) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad path");
    return;
  }
  const filePath = path.join(PREVIEW_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Preview not found — run scenario 3 first.");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(fs.readFileSync(filePath));
}
