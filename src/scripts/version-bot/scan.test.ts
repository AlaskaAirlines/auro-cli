import { describe, expect, it } from "vitest";
import type { ResolvedLatest } from "./npm-registry.ts";
import { collapseCandidatesByPackage } from "./scan.ts";
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
    pushedAt: "2026-05-15T00:00:00Z",
    archived: false,
    language: "TypeScript",
    scannedAt: "2026-05-15T00:00:00Z",
    isMonorepo: Object.keys(packages).length > 1,
    packages,
    error: null,
  };
}

function makeCache(repos: RepoEntry[]): ScanCache {
  return {
    version: 2,
    lastFullScan: "2026-05-15T00:00:00Z",
    repos: Object.fromEntries(repos.map((r) => [r.name, r])),
  };
}

function resolved(version: string, pkg?: string): ResolvedLatest {
  return { resolvedPackage: pkg ?? "", version };
}

describe("collapseCandidatesByPackage", () => {
  const org = "Alaska-ECommerce";

  it("emits one candidate per (repo, package) for single-manifest repos", () => {
    const cache = makeCache([
      makeRepo("solo-repo", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-button": "^7.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      [
        "@aurodesignsystem/auro-button",
        resolved("12.3.2", "@aurodesignsystem/auro-button"),
      ],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].repo).toBe("solo-repo");
    expect(result[0].package).toBe("@aurodesignsystem/auro-button");
    expect(result[0].pinned).toBe("^7.0.0");
    expect(result[0].manifestPaths).toEqual(["package.json"]);
    expect(result[0].repoUrl).toBe(
      "https://github.com/Alaska-ECommerce/solo-repo",
    );
  });

  it("collapses multiple manifests of the same package into one candidate", () => {
    // BFF+Component shape: same package in client/ and component/ at the
    // same pin. Should produce ONE candidate with both paths.
    const cache = makeCache([
      makeRepo("bff-style", {
        "client/package.json": makeScan("client/package.json", {
          "@aurodesignsystem/auro-button": "^7.0.0",
        }),
        "component/package.json": makeScan("component/package.json", {
          "@aurodesignsystem/auro-button": "^7.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-button", resolved("12.0.0")],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].manifestPaths?.sort()).toEqual([
      "client/package.json",
      "component/package.json",
    ]);
    expect(result[0].pinned).toBe("^7.0.0");
    expect(result[0].majorsBehind).toBe(5);
  });

  it("uses the lowest pin (worst-case-behind) when manifests disagree", () => {
    // Same package pinned at different versions across manifests. The
    // ticket urgency should reflect the most out-of-date copy.
    const cache = makeCache([
      makeRepo("split-pin", {
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

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].pinned).toBe("^7.2.0"); // lowest pin
    expect(result[0].majorsBehind).toBe(5); // 12 - 7
    expect(result[0].manifestPaths?.sort()).toEqual([
      "client/package.json",
      "component/package.json",
    ]);
  });

  it("emits separate candidates for different packages in the same repo", () => {
    const cache = makeCache([
      makeRepo("multi-pkg", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-button": "^7.0.0",
          "@aurodesignsystem/auro-icon": "^5.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-button", resolved("12.0.0")],
      ["@aurodesignsystem/auro-icon", resolved("9.0.0")],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.package).sort()).toEqual([
      "@aurodesignsystem/auro-button",
      "@aurodesignsystem/auro-icon",
    ]);
  });

  it("skips packages in the archived set", () => {
    const cache = makeCache([
      makeRepo("with-archived", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-deprecated": "^1.0.0",
          "@aurodesignsystem/auro-button": "^7.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-button", resolved("12.0.0")],
    ]);
    const archived = new Set(["@aurodesignsystem/auro-deprecated"]);

    const result = collapseCandidatesByPackage(cache, archived, latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].package).toBe("@aurodesignsystem/auro-button");
  });

  it("skips repos in error or archived state", () => {
    const errored = makeRepo("errored", {
      "package.json": makeScan("package.json", {
        "@aurodesignsystem/auro-button": "^7.0.0",
      }),
    });
    errored.error = "no-manifests-fetched";
    const archived = makeRepo("archived-repo", {
      "package.json": makeScan("package.json", {
        "@aurodesignsystem/auro-button": "^7.0.0",
      }),
    });
    archived.archived = true;
    const ok = makeRepo("ok-repo", {
      "package.json": makeScan("package.json", {
        "@aurodesignsystem/auro-button": "^7.0.0",
      }),
    });
    const cache = makeCache([errored, archived, ok]);
    const latest = new Map([
      ["@aurodesignsystem/auro-button", resolved("12.0.0")],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].repo).toBe("ok-repo");
  });

  it("skips packages with no npm resolution or with majorsBehind < 1", () => {
    const cache = makeCache([
      makeRepo("partial-coverage", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-unresolved": "^1.0.0",
          "@aurodesignsystem/auro-current": "^12.0.0",
          "@aurodesignsystem/auro-behind": "^7.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      // unresolved: no entry → skipped
      ["@aurodesignsystem/auro-current", resolved("12.3.2")], // same major
      ["@aurodesignsystem/auro-behind", resolved("12.0.0")],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].package).toBe("@aurodesignsystem/auro-behind");
  });

  it("sets targetPackage when the npm resolver returned a cross-scope alias", () => {
    // @alaskaairux/auro-button is in the catalog with replacedBy →
    // collapseCandidatesByPackage will use the successor's resolved version
    // as the upgrade target, so both packages must be in the latest map.
    const cache = makeCache([
      makeRepo("legacy-scope", {
        "package.json": makeScan("package.json", {
          "@alaskaairux/auro-button": "^4.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      [
        "@alaskaairux/auro-button",
        resolved("12.3.2", "@aurodesignsystem/auro-button"),
      ],
      ["@aurodesignsystem/auro-button", resolved("12.3.2")],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].package).toBe("@alaskaairux/auro-button");
    expect(result[0].targetPackage).toBe("@aurodesignsystem/auro-button");
  });
});

describe("collapseCandidatesByPackage — compliance status wiring", () => {
  const org = "Alaska-ECommerce";

  it("attaches status='Behind' with a npm-latest reason for uncataloged-and-behind packages", () => {
    // @aurodesignsystem/auro-button is intentionally NOT seeded — its
    // candidates should still ship as Behind, not Unknown.
    const cache = makeCache([
      makeRepo("uncatalogued", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-button": "^7.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-button", resolved("12.3.2")],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("Behind");
    expect(result[0].statusReason).toMatch(/behind npm latest \(12\.3\.2\)/);
    expect(result[0].notes).toBeUndefined();
  });

  it("attaches status='Unsupported' for cataloged formkit-successor packages and points at the successor", () => {
    // @aurodesignsystem/auro-checkbox carries replacedBy in the seed list
    // → Unsupported, and the ticket targets the successor (auro-formkit),
    // not the deprecated package's own latest.
    const cache = makeCache([
      makeRepo("formkit-consumer", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-checkbox": "^3.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-checkbox", resolved("4.1.4")],
      ["@aurodesignsystem/auro-formkit", resolved("4.0.0")],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("Unsupported");
    expect(result[0].statusReason).toMatch(
      /Migrate to @aurodesignsystem\/auro-formkit/,
    );
    expect(result[0].targetPackage).toBe("@aurodesignsystem/auro-formkit");
    // The upgrade target is the successor's version, not auro-checkbox's own
    // latest — pointing consumers at the deprecated package's 4.1.4 would
    // be telling them to "upgrade" to a still-deprecated version.
    expect(result[0].latest).toBe("4.0.0");
  });

  it("attaches status='Unsupported' for legacy @alaskaairux/* retirements", () => {
    const cache = makeCache([
      makeRepo("legacy", {
        "package.json": makeScan("package.json", {
          "@alaskaairux/auro-button": "^4.0.0",
        }),
      }),
    ]);
    const latest = new Map([
      [
        "@alaskaairux/auro-button",
        resolved("12.0.0", "@aurodesignsystem/auro-button"),
      ],
      ["@aurodesignsystem/auro-button", resolved("12.0.0")],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("Unsupported");
    expect(result[0].statusReason).toMatch(
      /Migrate to @aurodesignsystem\/auro-button/,
    );
    // Cross-scope alias still resolves to the new namespace as the upgrade target.
    expect(result[0].targetPackage).toBe("@aurodesignsystem/auro-button");
  });

  it("keeps archived packages with replacedBy in the candidate set (deprecation tickets stay actionable)", () => {
    // auro-checkbox is BOTH in the archived-Auro-repos set AND in the
    // policy catalog with replacedBy. The catalog wins — without this,
    // the 73 manifests across Alaska-ECommerce that still declare the
    // deprecated formkit-standalone packages would silently never ticket.
    const cache = makeCache([
      makeRepo("formkit-consumer", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-checkbox": "^3.0.0",
        }),
      }),
    ]);
    const archived = new Set([
      "@aurodesignsystem/auro-checkbox",
      "@alaskaairux/auro-checkbox",
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-checkbox", resolved("4.1.4")],
      ["@aurodesignsystem/auro-formkit", resolved("4.0.0")],
    ]);

    const result = collapseCandidatesByPackage(cache, archived, latest, org);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("Unsupported");
    expect(result[0].targetPackage).toBe("@aurodesignsystem/auro-formkit");
  });

  it("still drops archived packages that have NO catalog deprecation pointer", () => {
    // The archived filter is only deferred for catalog entries with
    // replacedBy. Archived without a successor stays skipped — the bot
    // has nothing useful to recommend.
    const cache = makeCache([
      makeRepo("ghost-dep", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-orphan": "^1.0.0",
        }),
      }),
    ]);
    const archived = new Set(["@aurodesignsystem/auro-orphan"]);
    const latest = new Map<string, ResolvedLatest>();

    const result = collapseCandidatesByPackage(cache, archived, latest, org);

    expect(result).toHaveLength(0);
  });

  it("does NOT emit candidates for uncataloged packages already at the latest major", () => {
    // mb < 1 with no policy → status='Current' → skipped.
    const cache = makeCache([
      makeRepo("current", {
        "package.json": makeScan("package.json", {
          "@aurodesignsystem/auro-icon": "^9.1.0",
        }),
      }),
    ]);
    const latest = new Map([
      ["@aurodesignsystem/auro-icon", resolved("9.3.0")],
    ]);

    const result = collapseCandidatesByPackage(cache, new Set(), latest, org);

    expect(result).toHaveLength(0);
  });
});
