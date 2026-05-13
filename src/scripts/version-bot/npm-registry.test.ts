import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareSemver,
  majorsBehind,
  npmLatest,
  parseSemver,
  resolveLatestAcrossAliases,
} from "./npm-registry.ts";

describe("parseSemver", () => {
  it("parses a plain semver triple", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("ignores npm range prefixes", () => {
    // package.json frequently pins as ^1.2.3 or ~1.2.3 — the resolver
    // and majors-behind math care about the underlying triple, not the
    // range operator.
    expect(parseSemver("^1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("~2.5.0")).toEqual({ major: 2, minor: 5, patch: 0 });
    expect(parseSemver(">=4.0.0")).toEqual({ major: 4, minor: 0, patch: 0 });
  });

  it("returns null for unparseable inputs", () => {
    expect(parseSemver(null)).toBeNull();
    expect(parseSemver(undefined)).toBeNull();
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
  });

  it("parses prerelease tags but only takes the numeric triple", () => {
    expect(parseSemver("11.5.1-beta.2")).toEqual({
      major: 11,
      minor: 5,
      patch: 1,
    });
  });
});

describe("majorsBehind", () => {
  it("computes the major delta", () => {
    expect(majorsBehind("4.0.0", "11.5.1")).toBe(7);
    expect(majorsBehind("10.0.0", "11.5.1")).toBe(1);
  });

  it("returns 0 when pinned and latest share a major", () => {
    expect(majorsBehind("11.0.0", "11.5.1")).toBe(0);
  });

  it("clamps negative deltas to 0 (consumer ahead of npm)", () => {
    expect(majorsBehind("12.0.0", "11.5.1")).toBe(0);
  });

  it("returns 0 when either side is unparseable", () => {
    expect(majorsBehind("not-a-version", "11.5.1")).toBe(0);
    expect(majorsBehind("11.0.0", null)).toBe(0);
  });
});

describe("compareSemver", () => {
  it("returns -1, 0, 1 in standard sort order", () => {
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    expect(compareSemver("2.0.0", "1.0.0")).toBe(1);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  it("compares minor and patch when majors match", () => {
    expect(compareSemver("1.2.3", "1.5.0")).toBe(-1);
    expect(compareSemver("1.5.0", "1.5.1")).toBe(-1);
  });

  it("returns null when either side is unparseable", () => {
    expect(compareSemver(null, "1.0.0")).toBeNull();
    expect(compareSemver("1.0.0", "garbage")).toBeNull();
  });
});

describe("npmLatest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the version field from the npm registry response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ version: "12.3.2" }),
      })),
    );
    await expect(npmLatest("@aurodesignsystem/auro-button")).resolves.toBe(
      "12.3.2",
    );
  });

  it("returns null on HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    await expect(npmLatest("@aurodesignsystem/does-not-exist")).resolves.toBe(
      null,
    );
  });

  it("returns null on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(npmLatest("@aurodesignsystem/auro-button")).resolves.toBe(
      null,
    );
  });
});

describe("resolveLatestAcrossAliases", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(versionsByPkg: Record<string, string | null>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const decoded = decodeURIComponent(url);
        const match = decoded.match(/registry\.npmjs\.org\/([^/]+(?:\/[^/]+)?)/);
        if (!match) return { ok: false, json: async () => ({}) };
        const pkg = match[1];
        const version = versionsByPkg[pkg];
        if (version === null || version === undefined) {
          return { ok: false, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({ version }) };
      }),
    );
  }

  it("returns direct lookup when the package has no alias", async () => {
    mockFetch({ "@aurodesignsystem/auro-button": "12.3.2" });
    const result = await resolveLatestAcrossAliases(
      "@aurodesignsystem/auro-button",
    );
    expect(result).toEqual({
      resolvedPackage: "@aurodesignsystem/auro-button",
      version: "12.3.2",
    });
  });

  it("returns the aliased version when it is higher than the direct", async () => {
    // Common case: consumer pinned on @alaskaairux/auro-button@4.x. The
    // direct lookup returns the last legacy-scope version (e.g. 4.5.1);
    // the aliased lookup returns the modern-scope (12.3.2). The bot
    // should surface 12.3.2 as the upgrade target.
    mockFetch({
      "@alaskaairux/auro-button": "4.5.1",
      "@aurodesignsystem/auro-button": "12.3.2",
    });
    const result = await resolveLatestAcrossAliases(
      "@alaskaairux/auro-button",
    );
    expect(result).toEqual({
      resolvedPackage: "@aurodesignsystem/auro-button",
      version: "12.3.2",
    });
  });

  it("falls back to the direct version when the alias 404s", async () => {
    mockFetch({
      "@alaskaairux/auro-button": "4.5.1",
      "@aurodesignsystem/auro-button": null,
    });
    const result = await resolveLatestAcrossAliases(
      "@alaskaairux/auro-button",
    );
    expect(result).toEqual({
      resolvedPackage: "@alaskaairux/auro-button",
      version: "4.5.1",
    });
  });

  it("falls back to the alias when the direct lookup 404s", async () => {
    mockFetch({
      "@alaskaairux/auro-button": null,
      "@aurodesignsystem/auro-button": "12.3.2",
    });
    const result = await resolveLatestAcrossAliases(
      "@alaskaairux/auro-button",
    );
    expect(result).toEqual({
      resolvedPackage: "@aurodesignsystem/auro-button",
      version: "12.3.2",
    });
  });

  it("returns null when both lookups fail", async () => {
    mockFetch({});
    const result = await resolveLatestAcrossAliases(
      "@alaskaairux/auro-button",
    );
    expect(result).toEqual({
      resolvedPackage: "@alaskaairux/auro-button",
      version: null,
    });
  });
});
