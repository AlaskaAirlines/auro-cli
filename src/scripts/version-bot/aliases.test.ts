import { describe, expect, it } from "vitest";
import { aliasFor, PACKAGE_ALIASES } from "./aliases.ts";

describe("aliasFor", () => {
  it("returns the @aurodesignsystem successor for known legacy packages", () => {
    expect(aliasFor("@alaskaairux/auro-button")).toBe(
      "@aurodesignsystem/auro-button",
    );
    expect(aliasFor("@alaskaairux/auro-icon")).toBe(
      "@aurodesignsystem/auro-icon",
    );
    expect(aliasFor("@alaskaairux/auro-popover")).toBe(
      "@aurodesignsystem/auro-popover",
    );
  });

  it("returns null for packages without a known alias", () => {
    // Deliberately not in the map: there is no @aurodesignsystem/icons on
    // npm — the @alaskaairux name is canonical.
    expect(aliasFor("@alaskaairux/icons")).toBeNull();
    // Already-migrated packages don't need a reverse alias.
    expect(aliasFor("@aurodesignsystem/auro-button")).toBeNull();
    // Non-Auro packages.
    expect(aliasFor("react")).toBeNull();
    expect(aliasFor("@types/node")).toBeNull();
  });
});

describe("PACKAGE_ALIASES", () => {
  it("only maps @alaskaairux/* to @aurodesignsystem/*", () => {
    for (const [legacy, modern] of Object.entries(PACKAGE_ALIASES)) {
      expect(legacy.startsWith("@alaskaairux/")).toBe(true);
      expect(modern.startsWith("@aurodesignsystem/")).toBe(true);
    }
  });

  it("preserves the package short name across the scope swap", () => {
    // The migration was a re-publish under a new scope, not a rename.
    // If a future entry breaks this rule, double-check it on npm before
    // adding it to the map.
    for (const [legacy, modern] of Object.entries(PACKAGE_ALIASES)) {
      const legacyShort = legacy.replace(/^@[^/]+\//, "");
      const modernShort = modern.replace(/^@[^/]+\//, "");
      expect(modernShort).toBe(legacyShort);
    }
  });
});
