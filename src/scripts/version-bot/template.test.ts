import { describe, expect, it } from "vitest";
import type { BreakingChange, ChangelogSlice } from "./changelog.ts";
import {
  buildAcceptanceCriteria,
  buildStoryBody,
  buildStoryTitle,
} from "./template.ts";
import type { UpgradeCandidate } from "./types.ts";

function makeCandidate(
  overrides: Partial<UpgradeCandidate> = {},
): UpgradeCandidate {
  return {
    repo: "fixture-repo",
    package: "@aurodesignsystem/auro-button",
    pinned: "10.0.0",
    latest: "11.5.1",
    majorsBehind: 1,
    repoUrl: "https://github.com/Alaska-ECommerce/fixture-repo",
    ...overrides,
  };
}

describe("buildStoryTitle", () => {
  it("uses singular 'major' for 1 major behind", () => {
    const title = buildStoryTitle(makeCandidate({ majorsBehind: 1 }));
    expect(title).toMatch(/1 major behind/);
    expect(title).not.toMatch(/majors behind/);
  });

  it("uses plural 'majors' for >1", () => {
    const title = buildStoryTitle(makeCandidate({ majorsBehind: 7 }));
    expect(title).toMatch(/7 majors behind/);
  });

  it("embeds the package, repo, and version delta in the bot's canonical format", () => {
    // The dedupe gate parses this format with parseLatestFromTitle —
    // changing it would silently break dedupe against existing tickets.
    const title = buildStoryTitle(
      makeCandidate({
        package: "@aurodesignsystem/auro-button",
        repo: "Web-AccountOverview",
        pinned: "10.0.0",
        latest: "11.5.1",
        majorsBehind: 1,
      }),
    );
    expect(title).toBe(
      "Upgrade @aurodesignsystem/auro-button in Web-AccountOverview (10.0.0 -> 11.5.1, 1 major behind)",
    );
  });
});

describe("buildAcceptanceCriteria — same-namespace path", () => {
  it("starts with the generic verification bullets", () => {
    const ac = buildAcceptanceCriteria(makeCandidate());
    expect(ac).toMatch(/<li>Update <code>@aurodesignsystem\/auro-button<\/code> to <code>11\.5\.1<\/code>/);
    expect(ac).toMatch(/npm ci/);
    expect(ac).toMatch(/Build \/ TypeScript compile passes/);
    expect(ac).toMatch(/Lint passes/);
    expect(ac).toMatch(/Existing test suite passes/);
    expect(ac).toMatch(/Manual smoke check/);
  });

  it("appends a single summary bullet when breaking changes exist", () => {
    const breakingChanges: BreakingChange[] = [
      { version: "11.0.0", text: "Remove `legacy-mode` prop" },
      { version: "11.2.0", text: "Rename `onClick` to `onPress`" },
    ];
    const ac = buildAcceptanceCriteria(makeCandidate(), breakingChanges);
    expect(ac).toMatch(
      /Verify each of the 2 breaking changes listed in the "Breaking changes in this upgrade" section/,
    );
    // The per-item details should NOT be duplicated into the AC — they
    // live in the body's breaking-changes section.
    expect(ac).not.toMatch(/Verify the breaking change introduced in/);
    expect(ac).not.toMatch(/legacy-mode/);
    expect(ac).not.toMatch(/onPress/);
  });

  it("uses singular wording when only 1 breaking change", () => {
    const ac = buildAcceptanceCriteria(makeCandidate(), [
      { version: "11.0.0", text: "Remove `legacy-mode` prop" },
    ]);
    expect(ac).toMatch(/Verify each of the 1 breaking change /);
    expect(ac).not.toMatch(/1 breaking changes/);
  });

  it("omits the breaking-changes summary bullet when there are none", () => {
    const ac = buildAcceptanceCriteria(makeCandidate(), []);
    expect(ac).not.toMatch(/breaking change/i);
  });
});

describe("buildAcceptanceCriteria — cross-namespace path", () => {
  it("rewrites the first bullet to call out package replacement and import-path updates", () => {
    const candidate = makeCandidate({
      package: "@alaskaairux/auro-button",
      targetPackage: "@aurodesignsystem/auro-button",
      pinned: "4.0.0",
      latest: "12.3.2",
      majorsBehind: 8,
    });
    const ac = buildAcceptanceCriteria(candidate);
    expect(ac).toMatch(
      /Replace <code>@alaskaairux\/auro-button<\/code> with <code>@aurodesignsystem\/auro-button@12\.3\.2<\/code>/,
    );
    expect(ac).toMatch(/Update all import paths from <code>@alaskaairux\/auro-button<\/code> to <code>@aurodesignsystem\/auro-button<\/code>/);
    // Same-namespace wording must NOT appear.
    expect(ac).not.toMatch(/Update <code>@alaskaairux\/auro-button<\/code> to/);
  });

  it("references the target package name in the smoke-check bullet", () => {
    const candidate = makeCandidate({
      package: "@alaskaairux/auro-button",
      targetPackage: "@aurodesignsystem/auro-button",
    });
    const ac = buildAcceptanceCriteria(candidate);
    // By smoke-test time the code uses the new name, so the bullet
    // points there. The legacy name should NOT appear in the smoke
    // bullet — that's the whole point of the rename.
    const smokeLine = ac
      .split("\n")
      .find((line) => line.includes("Manual smoke check"));
    expect(smokeLine).toBeDefined();
    expect(smokeLine).toMatch(/@aurodesignsystem\/auro-button/);
    expect(smokeLine).not.toMatch(/@alaskaairux\/auro-button/);
  });
});

describe("buildStoryBody — Context section", () => {
  it("describes the version delta and includes the consumer repo link", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/<h3>Context<\/h3>/);
    expect(body).toMatch(/<code>@aurodesignsystem\/auro-button@10\.0\.0<\/code>/);
    expect(body).toMatch(
      /href="https:\/\/github\.com\/Alaska-ECommerce\/fixture-repo"/,
    );
    expect(body).toMatch(/1 major version behind/);
  });

  it("includes the namespace-rename callout when targetPackage is set", () => {
    const body = buildStoryBody({
      candidate: makeCandidate({
        package: "@alaskaairux/auro-button",
        targetPackage: "@aurodesignsystem/auro-button",
      }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/⚠ Namespace rename/);
    expect(body).toMatch(/<code>@aurodesignsystem\/auro-button<\/code>/);
    expect(body).toMatch(/renaming the dependency/);
  });

  it("omits the namespace-rename callout for same-namespace upgrades", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).not.toMatch(/Namespace rename/);
  });

  it("includes a supersedes note when the field is set", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
      supersedes: 12345,
    });
    expect(body).toMatch(/supersedes work item #12345/);
  });
});

describe("buildStoryBody — migration section", () => {
  it("falls back to link-only when changelogSlice is null", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/See the <a href="https:\/\/example\/CHANGELOG\.md">CHANGELOG/);
    // Should NOT have the "Changes in <pkg> between" header used for inlined slices.
    expect(body).not.toMatch(/Changes in <b>/);
  });

  it("inlines the slice HTML when changelogSlice is provided", () => {
    const slice: ChangelogSlice = {
      versions: [],
      html: "<h5>11.5.1</h5><ul><li>Fix a bug</li></ul>",
    };
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: slice,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toContain("<h5>11.5.1</h5><ul><li>Fix a bug</li></ul>");
    expect(body).toMatch(/Changes in <b>@aurodesignsystem\/auro-button<\/b>/);
  });
});

describe("buildStoryBody — Breaking changes section", () => {
  it("is omitted entirely when changelogSlice is null", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).not.toMatch(/Breaking changes in this upgrade/);
  });

  it("renders 'No breaking changes detected' when slice exists but is empty", () => {
    const slice: ChangelogSlice = {
      versions: [],
      html: "<p>release notes</p>",
    };
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: slice,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/Breaking changes in this upgrade/);
    expect(body).toMatch(/No breaking changes detected/);
  });

  it("renders one bullet per breaking change when the slice has them", () => {
    const slice: ChangelogSlice = {
      versions: [],
      html: "<p>release notes</p>",
    };
    const breakingChanges: BreakingChange[] = [
      { version: "11.0.0", text: "drop IE11 support" },
      { version: "11.4.0", text: "rename `theme` to `appearance`" },
    ];
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: slice,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges,
    });
    expect(body).toMatch(/Breaking changes in this upgrade/);
    expect(body).toMatch(/<b>11\.0\.0:<\/b> drop IE11 support/);
    expect(body).toMatch(
      /<b>11\.4\.0:<\/b> rename <code>theme<\/code> to <code>appearance<\/code>/,
    );
  });
});
