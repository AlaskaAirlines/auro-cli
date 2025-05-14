import crypto from "node:crypto";
import fs from "node:fs";
import { watch } from "node:fs";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import ora from "ora";

// Store file hashes for detecting changes
const fileHashes = new Map();

// File extension definitions
const FILE_EXTENSIONS = {
  SCRIPT: [".js", ".ts", ".mjs", ".cjs"],
  CONFIG: [".yml"],
  SHELL: [".sh"],
};

/**
 * Checks if a file has a script extension
 * @param {string} filePath - The path to check
 * @returns {boolean} Whether the file has a script extension
 */
function isScriptFile(filePath) {
  return FILE_EXTENSIONS.SCRIPT.some((ext) => filePath.endsWith(ext));
}

/**
 * Checks if a file has a shell script extension
 * @param {string} filePath - The path to check
 * @returns {boolean} Whether the file has a shell script extension
 */
function isShellScript(filePath) {
  return FILE_EXTENSIONS.SHELL.some((ext) => filePath.endsWith(ext));
}

/**
 * Checks if a file has a configuration extension
 * @param {string} filePath - The path to check
 * @returns {boolean} Whether the file has a configuration extension
 */
function isConfigFile(filePath) {
  return FILE_EXTENSIONS.CONFIG.some((ext) => filePath.endsWith(ext));
}

/**
 * Checks if a file should be processed (has any relevant extension)
 * @param {string} filePath - The path to check
 * @returns {boolean} Whether the file should be processed
 */
function isProcessableFile(filePath) {
  return [
    ...FILE_EXTENSIONS.SCRIPT,
    ...FILE_EXTENSIONS.CONFIG,
    ...FILE_EXTENSIONS.SHELL,
  ].some((ext) => filePath.endsWith(ext));
}

/**
 * Checks if a file is a JavaScript file that needs to be bundled
 * @param {string} filePath - The path to check
 * @returns {boolean} Whether the file is a bundleable JavaScript file
 */
function isBundleableJsFile(filePath) {
  return [".js", ".mjs", ".cjs"].some((ext) => filePath.endsWith(ext));
}

/**
 * Sets executable permissions for shell scripts
 * @param {string} filePath - The path to the file
 * @param {string} outputFile - The output file path
 */
function setExecutablePermissions(filePath, outputFile) {
  if (isShellScript(filePath)) {
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
    const outputFile = filePath.replace(
      /^src\/(migrations|configs)/,
      "dist/$1",
    );
    const outputDir = dirname(outputFile);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (isBundleableJsFile(filePath)) {
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
    } else if (isConfigFile(filePath) || isShellScript(filePath)) {
      // Copy configuration file
      fs.copyFileSync(filePath, outputFile);

      // Set executable permissions for shell scripts
      setExecutablePermissions(filePath, outputFile);
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
      } else if (isProcessableFile(filePath)) {
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
  initializeFileHashes("src/configs");
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
        if (!isProcessableFile(filePath)) {
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

    // Set up the watcher for configs
    configs: watch(
      "src/configs",
      { recursive: true },
      async (eventType, filename) => {
        if (!filename) return;

        const filePath = join("src/configs", filename);

        // Skip if file doesn't exist (might have been deleted)
        if (!fs.existsSync(filePath)) {
          console.log(`❌ File no longer exists: ${filePath}`);
          return;
        }

        // Skip if not a file type we care about
        if (!isProcessableFile(filePath)) {
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

      // Skip migrations and configs directories as they're handled by other watchers
      if (filename.startsWith("migrations/") || filename.startsWith("configs/"))
        return;

      const filePath = join("src", filename);

      // Skip if file doesn't exist (might have been deleted)
      if (!fs.existsSync(filePath)) {
        console.log(`❌ File no longer exists: ${filePath}`);
        return;
      }

      // Skip if not a file type we care about
      if (!isScriptFile(filePath)) {
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

  // Return an object with all watchers
  return {
    close: () => {
      watchers.migrations.close();
      watchers.configs.close();
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
    // Step 1: Process JS files to inline their dependencies
    const jsFiles = [];

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
        } else if (isBundleableJsFile(filePath)) {
          jsFiles.push(filePath);
        }
      }
    }

    findJsFiles("src/migrations");
    findJsFiles("src/configs");

    // Process each JS file
    const jsSpinner = ora(`Processing ${jsFiles.length} JS files...`).start();

    for (const jsFile of jsFiles) {
      await processMigrationFile(jsFile, options);
    }

    jsSpinner.succeed(`Processed ${jsFiles.length} JS files.`);

    // Step 2: Copy .yml and .sh files
    const copySpinner = ora(
      "Copying configuration files (.yml, .sh)...",
    ).start();

    /**
     * Recursively finds and copies all .yml and .sh files from a source directory to a destination directory.
     * @param {string} srcDir - The source directory to search in.
     * @param {string} destDir - The destination directory to copy to.
     */
    function copyConfigFiles(srcDir, destDir) {
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
          copiedCount += copyConfigFiles(srcPath, destPath);
        } else if (isConfigFile(srcPath) || isShellScript(srcPath)) {
          // Always copy the file regardless if it exists or has changed
          fs.copyFileSync(srcPath, destPath);

          // Set executable permissions for shell scripts
          setExecutablePermissions(srcPath, destPath);

          copiedCount++;
        }
      }

      return copiedCount;
    }

    const migrationCopiedFiles = copyConfigFiles(
      "src/migrations",
      "dist/migrations",
    );

    const configCopiedFiles = copyConfigFiles("src/configs", "dist/configs");

    copySpinner.succeed(
      `Copied ${migrationCopiedFiles + configCopiedFiles} configuration files (.yml, .sh).`,
    );
  } catch (error) {
    console.error("❌ Failed to process files:", error);
    throw error;
  }
}
