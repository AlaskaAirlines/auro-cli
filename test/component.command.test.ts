import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { runComponent } from "../src/commands/component.ts";
import {
  captureError,
  captureWrite,
  ExitError,
  elementManifest,
  installLocalPackage,
  installRealPackage,
  tempCwd,
} from "./support.ts";

const PKG = "@aurodesignsystem/auro-button";

/** A monorepo-style aggregate manifest documenting several elements at once. */
function aggregateManifest(...tagNames: string[]): unknown {
  return {
    schemaVersion: "1.0.0",
    modules: tagNames.map((tagName) => ({
      kind: "javascript-module",
      path: `${tagName}.js`,
      declarations: [
        {
          kind: "class",
          name: tagName
            .split("-")
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(""),
          tagName,
          customElement: true,
          description: `The ${tagName} element.`,
        },
      ],
    })),
  };
}

test("prints the formatted API to stdout on an unpkg hit", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd); // empty → forces network
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify(elementManifest("auro-button")), {
        status: 200,
      }),
  );

  await runComponent("button", {});

  const out = stdout();
  assert.match(out, /auro-button/);
  assert.match(out, /Attributes/);
});

test("--json writes a parseable JSON array to stdout", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify(elementManifest("auro-button")), {
        status: 200,
      }),
  );

  await runComponent("button", { json: true });

  const parsed = JSON.parse(stdout());
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed[0].tagName, "auro-button");
});

test("exits 1 with a not-published message on a genuine 404", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd);
  captureError(t);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );

  await assert.rejects(runComponent("button", {}), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
});

test("exits 1 with a fetch-failed message on a transient error", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd);
  captureError(t);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(runComponent("button", {}), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
});

test("exits 1 when the manifest documents no registered elements", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd);
  captureError(t);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  // A manifest with a declaration that is not a registered custom element.
  const manifest = {
    schemaVersion: "1.0.0",
    modules: [
      {
        path: "base.js",
        declarations: [{ kind: "class", name: "BaseThing" }],
      },
    ],
  };
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(manifest), { status: 200 }),
  );

  await assert.rejects(runComponent("button", {}), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
});

test("a locally installed but outdated component warns on stderr, API on stdout", async (t) => {
  const cwd = await tempCwd(t);
  await installLocalPackage(cwd, PKG, "12.3.0", elementManifest("auro-button"));
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  const stderr = captureError(t);
  // Only the registry latest lookup should hit the network (manifest is local).
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ version: "13.0.0" }), { status: 200 }),
  );

  await runComponent("button", {});

  assert.match(stdout(), /auro-button/, "API renders on stdout");
  const err = stderr();
  assert.match(err, /NOT on the latest release/, "outdated banner on stderr");
  assert.match(err, /12\.3\.0/);
  assert.match(err, /13\.0\.0/);
  assert.equal(
    fetchMock.mock.callCount(),
    1,
    "only the registry lookup fetched",
  );
});

test("a legacy form component not installed locally resolves from the monorepo", async (t) => {
  const cwd = await tempCwd(t); // empty → nothing installed
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  const stderr = captureError(t);
  // The only network fetch is the monorepo aggregate CEM (which ships several
  // form elements); serving it also proves the request targets auro-formkit.
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.match(
      String(url),
      /auro-formkit/,
      "fetches the monorepo, not the standalone",
    );
    return new Response(
      JSON.stringify(aggregateManifest("auro-input", "auro-select")),
      { status: 200 },
    );
  });

  await runComponent("input", {});

  const out = stdout();
  assert.match(out, /auro-input/, "the requested element renders");
  assert.match(
    out,
    /import "@aurodesignsystem\/auro-formkit\/auro-input";/,
    "install snippet imports the formkit subpath",
  );
  assert.match(out, /npm i @aurodesignsystem\/auro-formkit\n/);
  assert.doesNotMatch(
    out,
    /auro-select/,
    "the aggregate CEM is filtered down to the one requested tag",
  );
  assert.match(
    stderr(),
    /now ships in @aurodesignsystem\/auro-formkit/,
    "a redirect note explains the monorepo source",
  );
  assert.equal(
    fetchMock.mock.callCount(),
    1,
    "only the monorepo manifest fetched",
  );
});

test("a legacy form component installed as a standalone is read locally, not redirected", async (t) => {
  const cwd = await tempCwd(t);
  await installLocalPackage(
    cwd,
    "@aurodesignsystem/auro-input",
    "9.0.0",
    elementManifest("auro-input"),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  const stderr = captureError(t);
  // Manifest is read locally; the only fetch is the registry staleness check.
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ version: "9.0.0" }), { status: 200 }),
  );

  await runComponent("input", {});

  const out = stdout();
  assert.match(
    out,
    /npm i @aurodesignsystem\/auro-input/,
    "an installed standalone is shown as-is",
  );
  assert.match(out, /import "@aurodesignsystem\/auro-input";/);
  assert.doesNotMatch(out, /auro-formkit/, "no monorepo redirect");
  assert.doesNotMatch(stderr(), /now ships in/, "no redirect note");
  for (const call of fetchMock.mock.calls) {
    assert.doesNotMatch(
      String(call.arguments[0]),
      /unpkg|auro-formkit/,
      "no manifest fetch — the local copy was used",
    );
  }
});

test("a legacy form component resolves from a locally installed monorepo, filtered to its tag", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-formkit"); // 20 elements, no standalone
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  const stderr = captureError(t);
  // Local read for the manifest; registry latest kept below the installed 6.1.0
  // so no outdated banner clouds the assertions.
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ version: "0.0.0" }), { status: 200 }),
  );

  await runComponent("input", {});

  const out = stdout();
  assert.match(
    out,
    /auro-input/,
    "the requested element renders from local formkit",
  );
  assert.doesNotMatch(
    out,
    /auro-select/,
    "the 20-element aggregate is filtered to the one requested tag",
  );
  assert.match(stderr(), /now ships in @aurodesignsystem\/auro-formkit/);
  for (const call of fetchMock.mock.calls) {
    assert.doesNotMatch(
      String(call.arguments[0]),
      /unpkg/,
      "the manifest came from the local install, not unpkg",
    );
  }
});

test("an explicit --tag on a legacy form component pins the standalone, not the monorepo", async (t) => {
  const cwd = await tempCwd(t); // empty → nothing installed locally
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  const stderr = captureError(t);
  // A version pin bypasses the monorepo redirect and fetches the standalone at
  // that exact version; the request URL proves it targets auro-input, not formkit.
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.match(
      String(url),
      /auro-input@9\.0\.0/,
      "fetches the pinned standalone version",
    );
    assert.doesNotMatch(
      String(url),
      /auro-formkit/,
      "an explicit --tag is not redirected to the monorepo",
    );
    return new Response(JSON.stringify(elementManifest("auro-input")), {
      status: 200,
    });
  });

  await runComponent("input", { tag: "9.0.0" });

  const out = stdout();
  assert.match(out, /auro-input/, "the pinned standalone renders");
  assert.match(out, /npm i @aurodesignsystem\/auro-input/);
  assert.match(out, /import "@aurodesignsystem\/auro-input";/);
  assert.doesNotMatch(out, /auro-formkit/, "no monorepo package in the output");
  assert.doesNotMatch(stderr(), /now ships in/, "no redirect note when pinned");
  assert.equal(fetchMock.mock.callCount(), 1, "only the pinned lookup fetched");
});

test("--json on a redirected legacy component keeps stdout parseable, note on stderr", async (t) => {
  const cwd = await tempCwd(t); // empty → redirects to the monorepo
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  const stderr = captureError(t);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify(aggregateManifest("auro-input", "auro-select")),
        { status: 200 },
      ),
  );

  await runComponent("input", { json: true });

  // stdout is a clean JSON array filtered to the one requested tag — the redirect
  // note must not leak onto it.
  const parsed = JSON.parse(stdout());
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 1, "the aggregate is filtered to one element");
  assert.equal(parsed[0].tagName, "auro-input");
  assert.match(
    stderr(),
    /now ships in @aurodesignsystem\/auro-formkit/,
    "the redirect note goes to stderr, off the machine-parseable stream",
  );
});

test("a redirected component whose tag is absent from the aggregate exits 1", async (t) => {
  const cwd = await tempCwd(t); // empty → redirects to the monorepo
  t.mock.method(process, "cwd", () => cwd);
  captureError(t);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  // The monorepo CEM resolves, but its declarations do not include the requested
  // tag (e.g. a stale/partial aggregate) — the tag filter leaves nothing to show.
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify(aggregateManifest("auro-select", "auro-combobox")),
        { status: 200 },
      ),
  );

  await assert.rejects(runComponent("input", {}), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
});
