import ora from "ora";

const watchers = [];

/**
 * Register a watcher (rollup or chokidar) for clean shutdown on SIGINT.
 * @param {object} watcher - A watcher with a close() method
 */
export function registerWatcher(watcher) {
  watchers.push(watcher);
}

// Single SIGINT handler for all registered watchers
let handlerInstalled = false;

export function installShutdownHandler() {
  if (handlerInstalled) return;
  handlerInstalled = true;

  process.on("SIGINT", () => {
    const closeSpinner = ora("Wrapping up...").start();
    for (const watcher of watchers) {
      watcher.close();
    }
    closeSpinner.succeed("All done! See you next time. ✨");
    process.exit(0);
  });
}
