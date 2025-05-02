import fs from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { build } from "esbuild";
import ora from "ora";

// Import our modularized build scripts
import {
  aliases,
  externalPackages,
  getBuildConfig,
  parseArgs,
} from "./build-scripts/build-config.js";
import {
  processMigrations,
  watchMigrationFiles,
} from "./build-scripts/migration-handler.js";

// Parse command line arguments
const { isWatchMode, isDevelopmentMode } = parseArgs();

// Custom build steps for optimizing the distribution
/**
 * Runs the build process with optional development mode.
 * @param {boolean} isDev - Whether to build in development mode for easier debugging.
 */
async function runBuild(isDev = false) {
  try {
    // Step 1: Ensure dist directory exists
    if (!fs.existsSync("dist")) {
      fs.mkdirSync("dist", { recursive: true });
    }

    // Ensure migrations directory exists
    if (!fs.existsSync("dist/migrations")) {
      fs.mkdirSync("dist/migrations", { recursive: true });
    }

    // Step 2: Clean non-migration files from dist (if they exist)
    const preserveMigrations = (item) => item !== "migrations";
    const items = fs.readdirSync("dist").filter(preserveMigrations);
    for (const item of items) {
      const itemPath = join("dist", item);
      if (fs.existsSync(itemPath)) {
        if (fs.lstatSync(itemPath).isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(itemPath);
        }
      }
    }

    // Step 3: Build the main CLI bundle
    const buildSpinner = ora(
      isDev
        ? "Building in DEVELOPMENT mode..."
        : "Building in PRODUCTION mode...",
    ).start();

    // Get the build configuration
    const buildConfig = getBuildConfig(isDev);

    const result = await build(buildConfig);

    buildSpinner.succeed(
      isDev
        ? "Build complete with development-friendly distribution!"
        : "Build complete with optimized distribution!",
    );

    // Step 4: Report build stats
    if (result.metafile) {
      const bundleSize = fs.statSync("dist/auro-cli.js").size;
      console.log(`🔹 Main bundle size: ${(bundleSize / 1024).toFixed(2)}kb`);
    }

    // Step 5: Fix permissions on the main bundle
    const mainBundlePath = "dist/auro-cli.js";
    if (fs.existsSync(mainBundlePath)) {
      try {
        fs.chmodSync(mainBundlePath, 0o755);
        console.log("🔐 Set executable permissions on output file");
      } catch (chmodError) {
        console.error(
          "⚠️ Warning: Failed to set executable permissions:",
          chmodError,
        );
        console.log(
          "   You may need to manually run: chmod +x dist/auro-cli.js",
        );
      }
    }

    // Step 6: Process migrations using our modular handler (always run)
    const migrationSpinner = ora("Processing migrations...").start();
    await processMigrations({
      isDev,
      externalPackages,
      aliases,
    });
    migrationSpinner.succeed("Migrations processed successfully");

    // Step 7: Watch for file changes if in watch mode
    if (isWatchMode) {
      // Create a watch spinner with custom styling
      const watchSpinner = ora({
        text: "Waiting for file changes...\n",
        spinner: "bouncingBar",
        color: "green",
      }).start();

      // Use our modular migration file watcher
      const watcher = watchMigrationFiles({
        isDev,
        externalPackages,
        aliases,
        onEvent: async (event) => {
          if (event.error) {
            watchSpinner.fail(`Watch mode error: ${event.error.message}`);
            watchSpinner.text = "Waiting for file changes...\n";
            watchSpinner.start();
          } else if (event.requiresRebuild) {
            // If a source file changed that requires a full rebuild
            watchSpinner.text = `Rebuilding after changes to ${event.path}...`;

            try {
              // Rebuild the main bundle with the current configuration
              await build(buildConfig);
              watchSpinner.succeed(`Rebuild complete for ${event.path}`);

              // Report build stats if available
              if (fs.existsSync("dist/auro-cli.js")) {
                const bundleSize = fs.statSync("dist/auro-cli.js").size;
                console.log(
                  `🔹 Main bundle size: ${(bundleSize / 1024).toFixed(2)}kb`,
                );
              }
            } catch (buildError) {
              watchSpinner.fail(`Rebuild failed: ${buildError.message}`);
            }

            // Reset spinner state
            watchSpinner.text = "Waiting for file changes...\n";
            watchSpinner.start();
          }
        },
      });

      // Set up cleanup on process exit
      process.on("SIGINT", () => {
        if (watcher) {
          watcher.close();
        }
        watchSpinner.stop();
        process.exit(0);
      });
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

// Run the build with the current mode
runBuild(isDevelopmentMode);
