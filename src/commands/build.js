import { nodeResolve } from "@rollup/plugin-node-resolve";
import { program } from "commander";
import { rollup } from "rollup";

/**
 * Build the component using Rollup.
 */
async function buildWithRollup() {
	try {
		// Create a bundle
		const bundle = await rollup({
			input: ["./src/index.js", "./src/registered.js"],
			external: [
				"lit",
				"@lit/reactive-element",
				"lit-html",
				"lit/decorators.js",
				"lit/static-html.js",
				"lit/directives/repeat.js",
				"lit/directives/class-map.js",
				"lit/directives/if-defined.js",
			],
			plugins: [
				nodeResolve({
					dedupe: ["lit", "lit-element", "lit-html"],
					preferBuiltins: false,
					moduleDirectories: ["node_modules"],
				}),
			],
		});

		// Write the bundle to disk
		await bundle.write({
			format: "esm",
			dir: "./dist",
			entryFileNames: "[name].js",
		});

		// Close the bundle
		await bundle.close();
	} catch (error) {
		throw new Error(`Rollup build failed: ${error.message}`);
	}
}

export default program
	.command("build")
	.description("Builds auro components")
	.action(async () => {
		try {
			console.log("Building component...");

			// Create and execute rollup build
			await buildWithRollup();

			console.log("Build completed successfully! Files written to ./dist");
		} catch (error) {
			console.error("Build failed:", error);
			process.exit(1);
		}
	});
