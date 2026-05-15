import { describe, expect, it } from "vitest";
import { evaluatePackage } from "./evaluate.ts";
import type { PackagePolicyRecord } from "./policy-catalog.ts";

const PKG = "@aurodesignsystem/auro-button";

describe("evaluatePackage — status branches", () => {
  it("returns 'Not used' when detected=false", () => {
    const result = evaluatePackage(
      { packageName: PKG, detected: false },
      undefined,
    );
    expect(result.status).toBe("Not used");
    expect(result.reason).toMatch(/No evidence/);
  });

  it("returns 'Unknown' when detected but no policy record", () => {
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "11.0.0" },
      undefined,
    );
    expect(result.status).toBe("Unknown");
    expect(result.reason).toMatch(/No policy record/);
  });

  it("returns 'Unsupported' when policy has replacedBy (deprecation pointer)", () => {
    const policy: PackagePolicyRecord = {
      packageName: PKG,
      replacedBy: "@aurodesignsystem/auro-formkit",
    };
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "4.0.0" },
      policy,
    );
    expect(result.status).toBe("Unsupported");
    expect(result.reason).toMatch(/Migrate to @aurodesignsystem\/auro-formkit/);
  });

  it("returns 'Review needed' when hasDeprecatedApiUsage=true and no replacedBy", () => {
    const policy: PackagePolicyRecord = { packageName: PKG };
    const result = evaluatePackage(
      {
        packageName: PKG,
        detected: true,
        declaredVersion: "11.0.0",
        hasDeprecatedApiUsage: true,
      },
      policy,
    );
    expect(result.status).toBe("Review needed");
    expect(result.reason).toMatch(/Deprecated API usage/);
  });

  it("returns 'Unknown' when declaredVersion is missing", () => {
    const policy: PackagePolicyRecord = { packageName: PKG };
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: null },
      policy,
    );
    expect(result.status).toBe("Unknown");
    expect(result.reason).toMatch(/no version could be determined/);
  });

  it("returns 'Unknown' when declaredVersion is unparseable", () => {
    const policy: PackagePolicyRecord = { packageName: PKG };
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "main" },
      policy,
    );
    expect(result.status).toBe("Unknown");
    expect(result.reason).toMatch(/Could not parse declared version "main"/);
  });

  it("returns 'Unsupported' when declared version is below minimumVersion", () => {
    const policy: PackagePolicyRecord = {
      packageName: PKG,
      minimumVersion: "7.0.0",
      targetVersion: "12.0.0",
    };
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "6.4.0" },
      policy,
    );
    expect(result.status).toBe("Unsupported");
    expect(result.reason).toMatch(
      /below the minimum supported version 7\.0\.0/,
    );
  });

  it("returns 'Behind' when declared version is below targetVersion", () => {
    const policy: PackagePolicyRecord = {
      packageName: PKG,
      targetVersion: "12.0.0",
    };
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "10.5.0" },
      policy,
    );
    expect(result.status).toBe("Behind");
    expect(result.reason).toMatch(/behind the target version 12\.0\.0/);
  });

  it("returns 'Current' when declared version meets or exceeds targetVersion", () => {
    const policy: PackagePolicyRecord = {
      packageName: PKG,
      targetVersion: "12.0.0",
    };
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "12.3.2" },
      policy,
    );
    expect(result.status).toBe("Current");
    expect(result.reason).toMatch(
      /meets or exceeds the target version 12\.0\.0/,
    );
  });

  it("returns 'Current' when policy has no targetVersion and no other gate triggers", () => {
    const policy: PackagePolicyRecord = { packageName: PKG };
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "10.0.0" },
      policy,
    );
    expect(result.status).toBe("Current");
    expect(result.reason).toMatch(/meets or exceeds the target version/);
  });
});

describe("evaluatePackage — version parsing", () => {
  it("tolerates a ^ range prefix on declaredVersion", () => {
    const policy: PackagePolicyRecord = {
      packageName: PKG,
      targetVersion: "12.0.0",
    };
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "^10.5.0" },
      policy,
    );
    expect(result.status).toBe("Behind");
  });

  it("tolerates a ~ range prefix on declaredVersion", () => {
    const policy: PackagePolicyRecord = {
      packageName: PKG,
      targetVersion: "12.0.0",
    };
    const result = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "~12.1.0" },
      policy,
    );
    expect(result.status).toBe("Current");
  });

  it("compares versions by precedence across major/minor/patch", () => {
    // 11.10.0 > 11.9.99 (numeric, not lexicographic)
    const policy: PackagePolicyRecord = {
      packageName: PKG,
      targetVersion: "11.10.0",
    };
    const ahead = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "11.9.99" },
      policy,
    );
    expect(ahead.status).toBe("Behind");
    const equal = evaluatePackage(
      { packageName: PKG, detected: true, declaredVersion: "11.10.0" },
      policy,
    );
    expect(equal.status).toBe("Current");
  });
});
