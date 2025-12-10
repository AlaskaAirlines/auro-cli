import fs from "node:fs/promises";
import type { Export, Module, Package } from "custom-elements-manifest";

export default function addDtsExportsPlugin() {
  return {
    // Make sure to always give your plugin a name! This helps when debugging
    name: "add-dts-exports-plugin",
    packageLinkPhase({
      customElementsManifest,
    }: {
      customElementsManifest: Package;
    }) {
      // find modules where path matches 'src/index.js'
      const exportedModules: Module[] = customElementsManifest.modules.filter(
        (mod: Module) => mod.path.endsWith("src/index.js"),
      );

      if (exportedModules.length === 0) {
        console.warn(
          "No module found with path ending in 'src/index.js'. Skipping export statement addition.",
        );
        return;
      }

      const exportNames: string[] = [];

      // collect all export names
      const firstModule = exportedModules[0];
      if (!firstModule.exports || firstModule.exports.length === 0) {
        console.warn(
          "No exports found for 'src/index.js'. Skipping export statement addition.",
        );
        return;
      }

      firstModule.exports.forEach((exp: Export) => {
        exportNames.push(exp.name);
      });

      // construct export statement
      const exportStatement = `declare global {
  namespace svelteHTML {
    interface IntrinsicElements extends CustomElements {}
  } 
}\n

export { ${exportNames.join(", ")} } from "./index.js";\n`;

      // append export statement to dist/index.d.ts
      fs.appendFile("dist/index.d.ts", exportStatement)
        .then(() => {
          console.info("Appended export statements to index.d.ts");
        })
        .catch((err: Error) => {
          console.error(`Error appending to index.d.ts: ${err.message}`);
        });
    },
  };
}
