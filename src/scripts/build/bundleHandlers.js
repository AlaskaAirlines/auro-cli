import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import ora from "ora";
import { rollup } from "rollup";
import * as sass from "sass";
import { analyzeComponents } from "#scripts/analyze.js";
import { runDefaultDocsBuild } from "#scripts/build/defaultDocsBuild.js";
import { getDemoConfig } from "#scripts/build/configUtils.js";
import { MODULE_DIRS } from "#scripts/build/paths.js";
import { copyReadmeToDemo } from "#utils/copyReadmeToDemo.js";

/**
 * Clean up the dist folder
 * @returns {boolean} Success status
 */
export function cleanupDist() {
  const distPath = join("./dist");
  const spinner = ora("Cleaning dist folder...").start();

  try {
    rmSync(distPath, { recursive: true, force: true });
    spinner.succeed("All clean! Dist folder wiped.");
    return true;
  } catch (error) {
    spinner.fail(`Oops! Couldn't clean dist/ folder: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Run a build step with spinner feedback
 * @param {string} taskName - Name of the task for spinner text
 * @param {Function} taskFn - Async function to execute the task
 * @param {string} successMsg - Message to show on success
 * @param {string} failMsg - Message to show on failure
 * @returns {Promise<any>} - Result of the task function or throws error
 */
async function runBuildStep(taskName, taskFn, successMsg, failMsg) {
  const spinner = ora(taskName).start();

  try {
    const result = await taskFn();
    spinner.succeed(successMsg);
    return result;
  } catch (error) {
    spinner.fail(failMsg);
    console.error(`Error: ${error.message}`);
    throw error;
  }
}

/**
 * Builds the TypeScript definition files
 * @param {object} config - Rollup config for d.ts generation
 * @param {object} outputConfig - Output configuration for d.ts files
 */
export async function buildTypeDefinitions(config, outputConfig) {
  return runBuildStep(
    "Creating type definitions...",
    async () => {
      const bundle = await rollup(config);
      await bundle.write(outputConfig);
      await bundle.close();
    },
    "Types files built.",
    "Darn! Type definitions failed.",
  );
}

/**
 * Builds both the main bundle and demo files in one operation
 * @param {object} mainConfig - Rollup config for the main bundle
 * @param {object[]} demoConfigs - One Rollup config per demo entry file
 */
export async function buildCombinedBundle(mainConfig, demoConfigs) {
  return runBuildStep(
    `Bundling ${mainConfig.name || "main"} and demo...`,
    async () => {
      // Build main bundle
      const mainBundle = await rollup(mainConfig);
      await mainBundle.write(mainConfig.output);
      await mainBundle.close();

      // Build demo entries individually so shared imports inline into each
      // <name>.min.js instead of producing a shared <name>2.min.js chunk.
      for (const cfg of demoConfigs) {
        const bundle = await rollup(cfg);
        await bundle.write(cfg.output);
        await bundle.close();
      }
    },
    `Bundles ready! ${mainConfig.name || "Main"} and demo built.`,
    "Bundle hiccup! Build failed.",
  );
}

/**
 * Analyzes web components and generates API documentation.
 * @param {object} options - Options containing wcaInput and wcaOutput
 */
export async function generateDocs(options) {
  const { wcaInput: sourceFiles, wcaOutput: outFile, skipDocs } = options;

  if (skipDocs) {
    const skipSpinner = ora("Skipping docs generation...").start();

    setTimeout(() => {
      skipSpinner.succeed("Docs generation skipped.");
    }, 0);
    return;
  }

  return runBuildStep(
    "Analyzing components and making docs...",
    async () => {
      await analyzeComponents(sourceFiles, outFile);
      await runDefaultDocsBuild(options);
      copyReadmeToDemo();
    },
    "Docs ready! Looking good.",
    "Doc troubles!",
  );
}



/**
 * Sass FileImporter that resolves bare package imports from node_modules
 * and redirects hoisted dependencies. Returns file: URLs so that
 * within-package relative imports resolve natively on disk. When a
 * relative import fails (e.g. ./../../node_modules/@pkg/foo pointing at
 * a hoisted location that doesn't exist), Sass falls back to findFileUrl,
 * where we redirect to the actual hoisted location.
 */
function createNodeModulesImporter() {
  const cwd = process.cwd();

  function tryResolve(filePath) {
    const candidates = [
      filePath,
      `${filePath}.scss`,
      `${filePath}.css`,
      join(dirname(filePath), `_${basename(filePath)}.scss`),
      join(filePath, "_index.scss"),
      join(filePath, "index.scss"),
    ];
    return candidates.find((c) => existsSync(c));
  }

  function findInModuleDirs(pkgPath) {
    for (const dir of MODULE_DIRS) {
      const found = tryResolve(resolve(cwd, dir, pkgPath));
      if (found) return found;
    }

    // Try resolving via package.json "exports" map
    const exportResolved = resolveViaExports(pkgPath);
    if (exportResolved) return exportResolved;

    return null;
  }

  /**
   * Resolves a bare specifier using the package.json "exports" field.
   * e.g. "@scope/pkg/demo-styles" looks up "./demo-styles" in the exports map
   * of @scope/pkg/package.json and resolves the mapped path.
   */
  function resolveViaExports(pkgPath) {
    let pkgName;
    let subpath;

    if (pkgPath.startsWith("@")) {
      const parts = pkgPath.split("/");
      if (parts.length < 3) return null;
      pkgName = `${parts[0]}/${parts[1]}`;
      subpath = `./${parts.slice(2).join("/")}`;
    } else {
      const slashIdx = pkgPath.indexOf("/");
      if (slashIdx === -1) return null;
      pkgName = pkgPath.slice(0, slashIdx);
      subpath = `./${pkgPath.slice(slashIdx + 1)}`;
    }

    for (const dir of MODULE_DIRS) {
      const pkgJsonPath = resolve(cwd, dir, pkgName, "package.json");
      if (!existsSync(pkgJsonPath)) continue;

      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        const exports = pkgJson.exports;
        if (!exports || typeof exports !== "object") continue;

        const mapped = exports[subpath];
        if (!mapped) continue;

        const target = typeof mapped === "string" ? mapped : mapped.default || mapped.import;
        if (!target) continue;

        const resolved = tryResolve(resolve(cwd, dir, pkgName, target));
        if (resolved) return resolved;
      } catch {
        continue;
      }
    }

    return null;
  }

  return {
    findFileUrl(url) {
      // Failed relative import containing a node_modules path that
      // doesn't exist due to hoisting — redirect to hoisted location
      if (url.includes("/node_modules/")) {
        const lastIdx = url.lastIndexOf("/node_modules/");
        const pkgPath = url.slice(lastIdx + "/node_modules/".length);
        const found = findInModuleDirs(pkgPath);
        if (found) return pathToFileURL(found);
      }

      // Bare package import (e.g. @aurodesignsystem/webcorestylesheets/...)
      if (!url.startsWith(".") && !url.startsWith("/") && !url.startsWith("file:")) {
        const found = findInModuleDirs(url);
        if (found) return pathToFileURL(found);
      }

      return null;
    },
  };
}

/**
 * Compiles all SCSS files in the demo directory to CSS.
 * @param {string} [demoDir="./demo"] - Path to the demo directory
 */
export async function compileDemoScss(demoDir = "./demo") {
  return runBuildStep(
    "Compiling demo SCSS...",
    async () => {
      const scssFiles = glob.sync(join(demoDir, "**/*.scss"));
      const importer = createNodeModulesImporter();
      const cwd = process.cwd();
      const loadPaths = MODULE_DIRS.map((dir) => resolve(cwd, dir));

      for (const scssFile of scssFiles) {
        const result = sass.compile(scssFile, {
          importers: [importer],
          loadPaths,
          silenceDeprecations: ["import"],
          style: "compressed",
        });

        const cssFile = scssFile.replace(/\.scss$/, ".min.css");
        writeFileSync(cssFile, result.css);
      }

      return scssFiles.length;
    },
    "Demo SCSS compiled.",
    "SCSS compilation failed.",
  );
}

/**
 * Bundles demo JS files to minified ESM output.
 * @param {object} [options={}] - Options passed to getDemoConfig
 */
export async function buildDemoBundle(options = {}) {
  const { configs } = getDemoConfig(options);

  return runBuildStep(
    "Bundling demo JS...",
    async () => {
      for (const cfg of configs) {
        const bundle = await rollup(cfg);
        await bundle.write(cfg.output);
        await bundle.close();
      }
    },
    "Demo JS bundled.",
    "Demo JS bundling failed.",
  );
}
