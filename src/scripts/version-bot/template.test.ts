import { describe, expect, it } from "vitest";
import type { BreakingChange, ChangelogSlice } from "./changelog.ts";
import {
  buildAcceptanceCriteria,
  buildStoryBody,
  buildStoryTitle,
} from "./template.ts";
import type { UpgradeCandidate } from "./types.ts";
import type { UsageInventory } from "./usage-inventory.ts";

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

  it("uses the deprecation-replacement format when status=Unsupported and targetPackage is set", () => {
    // "(deprecated)" sits flush against the OLD package so it can only
    // modify that one — putting it at the end of the title would read as
    // if the successor were unsupported.
    const title = buildStoryTitle(
      makeCandidate({
        package: "@aurodesignsystem/auro-checkbox",
        targetPackage: "@aurodesignsystem/auro-formkit",
        repo: "LoungeMembership-Web",
        pinned: "3.0.0",
        latest: "4.0.0",
        majorsBehind: 0,
        status: "Unsupported",
        statusReason:
          "This package is deprecated. Migrate to @aurodesignsystem/auro-formkit.",
      }),
    );
    expect(title).toBe(
      "Replace @aurodesignsystem/auro-checkbox@3.0.0 (deprecated) with @aurodesignsystem/auro-formkit@4.0.0 in LoungeMembership-Web",
    );
  });

  it("falls back to the upgrade format when status=Unsupported but targetPackage is missing", () => {
    // Edge case: catalog has replacedBy but the successor's npm latest
    // couldn't resolve at scan time — scan.ts would normally drop the
    // candidate, but if one gets through, we still want a coherent title.
    const title = buildStoryTitle(
      makeCandidate({
        package: "@alaskaairux/old-thing",
        repo: "demo-repo",
        pinned: "1.0.0",
        latest: "2.0.0",
        majorsBehind: 1,
        status: "Unsupported",
      }),
    );
    expect(title).toMatch(/^Upgrade @alaskaairux\/old-thing in demo-repo/);
  });
});

describe("buildAcceptanceCriteria — same-namespace path", () => {
  it("starts with the generic verification bullets", () => {
    const ac = buildAcceptanceCriteria(makeCandidate());
    expect(ac).toMatch(
      /<li>Update <code>@aurodesignsystem\/auro-button<\/code> to <code>11\.5\.1<\/code>/,
    );
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
    expect(ac).toMatch(
      /Update all import paths from <code>@alaskaairux\/auro-button<\/code> to <code>@aurodesignsystem\/auro-button<\/code>/,
    );
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

describe("deprecation rewrites (status=Unsupported with successor target)", () => {
  function makeDeprecationCandidate(
    overrides: Partial<UpgradeCandidate> = {},
  ): UpgradeCandidate {
    return makeCandidate({
      package: "@aurodesignsystem/auro-checkbox",
      targetPackage: "@aurodesignsystem/auro-formkit",
      pinned: "3.0.0",
      latest: "4.0.0",
      majorsBehind: 0,
      status: "Unsupported",
      statusReason:
        "This package is deprecated. Migrate to @aurodesignsystem/auro-formkit.",
      ...overrides,
    });
  }

  it("AC first bullet calls the migration out as a real rewrite, not a drop-in swap", () => {
    const ac = buildAcceptanceCriteria(makeDeprecationCandidate());
    expect(ac).toMatch(
      /Migrate from <code>@aurodesignsystem\/auro-checkbox<\/code> to <code>@aurodesignsystem\/auro-formkit@4\.0\.0<\/code>/,
    );
    expect(ac).toMatch(/This is a code migration, not a drop-in replacement/);
    // Scope-rename wording must NOT appear — different short-names.
    expect(ac).not.toMatch(/Update all import paths from/);
  });

  it("AC keeps the existing scope-rename wording when the package short-name is identical", () => {
    // @alaskaairux/auro-button → @aurodesignsystem/auro-button is a scope
    // swap on the SAME component, not a rewrite. AC reflects that.
    const ac = buildAcceptanceCriteria(
      makeCandidate({
        package: "@alaskaairux/auro-button",
        targetPackage: "@aurodesignsystem/auro-button",
        pinned: "4.0.0",
        latest: "12.3.2",
        status: "Unsupported",
        statusReason:
          "This package is deprecated. Migrate to @aurodesignsystem/auro-button.",
      }),
    );
    expect(ac).toMatch(/Replace <code>@alaskaairux\/auro-button<\/code> with/);
    expect(ac).toMatch(/Update all import paths from/);
    expect(ac).not.toMatch(/code migration, not a drop-in/);
  });

  it("body Context section frames the deprecation as a code migration, not a version bump", () => {
    const body = buildStoryBody({
      candidate: makeDeprecationCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/deprecated and replaced/);
    expect(body).toMatch(/Package deprecated — code migration required/);
    expect(body).toMatch(
      /<code>@aurodesignsystem\/auro-formkit<\/code> is a different package/,
    );
    // The "majors behind" framing doesn't apply here and must not appear.
    expect(body).not.toMatch(/major version[s]? behind/);
  });

  it("body Context section keeps the namespace-rename wording for scope-only deprecations", () => {
    const body = buildStoryBody({
      candidate: makeCandidate({
        package: "@alaskaairux/auro-button",
        targetPackage: "@aurodesignsystem/auro-button",
        pinned: "4.0.0",
        latest: "12.3.2",
        majorsBehind: 8,
        status: "Unsupported",
      }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/⚠ Namespace rename/);
    expect(body).not.toMatch(/code migration required/);
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
    expect(body).toMatch(
      /<code>@aurodesignsystem\/auro-button@10\.0\.0<\/code>/,
    );
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

describe("buildStoryBody — What's new section (replaces inline CHANGELOG dump)", () => {
  it("falls back to a link-only paragraph when changelogSlice is null", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/<h3>What's new<\/h3>/);
    expect(body).toMatch(
      /See the <a href="https:\/\/example\/CHANGELOG\.md">CHANGELOG/,
    );
    // Old "Migration guide" header should no longer appear.
    expect(body).not.toMatch(/Migration guide/);
  });

  it("renders Features + Bug fixes counts when a structured slice is provided", () => {
    const slice: ChangelogSlice = {
      versions: [
        {
          version: "11.5.1",
          dateStr: null,
          sections: [
            {
              type: "features",
              title: "Features",
              bullets: ["a", "b", "c"],
            },
            { type: "bugFixes", title: "Bug Fixes", bullets: ["x", "y"] },
          ],
        },
        {
          version: "11.4.0",
          dateStr: null,
          sections: [
            { type: "features", title: "Features", bullets: ["d"] },
            {
              type: "breakingChanges",
              title: "BREAKING CHANGES",
              bullets: ["whatever"],
            },
          ],
        },
      ],
      html: "<h5>old inline html — should NOT appear</h5>",
    };
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: slice,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/Features: <b>4<\/b>/);
    expect(body).toMatch(/Bug fixes: <b>2<\/b>/);
    expect(body).toMatch(
      /<a href="https:\/\/example\/CHANGELOG\.md">full CHANGELOG/,
    );
  });

  it("does NOT inline the raw slice HTML in the body anymore", () => {
    // The old behavior dumped slice.html into the body. Bodies for long-jump
    // upgrades cleared the 50KB ADO render budget that way. Confirm the
    // section never embeds the slice's pre-rendered HTML.
    const slice: ChangelogSlice = {
      versions: [
        {
          version: "11.5.1",
          dateStr: null,
          sections: [{ type: "features", title: "Features", bullets: ["a"] }],
        },
      ],
      html: "<h5>SENTINEL_INLINE_DUMP</h5>",
    };
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: slice,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).not.toContain("SENTINEL_INLINE_DUMP");
  });

  it("emits zero counts when the slice has no features or bug fixes sections", () => {
    const slice: ChangelogSlice = {
      versions: [
        {
          version: "11.0.0",
          dateStr: null,
          sections: [
            {
              type: "breakingChanges",
              title: "BREAKING CHANGES",
              bullets: ["x"],
            },
          ],
        },
      ],
      html: "<p>release notes</p>",
    };
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: slice,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/Features: <b>0<\/b>/);
    expect(body).toMatch(/Bug fixes: <b>0<\/b>/);
  });
});

describe("buildStoryBody — incident callout from policy notes", () => {
  it("renders a warning callout with the notes text when candidate.notes is set", () => {
    const body = buildStoryBody({
      candidate: makeCandidate({
        notes: "Skip 13.0 — regression in focus-trap, see #1234.",
      }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/⚠ Incident notice/);
    expect(body).toMatch(/Skip 13\.0 — regression in focus-trap, see #1234\./);
  });

  it("HTML-escapes the notes text", () => {
    const body = buildStoryBody({
      candidate: makeCandidate({
        notes: "Avoid 12.x — see <script>alert(1)</script> & friends.",
      }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(
      /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; friends/,
    );
    expect(body).not.toContain("<script>alert(1)</script>");
  });

  it("omits the callout entirely when notes is absent", () => {
    const body = buildStoryBody({
      candidate: makeCandidate({ notes: undefined }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).not.toMatch(/Incident notice/);
  });

  it("places the incident callout above the breaking-changes section", () => {
    const slice: ChangelogSlice = {
      versions: [],
      html: "<p>release notes</p>",
    };
    const body = buildStoryBody({
      candidate: makeCandidate({ notes: "Skip 13.0 — regression." }),
      changelogSlice: slice,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [{ version: "13.0.0", text: "remove `slim` prop" }],
    });
    const incidentIdx = body.indexOf("Incident notice");
    const breakingIdx = body.indexOf("Breaking changes in this upgrade");
    expect(incidentIdx).toBeGreaterThan(-1);
    expect(breakingIdx).toBeGreaterThan(-1);
    expect(incidentIdx).toBeLessThan(breakingIdx);
  });
});

describe("buildStoryBody — Where this package is used", () => {
  function makeUsage(overrides: Partial<UsageInventory> = {}): UsageInventory {
    return {
      totalCount: 3,
      sampleFiles: [
        {
          path: "src/Foo.svelte",
          htmlUrl: "https://github.com/x/y/blob/abc/src/Foo.svelte",
        },
        {
          path: "src/Bar.svelte",
          htmlUrl: "https://github.com/x/y/blob/abc/src/Bar.svelte",
        },
        {
          path: "src/Baz.svelte",
          htmlUrl: "https://github.com/x/y/blob/abc/src/Baz.svelte",
        },
      ],
      searchUrl: "https://github.com/search?q=fake",
      ...overrides,
    };
  }

  it("renders the section when usage is provided and has matches", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
      usage: makeUsage(),
    });
    expect(body).toMatch(/Where this package is used in your codebase/);
    expect(body).toMatch(/referenced in <b>3<\/b> files/);
    expect(body).toMatch(/<code>src\/Foo\.svelte<\/code>/);
  });

  it("uses singular 'file' when only one match", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
      usage: makeUsage({
        totalCount: 1,
        sampleFiles: [
          {
            path: "src/Foo.svelte",
            htmlUrl: "https://github.com/x/y/blob/abc/src/Foo.svelte",
          },
        ],
      }),
    });
    expect(body).toMatch(/referenced in <b>1<\/b> file in this repo/);
    expect(body).not.toMatch(/files in this repo/);
  });

  it("appends an 'and N more' note when totalCount exceeds sampled files", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
      usage: makeUsage({ totalCount: 47 }),
    });
    expect(body).toMatch(/and 44 more/);
    expect(body).toMatch(/View all results on GitHub/);
  });

  it("omits the section when usage is null", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
      usage: null,
    });
    expect(body).not.toMatch(/Where this package is used/);
  });

  it("omits the section when usage.totalCount is 0", () => {
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
      usage: makeUsage({ totalCount: 0, sampleFiles: [] }),
    });
    expect(body).not.toMatch(/Where this package is used/);
  });

  it("names both packages in the cross-namespace case", () => {
    const body = buildStoryBody({
      candidate: makeCandidate({
        package: "@alaskaairux/auro-button",
        targetPackage: "@aurodesignsystem/auro-button",
      }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
      usage: makeUsage(),
    });
    expect(body).toMatch(
      /<code>@alaskaairux\/auro-button<\/code> or <code>@aurodesignsystem\/auro-button<\/code>/,
    );
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

  it("appends a 'find in repo' search link per bullet when the breaking text contains backtick identifiers", () => {
    const slice: ChangelogSlice = {
      versions: [],
      html: "<p>release notes</p>",
    };
    const breakingChanges: BreakingChange[] = [
      { version: "11.0.0", text: "remove `slim` prop" },
      // No backtick identifiers — should render without a link.
      { version: "10.0.0", text: "general API restructure" },
      // Multiple identifiers — single combined OR link.
      { version: "9.0.0", text: "deprecate `iconOnly`, `rounded`, `tertiary`" },
    ];
    const body = buildStoryBody({
      candidate: makeCandidate(),
      changelogSlice: slice,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges,
    });
    // Single-identifier bullet links to a search containing the identifier
    // AND the package short name.
    expect(body).toMatch(/find <code>slim<\/code> in this repo[^<]*<\/a>/);
    expect(body).toMatch(
      /q=repo%3AAlaska-ECommerce%2Ffixture-repo[^"]*%22auro-button%22[^"]*%22slim%22/,
    );

    // Multi-identifier bullet: each identifier appears in the link label and
    // in the URL as an OR clause.
    expect(body).toMatch(
      /find <code>iconOnly<\/code>, <code>rounded<\/code>, <code>tertiary<\/code> in this repo/,
    );
    expect(body).toMatch(
      /%22iconOnly%22%20OR%20%22rounded%22%20OR%20%22tertiary%22/,
    );

    // The no-identifier bullet should be untouched — no `find in this repo` suffix.
    const noIdMatch = body.match(/<li><b>10\.0\.0:<\/b>[^<]*<\/li>/);
    expect(noIdMatch).toBeTruthy();
    expect(noIdMatch?.[0]).not.toMatch(/find /);
  });

  it("uses the targetPackage short-name in the search query for cross-namespace upgrades", () => {
    const slice: ChangelogSlice = {
      versions: [],
      html: "<p>release notes</p>",
    };
    const body = buildStoryBody({
      candidate: makeCandidate({
        package: "@alaskaairux/auro-button",
        targetPackage: "@aurodesignsystem/auro-button",
      }),
      changelogSlice: slice,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [{ version: "11.0.0", text: "remove `slim` prop" }],
    });
    // Short name extracted from the target package (auro-button), not the
    // namespace-prefixed legacy name — the consumer is migrating TO the new
    // scope, so the search should match files referencing the new name.
    expect(body).toMatch(/%22auro-button%22/);
    expect(body).not.toMatch(/%40alaskaairux/);
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

describe("manifestPaths in body and AC", () => {
  it("Context section omits the manifest callout for the trivial single-root case", () => {
    const body = buildStoryBody({
      candidate: makeCandidate({ manifestPaths: ["package.json"] }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).not.toMatch(/Manifest location/);
    expect(body).not.toMatch(/Multiple manifests/);
  });

  it("Context section omits the manifest callout when manifestPaths is absent", () => {
    // Pre-v2 candidates JSON files lack the field entirely. The renderer
    // should be defensive — no callout, no crash.
    const body = buildStoryBody({
      candidate: makeCandidate({ manifestPaths: undefined }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).not.toMatch(/Manifest location/);
    expect(body).not.toMatch(/Multiple manifests/);
  });

  it("Context section calls out a single non-root manifest", () => {
    const body = buildStoryBody({
      candidate: makeCandidate({ manifestPaths: ["component/package.json"] }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/📍 Manifest location/);
    expect(body).toMatch(/<code>component\/package\.json<\/code>/);
    expect(body).toMatch(/not the repo's root/);
    // Multi-manifest wording must NOT appear in the single-path case.
    expect(body).not.toMatch(/Multiple manifests/);
  });

  it("Context section calls out multiple manifests with all paths listed", () => {
    const body = buildStoryBody({
      candidate: makeCandidate({
        manifestPaths: ["client/package.json", "component/package.json"],
      }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/⚠ Multiple manifests/);
    expect(body).toMatch(/<b>2<\/b>/);
    expect(body).toMatch(/<code>client\/package\.json<\/code>/);
    expect(body).toMatch(/<code>component\/package\.json<\/code>/);
  });

  it("Context section renders manifests as a <ul> when there are more than 5", () => {
    // Borealis's worst-case packages live in 17–45 manifests. A
    // comma-separated paragraph at that size is unreadable; a bulleted
    // list is the engineer's update checklist.
    const paths = Array.from(
      { length: 8 },
      (_, i) => `components/widget-${i}/package.json`,
    );
    const body = buildStoryBody({
      candidate: makeCandidate({ manifestPaths: paths }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/⚠ Multiple manifests/);
    expect(body).toMatch(/<b>8<\/b>/);
    // The bulleted block should be present.
    expect(body).toMatch(/<ul>\s*\n\s*<li><code>components\/widget-0/);
    // Each manifest gets its own <li> rather than a comma-joined run-on.
    for (let i = 0; i < 8; i++) {
      expect(body).toMatch(
        new RegExp(
          `<li><code>components/widget-${i}/package\\.json</code></li>`,
        ),
      );
    }
  });

  it("Context section stays inline (comma list) at 5 manifests — under the threshold", () => {
    const paths = Array.from(
      { length: 5 },
      (_, i) => `components/widget-${i}/package.json`,
    );
    const body = buildStoryBody({
      candidate: makeCandidate({ manifestPaths: paths }),
      changelogSlice: null,
      changelogUrl: "https://example/CHANGELOG.md",
      breakingChanges: [],
    });
    expect(body).toMatch(/⚠ Multiple manifests/);
    // No <ul> for 5 manifests — paragraph reads fine at that size.
    expect(body).not.toMatch(/<ul>\s*\n\s*<li><code>components\/widget-/);
    // Paths are still all present, just inline.
    for (let i = 0; i < 5; i++) {
      expect(body).toMatch(
        new RegExp(`<code>components/widget-${i}/package\\.json</code>`),
      );
    }
  });

  it("AC first bullet uses generic wording for the trivial single-root case", () => {
    const ac = buildAcceptanceCriteria(
      makeCandidate({ manifestPaths: ["package.json"] }),
    );
    expect(ac).toMatch(
      /Update <code>@aurodesignsystem\/auro-button<\/code> to <code>11\.5\.1<\/code> in the consumer's <code>package\.json<\/code> \(and the matching lockfile\)/,
    );
    expect(ac).not.toMatch(/each of the/);
  });

  it("AC first bullet names a single non-root manifest explicitly", () => {
    const ac = buildAcceptanceCriteria(
      makeCandidate({ manifestPaths: ["component/package.json"] }),
    );
    expect(ac).toMatch(
      /Update <code>@aurodesignsystem\/auro-button<\/code> to <code>11\.5\.1<\/code> in <code>component\/package\.json<\/code> \(and the matching lockfile\)/,
    );
  });

  it("AC first bullet enumerates all manifests in the multi-manifest case", () => {
    const ac = buildAcceptanceCriteria(
      makeCandidate({
        manifestPaths: ["client/package.json", "component/package.json"],
      }),
    );
    expect(ac).toMatch(
      /Update <code>@aurodesignsystem\/auro-button<\/code> to <code>11\.5\.1<\/code> in each of the 2 manifests where it appears \(<code>client\/package\.json<\/code>, <code>component\/package\.json<\/code>\) \(and the matching lockfiles\)/,
    );
  });

  it("AC first bullet cross-references the body callout above the threshold instead of inlining 30+ paths", () => {
    // Duplicating a 45-path comma-separated list in both Context AND AC
    // pushes the meaningful checklist (npm ci, build, lint, test, smoke)
    // off the screen. Above the threshold, AC points at the Context list
    // instead.
    const paths = Array.from(
      { length: 12 },
      (_, i) => `components/widget-${i}/package.json`,
    );
    const ac = buildAcceptanceCriteria(makeCandidate({ manifestPaths: paths }));
    expect(ac).toMatch(
      /in each of the 12 manifests listed in the "Multiple manifests" callout in this ticket's description/,
    );
    // None of the actual paths should appear inline in the AC bullet.
    for (let i = 0; i < 12; i++) {
      const acFirstBulletEnd = ac.indexOf("npm ci");
      const firstBullet = ac.slice(0, acFirstBulletEnd);
      expect(firstBullet).not.toContain(`widget-${i}/package.json`);
    }
  });

  it("AC first bullet preserves cross-namespace rewrite wording with multi-manifest", () => {
    const ac = buildAcceptanceCriteria(
      makeCandidate({
        package: "@alaskaairux/auro-button",
        targetPackage: "@aurodesignsystem/auro-button",
        manifestPaths: ["client/package.json", "component/package.json"],
      }),
    );
    // Cross-namespace ("Replace X with Y") must still happen, AND the
    // manifests must be enumerated.
    expect(ac).toMatch(
      /Replace <code>@alaskaairux\/auro-button<\/code> with <code>@aurodesignsystem\/auro-button@11\.5\.1<\/code> in each of the 2 manifests where it appears/,
    );
    expect(ac).toMatch(/lockfiles/);
  });
});
