import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
/* eslint-disable no-underscore-dangle, no-await-in-loop, no-magic-numbers */
import { build } from "esbuild";

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

// Parse command line arguments to check for development mode
const isDevelopmentMode = process.argv.includes("--dev");

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

		// Step 3: Bundle the application in a single file
		console.log(
			isDev
				? "🛠️ Building in DEVELOPMENT mode..."
				: "🚀 Building in PRODUCTION mode...",
		);

		const buildConfig = {
			entryPoints: ["src/index.js"],
			bundle: true,
			platform: "node",
			target: "node18",
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
				// Handle dynamic requires of node modules
				"node:*",
			],
			// Prevent bundling Node.js built-ins
			packages: "external",
			loader: {
				".node": "file",
			},
			mainFields: ["module", "main"],
			metafile: true,
			allowOverwrite: true,
			// Support aliased imports from package.json
			alias: {
				"#configs": resolve(__dirname, "src/configs"),
				"#commands": resolve(__dirname, "src/commands"),
				"#scripts": resolve(__dirname, "src/scripts"),
				"#utils": resolve(__dirname, "src/utils"),
			},
		};

		// Apply development or production specific settings
		if (isDev) {
			// Development mode settings for easier debugging
			buildConfig.minify = false;
			buildConfig.sourcemap = true;
			buildConfig.logLevel = "debug";
			buildConfig.treeShaking = false;
			// No aggressive bundling in dev mode
		} else {
			// Production mode settings
			buildConfig.minify = true;
			buildConfig.sourcemap = "external";
			buildConfig.logLevel = "info";
			buildConfig.treeShaking = true;
			buildConfig.legalComments = "none";
		}

		const result = await build(buildConfig);

		// Step 4: Process migration JS files to inline their dependencies
		// Find all JS files in the migrations folder
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
			const migrationBuildConfig = {
				entryPoints: [migrationFile],
				bundle: true,
				platform: "node",
				target: "node18",
				outfile: outputFile,
				format: "esm",
				// Keep only external package dependencies
				external: [
					...externalPackages,
					// Handle dynamic requires of node modules
					"node:*",
				],
				// Prevent bundling Node.js built-ins
				packages: "external",
				allowOverwrite: true,
				// Support utils/ imports and other local imports
				alias: {
					"#utils": resolve(__dirname, "src/utils"),
					"#scripts": resolve(__dirname, "src/scripts"),
					"#commands": resolve(__dirname, "src/commands"),
				},
			};

			// Apply development or production specific settings for migrations
			if (isDev) {
				// Development mode settings for migrations
				migrationBuildConfig.minify = false;
				migrationBuildConfig.sourcemap = true;
				migrationBuildConfig.logLevel = "debug";
				migrationBuildConfig.treeShaking = false;
			} else {
				// Production mode settings for migrations
				migrationBuildConfig.minify = true;
				migrationBuildConfig.sourcemap = false;
				migrationBuildConfig.legalComments = "none";
				migrationBuildConfig.treeShaking = true;
			}

			await build(migrationBuildConfig);
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

		if (isDev) {
			console.log("✅ Build complete with development-friendly distribution!");
		} else {
			console.log("✅ Build complete with optimized distribution!");
		}
	} catch (error) {
		console.error("❌ Build failed:", error);
		process.exit(1);
	}
}

// Execute the build with development mode if --dev flag is present
runBuild(isDevelopmentMode);
