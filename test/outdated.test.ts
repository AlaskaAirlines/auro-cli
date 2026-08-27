import assert from "node:assert/strict";
import { test } from "node:test";
import chalk from "chalk";
import {
  checkOutdated,
  type OutdatedComponent,
  renderOutdatedBanner,
} from "../src/utils/outdated.ts";

test("checkOutdated reports only packages behind the latest release", async (t) => {
  const latest: Record<string, string> = {
    "@aurodesignsystem/auro-button": "13.0.0",
    "@aurodesignsystem/auro-icon": "6.1.0",
  };
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const pkg = Object.keys(latest).find((p) => String(url).includes(p));
    return new Response(JSON.stringify({ version: pkg ? latest[pkg] : null }), {
      status: 200,
    });
  });

  const outdated = await checkOutdated(
    new Map([
      ["@aurodesignsystem/auro-button", "12.3.0"], // behind → reported
      ["@aurodesignsystem/auro-icon", "6.1.0"], // equal → omitted
    ]),
  );

  assert.equal(outdated.length, 1);
  assert.deepEqual(outdated[0], {
    pkg: "@aurodesignsystem/auro-button",
    installed: "12.3.0",
    latest: "13.0.0",
  });
});

test("checkOutdated treats an unresolvable latest as current", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 500 }),
  );

  const outdated = await checkOutdated(
    new Map([["@aurodesignsystem/auro-button", "12.3.0"]]),
  );

  assert.deepEqual(
    outdated,
    [],
    "a package whose latest is unknown is not reported",
  );
});

test("checkOutdated returns an empty list for an empty map", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("should not fetch for an empty map");
  });

  const outdated = await checkOutdated(new Map());

  assert.deepEqual(outdated, []);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("renderOutdatedBanner lists each component and the update command", () => {
  // Disable colors so the assertions match the plain text.
  const prevLevel = chalk.level;
  chalk.level = 0;
  try {
    const outdated: OutdatedComponent[] = [
      {
        pkg: "@aurodesignsystem/auro-button",
        installed: "12.3.0",
        latest: "13.0.0",
      },
      {
        pkg: "@aurodesignsystem/auro-icon",
        installed: "6.0.0",
        latest: "6.1.0",
      },
    ];

    const banner = renderOutdatedBanner(outdated);

    assert.match(banner, /2 Auro component\(s\) are NOT on the latest release/);
    for (const o of outdated) {
      assert.ok(banner.includes(o.pkg), `mentions ${o.pkg}`);
      assert.ok(
        banner.includes(o.installed),
        `mentions installed ${o.installed}`,
      );
      assert.ok(banner.includes(o.latest), `mentions latest ${o.latest}`);
    }
    assert.match(
      banner,
      /npm install @aurodesignsystem\/auro-button@latest @aurodesignsystem\/auro-icon@latest/,
    );
  } finally {
    chalk.level = prevLevel;
  }
});
