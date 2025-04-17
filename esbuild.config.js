/* eslint-disable no-underscore-dangle, no-await-in-loop, no-magic-numbers, no-undef */
import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Core Node.js modules that should remain external
const nodeBuiltins = [
  "node:path",
  "node:process",
  "node:fs",
  "node:child_process",
  "node:fs/promises",
  "node:url",
  "node:util",
  "path",
  "fs",
  "util",
  "process",
  "url",
  "child_process",
  "fs/promises",
];

// List of external dependencies that should not be bundled
const externalDependencies = [
  // Core external dependencies that should remain separate
  "@aurodesignsystem/auro-library/*",
  "commander",
  "@web/dev-server",
  "@open-wc/dev-server-hmr",
  "gradient-string",
  "figlet",
  "inquirer",
  "simple-git",
  "glob",
];

// Create the final list of external packages
const externalPackages = [...nodeBuiltins, ...externalDependencies];

// Custom build steps for optimizing the distribution
/**
 *
 */
async function runBuild() {
  try {
    // Step 1: Ensure dist directory exists
    if (!fs.existsSync("dist")) {
      fs.mkdirSync("dist", { recursive: true });
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

    // Step 3: Bundle the application in a single optimized file
    const result = await build({
      entryPoints: ["src/index.js"],
      bundle: true,
      platform: "node",
      target: "node18",
      minify: true,
      outfile: "dist/auro-cli.js",
      format: "esm",
      banner: {
        js: "#!/usr/bin/env node",
      },
      external: [
        ...externalPackages,
        // Ensure migrations are kept external
        "./migrations/*",
        "../migrations/*",
      ],
      logLevel: "info",
      loader: {
        ".node": "file",
      },
      mainFields: ["module", "main"],
      treeShaking: true,
      metafile: true,
      sourcemap: "external",
      // Additional options for more aggressive bundling
      allowOverwrite: true,
      legalComments: "none",
      // Support aliased imports from package.json
      alias: {
        "#commands": resolve(__dirname, "src/commands"),
        "#scripts": resolve(__dirname, "src/scripts"),
        "#utils": resolve(__dirname, "src/utils"),
      },
    });

    // Step 4: Process migration JS files to inline their dependencies
    // Find all JS files in the migrations folder
    const migrationJsFiles = [];

    /**
     * Recursively finds all JavaScript files in a given directory.
     * @param {string} dir - The directory to search for JavaScript files.
     */
    function findJsFiles(dir) {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const filePath = join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          findJsFiles(filePath);
        } else if (file.endsWith(".js")) {
          migrationJsFiles.push(filePath);
        }
      });
    }

    // Find all JS files in src/migrations
    findJsFiles("src/migrations");

    // Process each migration JS file
    console.log(
      `🔄 Processing ${migrationJsFiles.length} migration JS files...`,
    );

    for (const migrationFile of migrationJsFiles) {
      // Calculate output path - replacing 'src/migrations' with 'dist/migrations'
      const outputFile = migrationFile.replace(
        "src/migrations",
        "dist/migrations",
      );

      // Ensure directory exists
      const outputDir = dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Bundle the migration file with its dependencies
      await build({
        entryPoints: [migrationFile],
        bundle: true,
        platform: "node",
        target: "node18",
        outfile: outputFile,
        format: "esm",
        // Keep only external package dependencies
        external: externalPackages,
        minify: true,
        sourcemap: false,
        legalComments: "none",
        treeShaking: true,
        // Support utils/ imports and other local imports
        alias: {
          "#utils": resolve(__dirname, "src/utils"),
        },
      });
    }

    // Step 5: Fix any issues with the main bundle
    const mainBundlePath = "dist/auro-cli.js";
    if (fs.existsSync(mainBundlePath)) {
      // Set executable permissions (rwxr-xr-x)
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

    // Step 6: Report build stats
    if (result.metafile) {
      const bundleSize = fs.statSync("dist/auro-cli.js").size;
      console.log(`🔹 Main bundle size: ${(bundleSize / 1024).toFixed(2)}kb`);
    }

    console.log("✅ Build complete with optimized distribution!");
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

// Execute the build
runBuild();
