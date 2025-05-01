import crypto from "node:crypto";
import fs from "node:fs";
import { watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { build } from "esbuild";
import ora from "ora";

// Store file hashes for detecting changes
const fileHashes = new Map();

/**
 * Processes a single migration file that has changed
 * @param {string} filePath - The path to the file that changed
 * @param {boolean} isDev - Whether to use development build settings
 * @param {string[]} externalPackages - List of packages to keep external
 * @param {Object} aliases - Map of import aliases
 * @returns {Promise<boolean>} - Whether the processing was successful
 */
export async function processMigrationFile(
  filePath,
  { isDev = false, externalPackages = [], aliases = {} },
) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File no longer exists: ${filePath}`);
      return false;
    }

    const fileSpinner = ora(`Processing ${filePath}...`).start();

    // Calculate output path
    const outputFile = filePath.replace("src/migrations", "dist/migrations");
    const outputDir = dirname(outputFile);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (filePath.endsWith(".js")) {
      // Process JS file - bundle it
      const migrationBuildConfig = {
        entryPoints: [filePath],
        bundle: true,
        platform: "node",
        target: "node18",
        outfile: outputFile,
        format: "esm",
        external: [...externalPackages, "node:*"],
        packages: "external",
        allowOverwrite: true,
        alias: aliases,
      };

      if (isDev) {
        migrationBuildConfig.minify = false;
        migrationBuildConfig.sourcemap = true;
        migrationBuildConfig.logLevel = "debug";
        migrationBuildConfig.treeShaking = false;
      } else {
        migrationBuildConfig.minify = true;
        migrationBuildConfig.sourcemap = false;
        migrationBuildConfig.legalComments = "none";
        migrationBuildConfig.treeShaking = true;
      }

      await build(migrationBuildConfig);
    } else if (filePath.endsWith(".yml") || filePath.endsWith(".sh")) {
      // Copy configuration file
      fs.copyFileSync(filePath, outputFile);

      // Set executable permissions on shell scripts
      if (filePath.endsWith(".sh")) {
        try {
          fs.chmodSync(outputFile, 0o755);
        } catch (chmodError) {
          console.error(
            `⚠️ Warning: Failed to set executable permissions on ${outputFile}:`,
            chmodError,
          );
        }
      }
    }

    fileSpinner.succeed(`Successfully processed ${filePath}`);

    // Update the file hash
    const fileHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(filePath))
      .digest("hex");
    fileHashes.set(filePath, fileHash);

    return true;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
    return false;
  }
}

/**
 * Sets up a watcher for migration files
 * @param {Object} options - Configuration options
 * @param {boolean} options.isDev - Whether to use development build settings
 * @param {string[]} options.externalPackages - List of packages to keep external
 * @param {Object} options.aliases - Map of import aliases
 * @param {Object} options.onEvent - Optional callback for file change events
 * @returns {Object} The file system watchers
 */
export function watchMigrationFiles(options = {}) {
  // Initialize hash tracking for existing files
  function initializeFileHashes(dir) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        initializeFileHashes(filePath);
      } else if (
        filePath.endsWith(".js") ||
        filePath.endsWith(".yml") ||
        filePath.endsWith(".sh") ||
        filePath.endsWith(".ts")
      ) {
        try {
          const fileHash = crypto
            .createHash("sha256")
            .update(fs.readFileSync(filePath))
            .digest("hex");
          fileHashes.set(filePath, fileHash);
        } catch (error) {
          console.error(`❌ Error hashing ${filePath}:`, error);
        }
      }
    }
  }

  // Initialize hashes for existing files
  initializeFileHashes("src/migrations");
  initializeFileHashes("src");

  const watchers = {
    // Set up the watcher for migrations
    migrations: watch(
      "src/migrations",
      { recursive: true },
      async (eventType, filename) => {
        if (!filename) return;

        const filePath = join("src/migrations", filename);

        // Skip if file doesn't exist (might have been deleted)
        if (!fs.existsSync(filePath)) {
          console.log(`❌ File no longer exists: ${filePath}`);
          return;
        }

        // Skip if not a file type we care about
        if (
          !filePath.endsWith(".js") &&
          !filePath.endsWith(".yml") &&
          !filePath.endsWith(".sh")
        ) {
          return;
        }

        // Check if content actually changed by comparing hashes
        try {
          const currentHash = crypto
            .createHash("sha256")
            .update(fs.readFileSync(filePath))
            .digest("hex");

          const previousHash = fileHashes.get(filePath);

          // Only process if file is new or contents changed
          if (previousHash !== currentHash) {
            console.log(`🔄 Detected change in ${filename}`);
            await processMigrationFile(filePath, options);
          }
        } catch (error) {
          console.error(`❌ Error checking file ${filePath}:`, error);
        }
      },
    ),

    // Set up the watcher for the entire src directory
    src: watch("src", { recursive: true }, async (eventType, filename) => {
      if (!filename) return;

      // Skip migrations directory as it's handled by the other watcher
      if (filename.startsWith("migrations/")) return;

      const filePath = join("src", filename);

      // Skip if file doesn't exist (might have been deleted)
      if (!fs.existsSync(filePath)) {
        console.log(`❌ File no longer exists: ${filePath}`);
        return;
      }

      // Skip if not a file type we care about
      if (
        !filePath.endsWith(".js") &&
        !filePath.endsWith(".ts") &&
        !filePath.endsWith(".mjs") &&
        !filePath.endsWith(".cjs")
      ) {
        return;
      }

      try {
        const currentHash = crypto
          .createHash("sha256")
          .update(fs.readFileSync(filePath))
          .digest("hex");

        const previousHash = fileHashes.get(filePath);

        // Only process if file is new or contents changed
        if (previousHash !== currentHash) {
          console.log(`🔄 Detected change in ${filename}`);
          fileHashes.set(filePath, currentHash);

          // Trigger a rebuild of the main bundle
          if (typeof options.onEvent === "function") {
            options.onEvent({
              type: "change",
              path: filePath,
              requiresRebuild: true,
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error checking file ${filePath}:`, error);
        if (typeof options.onEvent === "function") {
          options.onEvent({ error });
        }
      }
    }),
  };

  // Return an object with both watchers
  return {
    close: () => {
      watchers.migrations.close();
      watchers.src.close();
    },
  };
}

/**
 * Process all migration files
 * @param {Object} options - Configuration options
 * @param {boolean} options.isDev - Whether to use development build settings
 * @param {string[]} options.externalPackages - List of packages to keep external
 * @param {Object} options.aliases - Map of import aliases
 */
export async function processMigrations(options = {}) {
  try {
    // Step 1: Process migration JS files to inline their dependencies
    const migrationJsFiles = [];

    /**
     * Recursively finds all JavaScript files in a given directory.
     * @param {string} dir - The directory to search for JavaScript files.
     */
    function findJsFiles(dir) {
      if (!fs.existsSync(dir)) {
        return;
      }
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          findJsFiles(filePath);
        } else if (file.endsWith(".js")) {
          migrationJsFiles.push(filePath);
        }
      }
    }

    findJsFiles("src/migrations");

    // Process each migration JS file
    const migrationSpinner = ora(
      `Processing ${migrationJsFiles.length} migration JS files...`,
    ).start();

    for (const migrationFile of migrationJsFiles) {
      await processMigrationFile(migrationFile, options);
    }

    migrationSpinner.succeed(
      `Processed ${migrationJsFiles.length} migration JS files.`,
    );

    // Step 2: Copy migration .yml and .sh files
    const copySpinner = ora(
      "Copying migration configuration files (.yml, .sh)...",
    ).start();

    /**
     * Recursively finds and copies all .yml and .sh files from a source directory to a destination directory.
     * @param {string} srcDir - The source directory to search in.
     * @param {string} destDir - The destination directory to copy to.
     */
    function copyMigrationConfigFiles(srcDir, destDir) {
      if (!fs.existsSync(srcDir)) {
        return 0;
      }

      let copiedCount = 0;
      const items = fs.readdirSync(srcDir);

      for (const item of items) {
        const srcPath = join(srcDir, item);
        const destPath = join(destDir, item);

        if (fs.statSync(srcPath).isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          copiedCount += copyMigrationConfigFiles(srcPath, destPath);
        } else if (item.endsWith(".yml") || item.endsWith(".sh")) {
          // Always copy the file regardless if it exists or has changed
          fs.copyFileSync(srcPath, destPath);

          // Set executable permissions for shell scripts
          if (item.endsWith(".sh")) {
            try {
              fs.chmodSync(destPath, 0o755);
            } catch (chmodError) {
              console.error(
                `⚠️ Warning: Failed to set executable permissions on ${destPath}:`,
                chmodError,
              );
            }
          }

          copiedCount++;
        }
      }

      return copiedCount;
    }

    const copiedFiles = copyMigrationConfigFiles(
      "src/migrations",
      "dist/migrations",
    );
    copySpinner.succeed(
      `Copied ${copiedFiles} migration configuration files (.yml, .sh).`,
    );
  } catch (error) {
    console.error("❌ Failed to process migrations:", error);
    throw error;
  }
}
