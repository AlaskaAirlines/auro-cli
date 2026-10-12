/**
 * Watch-mode post-bundle tasks — a failing docs build must not stop `auro dev`
 * from starting its dev server. The failure is reported, and the initial-build
 * callback still fires once analyze, docs and SCSS have all run.
 *
 * @see ../src/scripts/build/watchModeHandlers.js
 */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { handleWatcherEvents } from "../src/scripts/build/watchModeHandlers.js";
import { captureError } from "./support.ts";

/** Let pending promise callbacks and I/O callbacks settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("a failing docs build still lets the dev server start", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(process.stderr, "write", () => true);
  const errors = captureError(t);

  const watcher = new EventEmitter();
  const docs = t.mock.fn(async () => {
    throw new Error("Failed to generate 1 docs file(s)");
  });
  const onInitialBuildComplete = t.mock.fn();

  await handleWatcherEvents(watcher, {}, onInitialBuildComplete, {
    analyze: async () => {},
    docs,
    scss: async () => {},
  });

  watcher.emit("event", { code: "BUNDLE_START", input: "/repo/src/index.js" });
  watcher.emit("event", {
    code: "BUNDLE_END",
    input: "/repo/src/index.js",
    duration: 1,
  });

  // The post-bundle steps are staggered over ~3.5s of timeouts.
  for (let i = 0; i < 10; i++) {
    t.mock.timers.tick(500);
    await flush();
  }

  assert.equal(docs.mock.callCount(), 1);
  assert.match(errors(), /Documentation rebuild error:.*Failed to generate/);
  assert.equal(onInitialBuildComplete.mock.callCount(), 1);
});
