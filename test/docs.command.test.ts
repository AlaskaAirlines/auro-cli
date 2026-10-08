/**
 * `auro docs` — a docs build failure exits 1, except in watch mode, where it's
 * reported and the server and watcher still start. The demo is rebuilt even
 * when the docs fail, so watch mode keeps picking up src/ changes.
 *
 * @see ../src/commands/docs.ts
 * @see ../src/scripts/docs/index.ts
 */

import assert from "node:assert/strict";
import process from "node:process";
import { type TestContext, test } from "node:test";
import docsCommand, {
  type DocsSteps,
  defaultDocsSteps,
  runDocs,
} from "../src/commands/docs.ts";
import { docs } from "../src/scripts/docs/index.ts";
import { captureWrite, ExitError, mockExit } from "./support.ts";

/** Stub every docs step, recording the order they ran in. */
function stubSteps(docsError?: Error): { steps: DocsSteps; ran: string[] } {
  const ran: string[] = [];
  const step = (name: string) => async () => {
    ran.push(name);
  };
  return {
    ran,
    steps: {
      cem: step("cem"),
      api: step("api"),
      docs: async () => {
        ran.push("docs");
        if (docsError) {
          throw docsError;
        }
      },
      serve: step("serve"),
      watchDocs: step("watchDocs"),
    },
  };
}

/** Silence the spinners, which write to stderr. */
function quiet(t: TestContext): () => string {
  return captureWrite(t, process.stderr);
}

test("runs the requested steps and doesn't exit on success", async (t) => {
  mockExit(t);
  quiet(t);
  const { steps, ran } = stubSteps();

  await runDocs({ cem: true, api: true, serve: true }, steps);

  assert.deepEqual(ran, ["cem", "api", "docs", "serve"]);
});

test("exits 1 when the docs build fails", async (t) => {
  mockExit(t);
  const stderr = quiet(t);
  const { steps, ran } = stubSteps(
    new Error("Failed to generate 1 docs file(s)"),
  );

  await assert.rejects(runDocs({ serve: true }, steps), (err: ExitError) => {
    assert.ok(err instanceof ExitError);
    assert.equal(err.code, 1);
    return true;
  });
  assert.deepEqual(ran, ["docs"], "the server doesn't start");
  assert.match(stderr(), /Docs failed: Failed to generate 1 docs file\(s\)/);
});

test("in watch mode a docs failure still starts the server and watcher", async (t) => {
  mockExit(t);
  quiet(t);
  const { steps, ran } = stubSteps(new Error("broken"));

  await runDocs({ watch: true, serve: true }, steps);

  assert.deepEqual(ran, ["docs", "serve", "watchDocs"]);
});

test("exits 1 when an earlier step fails, even in watch mode", async (t) => {
  mockExit(t);
  quiet(t);
  const { steps } = stubSteps();
  steps.api = async () => {
    throw new Error("no manifest");
  };

  await assert.rejects(
    runDocs({ api: true, watch: true }, steps),
    (err: ExitError) => {
      assert.equal(err.code, 1);
      return true;
    },
  );
});

test("the registered `auro docs` command runs the default steps", async (t) => {
  mockExit(t);
  quiet(t);
  const ran: string[] = [];
  for (const name of Object.keys(defaultDocsSteps) as (keyof DocsSteps)[]) {
    t.mock.method(defaultDocsSteps, name, async () => {
      ran.push(name);
    });
  }

  await docsCommand.parseAsync(["--serve"], { from: "user" });

  assert.deepEqual(ran, ["docs", "serve"]);
});

test("docs() builds the demo even when the docs build fails, then rethrows", async (t) => {
  quiet(t);
  const failure = new Error("broken");
  const ran: string[] = [];

  await assert.rejects(
    docs(
      {},
      {
        build: async () => {
          ran.push("build");
          throw failure;
        },
        demo: async () => {
          ran.push("demo");
        },
      },
    ),
    (err) => err === failure,
  );
  assert.deepEqual(ran, ["build", "demo"]);
});
