import fs from "node:fs";
import path from "node:path";

const CANDIDATES_PATH = path.resolve(
  ".cache",
  "version-bot",
  "auro-upgrade-candidates.json",
);

if (!fs.existsSync(CANDIDATES_PATH)) {
  console.error(`No candidates file at ${CANDIDATES_PATH}`);
  console.error("Run `auro version-scan` first to produce one.");
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, "utf8"));

console.log(`Total upgrade candidates: ${candidates.length}`);
console.log("");

const byMajors = new Map();
for (const c of candidates) {
  byMajors.set(c.majorsBehind, (byMajors.get(c.majorsBehind) ?? 0) + 1);
}
console.log("Distribution by majors-behind:");
for (const [n, count] of [...byMajors.entries()].sort((a, b) => a[0] - b[0])) {
  const bar = "#".repeat(Math.round((count / candidates.length) * 40));
  console.log(
    `  ${String(n).padStart(2)} majors: ${String(count).padStart(4)}  ${bar}`,
  );
}
console.log("");

const byRepo = new Map();
for (const c of candidates) {
  byRepo.set(c.repo, (byRepo.get(c.repo) ?? 0) + 1);
}
const topRepos = [...byRepo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`Top 10 repos by candidate count (of ${byRepo.size} repos):`);
for (const [repo, count] of topRepos) {
  console.log(`  ${String(count).padStart(4)}  ${repo}`);
}
console.log("");

const byPkg = new Map();
for (const c of candidates) {
  byPkg.set(c.package, (byPkg.get(c.package) ?? 0) + 1);
}
const topPkgs = [...byPkg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`Top 10 packages by candidate count (of ${byPkg.size} packages):`);
for (const [pkg, count] of topPkgs) {
  console.log(`  ${String(count).padStart(4)}  ${pkg}`);
}
