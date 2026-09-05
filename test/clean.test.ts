import assert from "node:assert/strict";
import { test } from "node:test";
import { clean } from "../src/utils/cem.ts";

test("clean collapses internal whitespace and newlines to single spaces", () => {
  assert.equal(clean("a   b\n\tc"), "a b c");
});

test("clean trims leading and trailing whitespace", () => {
  assert.equal(clean("  padded  "), "padded");
});

test("clean maps undefined to an empty string", () => {
  assert.equal(clean(undefined), "");
});

test("clean leaves an already-clean string unchanged", () => {
  assert.equal(clean("already clean"), "already clean");
});
