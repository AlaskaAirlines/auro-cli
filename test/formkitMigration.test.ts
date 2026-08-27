import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FORMKIT_PACKAGE,
  formkitSubpathFor,
  formkitTagFor,
  isLegacyFormkitPackage,
  LEGACY_FORMKIT_PACKAGES,
} from "../src/static/formkitMigration.ts";

test("LEGACY_FORMKIT_PACKAGES lists the nine form components and excludes auro-button", () => {
  assert.equal(LEGACY_FORMKIT_PACKAGES.length, 9);
  const expected = [
    "input",
    "select",
    "combobox",
    "menu",
    "checkbox",
    "radio",
    "datepicker",
    "dropdown",
    "form",
  ].map((base) => `@aurodesignsystem/auro-${base}`);
  assert.deepEqual([...LEGACY_FORMKIT_PACKAGES].sort(), [...expected].sort());
  assert.ok(
    !LEGACY_FORMKIT_PACKAGES.includes("@aurodesignsystem/auro-button"),
    "auro-button is a true standalone, never in formkit",
  );
});

test("isLegacyFormkitPackage flags legacy standalones only", () => {
  assert.ok(isLegacyFormkitPackage("@aurodesignsystem/auro-input"));
  assert.ok(isLegacyFormkitPackage("@aurodesignsystem/auro-form"));
  assert.ok(!isLegacyFormkitPackage("@aurodesignsystem/auro-button"));
  assert.ok(!isLegacyFormkitPackage(FORMKIT_PACKAGE));
  assert.ok(!isLegacyFormkitPackage("@aurodesignsystem/auro-icon"));
});

test("formkitTagFor and formkitSubpathFor derive the formkit target", () => {
  assert.equal(formkitTagFor("@aurodesignsystem/auro-input"), "auro-input");
  assert.equal(
    formkitSubpathFor("@aurodesignsystem/auro-input"),
    "@aurodesignsystem/auro-formkit/auro-input",
  );
  assert.equal(
    formkitSubpathFor("@aurodesignsystem/auro-datepicker"),
    "@aurodesignsystem/auro-formkit/auro-datepicker",
  );
});
