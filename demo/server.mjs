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
    id: "00-scan-info",
    label: "0. About `auro version-scan` (informational)",
    danger: false,
    description: "What the scan does, without actually running it.",
    walkthrough:
      "This scenario describes `auro version-scan` rather than executing it. The real scan crawls every non-archived repo in Alaska-ECommerce (~2,500 of them), fetches each one's package.json over the GitHub API, and looks up the latest version of every Auro package on npm. That takes 3–5 minutes — too long for a live demo, and the cache makes subsequent runs incremental anyway. The candidates list scenario 2 will summarize comes from a real scan run on 2026-05-11 that found 436 upgrade candidates. In production, this command runs quarterly via a GitHub Actions cron.",
    command: ["node", "demo/scan-info.mjs"],
    displayCommand: "auro version-scan",
  },
  {
    id: "01-tokens",
    label: "1. Validate setup",
    danger: false,
    description: "Verify both PATs are valid before anything else runs.",
    walkthrough:
      "Every later scenario calls GitHub or Azure DevOps using these two Personal Access Tokens. If either fails here, downstream scenarios will hang or 401. You should see two green PASS lines; a red FAIL means the corresponding env var is missing, expired, or has the wrong scope.",
    command: ["node", "scripts/check-tokens.js"],
    displayCommand: "npm run check-tokens",
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
      "This is the heart of the demo. The bot fetches the package's CHANGELOG from GitHub, slices it to the versions between pinned and latest, parses out the breaking-change entries, and renders them into both a body section and per-bullet acceptance criteria. Open the preview link to see the rendered ticket exactly as it would appear in ADO — every part of that content is derived per-candidate, not boilerplate.",
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
    previewGlob: "fixture-clean-upgrade__*.html",
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
    id: "05-apply-single",
    label: "5. APPLY: 1 ticket to ADO",
    danger: true,
    description: "First real write. One ticket, bounded by safety flags.",
    walkthrough:
      "Three flags work together to constrain blast radius. `--repo Web-AccountOverview` limits which consumer repo is in scope, `--limit 1` caps total tickets created regardless of how many candidates qualify, and `--min-majors 2` filters out the smallest upgrades. (Web-AccountOverview has 13 candidates ≥ 2 majors behind in the cached scan output, so the filter does real work here, not just notional work — and `--limit 1` is what keeps us from creating all 13 at once.) The run-id printed at the top is your rollback handle — copy it if you want to roll this run back later in scenario 8.",
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
    id: "06-apply-batch",
    label: "6. APPLY: small batch (3 tickets)",
    danger: true,
    description: "Same as scenario 5 but creates up to 3 tickets in one run.",
    walkthrough:
      "Identical to scenario 5 except `--limit 3` lets multiple tickets through. All tickets created here share a single run-id in the audit log, so the cleanup in scenario 8 will treat them as a unit. In production the quarterly cron omits `--limit` entirely and creates as many tickets as candidates qualify — dedupe (scenario 7) is what prevents that from spamming.",
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
    id: "07-rerun-dedupe",
    label: "7. APPLY again → dedupe path",
    danger: true,
    description:
      "Re-run scenario 5. The dedupe gate prevents duplicate tickets.",
    walkthrough:
      "Identical command to scenario 5, run a second time. You actually already saw dedupe happen during scenario 6 — when its `--limit 3` returned candidates #1, #2, and #3, candidate #1 was the same one scenario 5 ticketed, so scenario 6's summary showed `Dedupe: 1 skipped, Applied: 2`. This scenario isolates that behavior: every candidate `--limit 1` returns is one we've already ticketed, so this run should produce zero new tickets and one skip. The dedupe gate works by querying ADO for any open User Story under the Auro area path whose title contains both this candidate's package name and consumer repo; if `latest` hasn't moved, it's a true dupe (skip); if `latest` advanced since the original ticket was created, the old ticket is closed and a new one is created with a 'Supersedes #N' link.",
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
    id: "08-cleanup-last",
    label: "8. CLEANUP: roll back last run",
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
    id: "09-list-runs",
    label: "9. List run IDs",
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/") return serveIndex(res);
    if (url.pathname === "/scenarios") return serveScenarios(res);
    if (url.pathname === "/run") return runScenario(url, res);
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
