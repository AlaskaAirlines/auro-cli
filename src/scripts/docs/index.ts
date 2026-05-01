import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import { shell } from "#utils/shell.js";
import Docs from "./docs-generator.ts";
import { configPath } from "#utils/pathUtils.js";
import { buildDemoBundle, compileDemoScss } from "../build/bundleHandlers.js";
import { runDefaultDocsBuild } from "../build/defaultDocsBuild.js";
import { startDevelopmentServer } from "../build/devServerUtils.js";

export async function cem() {
  const cemSpinner = ora("Generating Custom Elements Manifest...").start();

  try {
    // The shell function returns a promise that resolves when the command completes
    await shell(
      `npx --package=@custom-elements-manifest/analyzer -y -- cem analyze --config '${configPath("custom-elements-manifest.config.mjs")}'`,
    );
    cemSpinner.succeed("Custom Elements Manifest generated successfully!");
  } catch (error) {
    // Check if the error is just the plugin issue but the manifest was still created
    const errorMessage = error instanceof Error ? error.message : String(error);
    cemSpinner.warn('CEM analyzer completed with warnings: ' + errorMessage);
  }
}

export async function api() {
  const docsSpinner = ora("Generating API md file...").start();

  try {
    await Docs.generate();
    docsSpinner.succeed("API md file generated successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    docsSpinner.fail("Failed to generate API md file: " + errorMessage);
    throw error;
  }
}

export async function docs(options = {}) {
  const docsSpinner = ora("Compiling documentation...").start();

  try {
    await runDefaultDocsBuild(options);
    docsSpinner.succeed("Documentation compiled successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    docsSpinner.fail("Failed to compile MD documentation: " + errorMessage);
    throw error;
  }

  copyReadmeToDemo();
  await compileDemoScss();
  await buildDemoBundle(options);
}

/**
 * Copies the processed README.md from the project root into the demo directory.
 */
function copyReadmeToDemo() {
  const readmeSrc = path.resolve(process.cwd(), "README.md");
  const demoDir = path.resolve(process.cwd(), "demo");
  const readmeDest = path.join(demoDir, "readme.md");

  if (!fs.existsSync(readmeSrc)) {
    return;
  }

  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  fs.copyFileSync(readmeSrc, readmeDest);
}

export async function serve(options = {}) {
  await startDevelopmentServer(options);
}

/**
 * Watches doc and src files and rebuilds on changes.
 */
export async function watchDocs(options = {}) {
  const chokidar = await import("chokidar");

  const watchPaths = [
    "./src/**/*",
    "./docs/**/*",
    "./docTemplates/**/*",
    "./apiExamples/**/*",
    "./demo/**/*.scss",
  ];

  const ignored = [
    // Output files that should never trigger a rebuild
    "**/demo/*.min.js",
    "**/demo/*.min.css",
    "**/demo/*.md",
    "**/demo/readme.md",
    "**/docs/api.md",
    "**/custom-elements.json",
    "**/node_modules/**",
    "**/dist/**",
    "**/.git/**",
  ];

  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    ignored,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100,
    },
  });

  const watchSpinner = ora("Waiting for changes...");
  watchSpinner.spinner = "bouncingBar";
  watchSpinner.color = "green";
  watchSpinner.start();

  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  let rebuilding = false;
  let pendingRebuild = false;

  async function rebuild(triggeredBy: string) {
    if (rebuilding) {
      pendingRebuild = true;
      return;
    }

    rebuilding = true;

    // Pause watcher during rebuild to avoid feedback loops
    watcher.unwatch(watchPaths);

    const spinner = ora(`Change detected: ${triggeredBy}`).start();
    try {
      await runDefaultDocsBuild(options);
      copyReadmeToDemo();
      await compileDemoScss();
      await buildDemoBundle(options);
      spinner.succeed("Docs rebuilt!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      spinner.fail("Rebuild failed: " + errorMessage);
    } finally {
      // Re-enable watcher after a short delay for file writes to settle
      setTimeout(() => {
        watcher.add(watchPaths);
        rebuilding = false;

        if (pendingRebuild) {
          pendingRebuild = false;
          rebuild("queued changes");
        }
      }, 1000);
    }
  }

  watcher.on("all", (_event: string, filePath: string) => {
    if (rebuilding) return;

    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
    }

    rebuildTimer = setTimeout(() => {
      rebuild(filePath);
    }, 1000);
  });

  // Keep process alive and handle clean shutdown
  process.on("SIGINT", () => {
    watcher.close();
    ora().succeed("Doc watch stopped.");
    process.exit(0);
  });
}
