import { nodeResolve } from "@rollup/plugin-node-resolve";
import { program } from "commander";
import { rollup } from "rollup";
import { dts } from "rollup-plugin-dts";
import { litScss } from "rollup-plugin-scss-lit";

/**
 * Build the component using Rollup.
 */
async function buildWithRollup(options) {
  const { modulePath } = options;

  console.log("Load paths:", modulePath);

  try {
    // Create a bundle
    const create_dist = await rollup({
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
        litScss({
          minify: { fast: true },
          options: { loadPaths: [modulePath] },
        }),
      ],
    });

    // Write the bundle to disk
    await create_dist.write({
      format: "esm",
      dir: "./dist",
      entryFileNames: "[name].js",
    });

    await create_dist.close();

    const create_dts = await rollup({
      input: ["./dist/index.js"],
      plugins: [dts()],
    });
    await create_dts.write({
      format: "esm",
      dir: "./dist",
      entryFileNames: "[name].d.ts",
    });

    await create_dts.close();
  } catch (error) {
    throw new Error(`Rollup build failed: ${error.message}`);
  }
}

export default program
  .command("build")
  .description("Builds auro components")
  .option(
    "-p, --module-path <string>",
    "Path to node_modules folder",
    "node_modules",
  )
  .action(async (options) => {
    try {
      console.log("Building component...");

      // Create and execute rollup build
      await buildWithRollup(options);

      console.log("Build completed successfully! Files written to ./dist");
    } catch (error) {
      console.error("Build failed:", error);
      process.exit(1);
    }
  });
