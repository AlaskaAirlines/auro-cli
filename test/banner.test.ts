import assert from "node:assert/strict";
import { test } from "node:test";
import { renderWarningBanner } from "../src/utils/banner.ts";

test("renderWarningBanner returns an empty string for no messages", () => {
  assert.equal(renderWarningBanner("heading", []), "");
});

test("renderWarningBanner boxes the heading and bullets each message", () => {
  const banner = renderWarningBanner("Heads up", ["first note", "second note"]);
  // Top and bottom border rule present, heading between them.
  assert.match(banner, /┌─+┐/u);
  assert.match(banner, /└─+┘/u);
  assert.match(banner, /Heads up/u);
  // Each message is bulleted.
  assert.match(banner, /•\s+first note/u);
  assert.match(banner, /•\s+second note/u);
});

test("renderWarningBanner word-wraps a long message onto indented continuation lines", () => {
  const long = `${"word ".repeat(40)}tail`.trim();
  const banner = renderWarningBanner("Heading", [long]);
  const lines = banner.split("\n");
  // No single content line exceeds a sane terminal width (borders aside).
  const contentLines = lines.filter(
    (l) => !/[┌└]/u.test(l) && l.includes("wo"),
  );
  assert.ok(contentLines.length > 1, "the long message spans multiple lines");
  for (const line of contentLines) {
    assert.ok(line.length <= 90, `line stays bounded: ${line.length}`);
  }
});

test("renderWarningBanner keeps a copy-pasteable token intact across the wrap", () => {
  const message = `${"filler ".repeat(20)}AuroButton.register('myapp-button')`;
  const banner = renderWarningBanner("Heading", [message]);
  // Breaking only on whitespace means the register() call is never split.
  assert.match(banner, /AuroButton\.register\('myapp-button'\)/u);
});
