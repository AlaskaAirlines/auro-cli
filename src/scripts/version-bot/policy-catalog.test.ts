import { describe, expect, it } from "vitest";
import { findPackagePolicy, PACKAGE_POLICY_CATALOG } from "./policy-catalog.ts";

describe("PACKAGE_POLICY_CATALOG", () => {
  it("contains exactly the seeded standing-deprecation entries (9 formkit + 3 legacy scope)", () => {
    expect(PACKAGE_POLICY_CATALOG).toHaveLength(12);
  });

  it("every formkit successor entry points to @aurodesignsystem/auro-formkit", () => {
    const formkitSeeds = PACKAGE_POLICY_CATALOG.filter((r) =>
      r.packageName.startsWith("@aurodesignsystem/"),
    );
    expect(formkitSeeds).toHaveLength(9);
    for (const r of formkitSeeds) {
      expect(r.replacedBy).toBe("@aurodesignsystem/auro-formkit");
    }
  });

  it("every @alaskaairux entry points to a corresponding @aurodesignsystem successor", () => {
    const legacySeeds = PACKAGE_POLICY_CATALOG.filter((r) =>
      r.packageName.startsWith("@alaskaairux/"),
    );
    expect(legacySeeds).toHaveLength(3);
    for (const r of legacySeeds) {
      const shortName = r.packageName.replace("@alaskaairux/", "");
      expect(r.replacedBy).toBe(`@aurodesignsystem/${shortName}`);
    }
  });

  it("does NOT seed @alaskaairux/icons (canonical legacy, no successor)", () => {
    expect(findPackagePolicy("@alaskaairux/icons")).toBeUndefined();
  });

  it("does NOT seed @aurodesignsystem/auro-counter (pending confirmation)", () => {
    expect(findPackagePolicy("@aurodesignsystem/auro-counter")).toBeUndefined();
  });

  it("leaves targetVersion, minimumVersion, and notes unset on every seed (incident knobs)", () => {
    for (const r of PACKAGE_POLICY_CATALOG) {
      expect(r.targetVersion).toBeUndefined();
      expect(r.minimumVersion).toBeUndefined();
      expect(r.notes).toBeUndefined();
    }
  });

  it("has no duplicate packageName entries", () => {
    const names = PACKAGE_POLICY_CATALOG.map((r) => r.packageName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("findPackagePolicy", () => {
  it("returns the policy record for a seeded package", () => {
    const result = findPackagePolicy("@aurodesignsystem/auro-checkbox");
    expect(result).toBeDefined();
    expect(result?.replacedBy).toBe("@aurodesignsystem/auro-formkit");
  });

  it("returns undefined for an unseeded package", () => {
    expect(findPackagePolicy("@aurodesignsystem/auro-button")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(findPackagePolicy("")).toBeUndefined();
  });
});
