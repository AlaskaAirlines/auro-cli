import { describe, expect, it } from "vitest";
import { buildComplianceFindings, evaluateRepoPackage } from "./findings.ts";
import type { ResolvedLatest } from "./npm-registry.ts";
import type { PackageScan, RepoEntry, ScanCache } from "./types.ts";

function makeScan(path: string, auroDeps: Record<string, string>): PackageScan {
  return { path, auroDeps, totalDeps: Object.keys(auroDeps).length };
}

function makeRepo(
  name: string,
  packages: Record<string, PackageScan>,
): RepoEntry {
  return {
    name,
    defaultBranch: "main",
    pushedAt: "2026-05-18T00:00:00Z",
    archived: false,
    language: "TypeScript",
    scannedAt: "2026-05-18T00:00:00Z",
    isMonorepo: Object.keys(packages).length > 1,
    packages,
    error: null,
  };
}

function makeCache(repos: RepoEntry[]): ScanCache {
  return {
    version: 2,
    lastFullScan: "2026-05-18T00:00:00Z",
    repos: Object.fromEntries(repos.map((r) => [r.name, r])),
  };
}

function resolved(version: string, pkg?: string): ResolvedLatest {
  return { resolvedPackage: pkg ?? "", version };
}

const SCAN_RUN_ID = "20260518T000000-aaaaaa";
const SCANNED_AT = "2026-05-18T00:00:00Z";

describe("evaluateRepoPackage — shared per-tuple evaluator", () => {
  it("returns null when the package is archived without a catalog successor", () => {
    const archived = new Set(["@aurodesignsystem/auro-orphan"]);
    const latest = new Map<string, ResolvedLatest>();
    const result = evaluateRepoPackage(
      "@aurodesignsystem/auro-orphan",
      "^1.0.0",
      archived,
      latest,
    );
    expect(result).toBeNull();
  });

  it("returns null when npm couldn't resolve the package's version", () => {
    const latest = new Map<string, ResolvedLatest>();
    const result = evaluateRepoPackage(
      "@aurodesignsystem/auro-unknown",
      "^1.0.0",
      new Set(),
      latest,
    );
    expect(result).toBeNull();
  });

  it("returns Current with effectiveLatest=npmLatest for uncataloged packages already at the latest major", () => {
    const latest = new Map([
      ["@aurodesignsystem/auro-icon", resolved("9.3.0")],
    ]);
    const result = evaluateRepoPackage(
      "@aurodesignsystem/auro-icon",
      "^9.1.0",
      new Set(),
      latest,
    );
    expect(result?.status).toBe("Current");
    expect(result?.effectiveLatest).toBe("9.3.0");
    expect(result?.majorsBehind).toBe(0);
  });

  it("returns Unsupported and points effectiveLatest at the successor's version", () => {
    const latest = new Map([
      ["@aurodesignsystem/auro-checkbox", resolved("4.1.4")],
      ["@aurodesignsystem/auro-formkit", resolved("4.0.0")],
    ]);
    const result = evaluateRepoPackage(
      "@aurodesignsystem/auro-checkbox",
      "^3.0.0",
      new Set(),
      latest,
    );
    expect(result?.status).toBe("Unsupported");
    expect(result?.targetPackage).toBe("@aurodesignsystem/auro-formkit");
    // The bot must NOT recommend the deprecated package's own latest as the
    // upgrade target — that would tell consumers to "upgrade" to a still-
    // deprecated version.
    expect(result?.effectiveLatest).toBe("4.0.0");
  });

  it("keeps archived packages in scope when the catalog has a successor pointer", () => {
    const archived = new Set(["@aurodesignsystem/auro-checkbox"]);
    const latest = new Map([
      ["@aurodesignsystem/auro-checkbox", resolved("4.1.4")],
      ["@aurodesignsystem/auro-formkit", resolved("4.0.0")],
    ]);
    const result = evaluateRepoPackage(
      "@aurodesignsystem/auro-checkbox",
      "^3.0.0",
      archived,
      latest,
    );
    expect(result).not.toBeNull();
    expect(result?.status).toBe("Unsupported");
  });
});

describe("buildComplianceFindings", () => {
  it("emits Current rows that the candidates list would have dropped", () => {
    // Findings are the backward-looking superset — dashboards / Backstage
    // need to render "you're on the latest" rows too. The candidates JSON
    // intentionally filters these out.
    const cache = makeCache([
      makeRepo("up-to-date", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-icon": "^9.3.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-icon", resolved("9.3.0")],
    ]);

    const findings = buildComplianceFindings(
      cache,
      new Set(),
      latest,
      SCAN_RUN_ID,
      SCANNED_AT,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("Current");
    expect(findings[0].repository).toBe("up-to-date");
    expect(findings[0].packageName).toBe("@aurodesignsystem/auro-icon");
  });

  it("stamps every finding with the scanRunId and scannedAt timestamp", () => {
    // scanRunId joins findings to a future scan_runs table. Per-row
    // denormalization keeps the file forward-compatible with the SQLite
    // migration in the compliance recommendation.
    const cache = makeCache([
      makeRepo("r1", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-button": "^7.0.0",
        }),
      }),
      makeRepo("r2", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-button": "^9.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-button", resolved("12.0.0")],
    ]);

    const findings = buildComplianceFindings(
      cache,
      new Set(),
      latest,
      SCAN_RUN_ID,
      SCANNED_AT,
    );

    for (const f of findings) {
      expect(f.scanRunId).toBe(SCAN_RUN_ID);
      expect(f.scannedAt).toBe(SCANNED_AT);
    }
  });

  it("emits Unsupported findings with successor pointer for catalog-deprecated packages", () => {
    const cache = makeCache([
      makeRepo("legacy", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-checkbox": "^3.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-checkbox", resolved("4.1.4")],
      ["@aurodesignsystem/auro-formkit", resolved("4.0.0")],
    ]);

    const findings = buildComplianceFindings(
      cache,
      new Set(),
      latest,
      SCAN_RUN_ID,
      SCANNED_AT,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("Unsupported");
    expect(findings[0].successorPackage).toBe("@aurodesignsystem/auro-formkit");
    expect(findings[0].statusReason).toMatch(
      /Migrate to @aurodesignsystem\/auro-formkit/,
    );
  });

  it("collapses multi-manifest occurrences into one finding per (repo, package)", () => {
    const cache = makeCache([
      makeRepo("bff-style", {
        "client/package.json": makeScan("client/package.json", {
          "@aurodesignsystem/auro-button": "^11.5.0",
        }),
        "component/package.json": makeScan("component/package.json", {
          "@aurodesignsystem/auro-button": "^7.2.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-button", resolved("12.3.2")],
    ]);

    const findings = buildComplianceFindings(
      cache,
      new Set(),
      latest,
      SCAN_RUN_ID,
      SCANNED_AT,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].manifestPaths.sort()).toEqual([
      "client/package.json",
      "component/package.json",
    ]);
    // Worst-case-behind: the lower pin drives the reported state.
    expect(findings[0].declaredVersion).toBe("^7.2.0");
    expect(findings[0].majorsBehind).toBe(5);
  });

  it("does NOT emit findings for archived packages without a catalog successor", () => {
    const cache = makeCache([
      makeRepo("ghost-dep", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-orphan": "^1.0.0",
        }),
      }),
    ]);
    const archived = new Set(["@aurodesignsystem/auro-orphan"]);
    const latest = new Map<string, ResolvedLatest>();

    const findings = buildComplianceFindings(
      cache,
      archived,
      latest,
      SCAN_RUN_ID,
      SCANNED_AT,
    );

    expect(findings).toHaveLength(0);
  });

  it("keeps archived packages in findings when the catalog has a successor pointer", () => {
    const cache = makeCache([
      makeRepo("legacy", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-checkbox": "^3.0.0",
        }),
      }),
    ]);
    const archived = new Set(["@aurodesignsystem/auro-checkbox"]);
    const latest = new Map([
      ["@aurodesignsystem/auro-checkbox", resolved("4.1.4")],
      ["@aurodesignsystem/auro-formkit", resolved("4.0.0")],
    ]);

    const findings = buildComplianceFindings(
      cache,
      archived,
      latest,
      SCAN_RUN_ID,
      SCANNED_AT,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("Unsupported");
    expect(findings[0].successorPackage).toBe("@aurodesignsystem/auro-formkit");
  });

  it("includes targetVersion and minimumVersion from policy when set, otherwise null", () => {
    // The seed catalog leaves targetVersion / minimumVersion unset — every
    // finding should carry null for those fields. (Once incident knobs get
    // set in production, this test will continue to pass for uncataloged
    // packages.)
    const cache = makeCache([
      makeRepo("r1", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-button": "^7.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-button", resolved("12.0.0")],
    ]);

    const findings = buildComplianceFindings(
      cache,
      new Set(),
      latest,
      SCAN_RUN_ID,
      SCANNED_AT,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].targetVersion).toBeNull();
    expect(findings[0].minimumVersion).toBeNull();
    // resolvedVersion is null until lockfile parsing (Step 3) lands.
    expect(findings[0].resolvedVersion).toBeNull();
  });
});
