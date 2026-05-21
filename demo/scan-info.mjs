/**
 * Informational-only script for the demo. Prints what `auro version-scan`
 * does without actually running the scan (which takes 3–5 minutes against
 * the live Alaska-ECommerce org).
 *
 * Scenario 2 ("Scan results overview") reads from the cached output of a
 * real scan, so the rest of the demo runs in seconds.
 */

const lines = [
  "About `auro version-scan` — informational only",
  "================================================",
  "",
  "What it does, step by step:",
  "",
  "  1. List every non-archived, non-fork repo in the Alaska-ECommerce",
  "     GitHub org. (Live count: ~2,500 repos.)",
  "  2. For each repo, fetch its root package.json via the GitHub API.",
  "  3. Extract every dependency under @aurodesignsystem/* or",
  "     @alaskaairux/*.",
  "  4. Look up the latest published version of each distinct Auro",
  "     package on npm.",
  "  5. Compare pinned vs latest. Emit a candidate row per (repo,",
  "     package) >= 1 major behind. Drop packages whose source repo is",
  "     archived in AlaskaAirlines.",
  "  6. Write two JSON files to .cache/version-bot/:",
  "       - auro-deps-by-ecommerce-repo.json (full per-repo snapshot)",
  "       - auro-upgrade-candidates.json     (filtered candidate list)",
  "",
  "How long it takes: 3-5 minutes for a full run. Subsequent runs are",
  "incremental — repos whose `pushed_at` hasn't changed since the last",
  "scan are skipped (the cache holds their previous dep snapshot).",
  "",
  "Why we are not running it live in this demo: the scan dominates",
  "wall-clock time. The candidates list scenario 2 will summarize is",
  "the actual output of a real scan run on 2026-05-11 against the live",
  "Alaska-ECommerce org. That run found 436 upgrade candidates spread",
  "across ~110 consumer repos.",
  "",
  "How it runs in production: quarterly (1st of Jan/Apr/Jul/Oct), via a",
  "GitHub Actions cron, with the cache reused across runs so each pass",
  "only re-fetches the repos that changed since the last scan.",
  "",
  "The real command:",
  "",
  "  auro version-scan",
  "",
  "Optional flags:",
  "  --org <name>       Override the default org (Alaska-ECommerce).",
  "  --force            Ignore the pushed_at short-circuit and re-scan",
  "                     every repo from scratch.",
  "  --output-dir <dir> Write the two JSON files somewhere other than",
  "                     ./.cache/version-bot/.",
  "",
  "(End of informational block — no work was done.)",
];

for (const line of lines) console.log(line);
