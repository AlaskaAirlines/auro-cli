import { cemSorterPlugin } from "@wc-toolkit/cem-sorter";
import { jsxTypesPlugin } from "@wc-toolkit/jsx-types";
import fs from "fs/promises";

function addDtsExportsPlugin() {
  return {
    // Make sure to always give your plugin a name! This helps when debugging
    name: 'add-dts-exports-plugin',
    packageLinkPhase({customElementsManifest}){

      // find modules where path matches 'src/index.js'
      const exportedModules = customElementsManifest.modules.filter(
        (mod) => mod.path.endsWith("src/index.js")
      );

      const exportNames = [];

      // collect all export names
      exportedModules[0].exports.forEach((exp) => {
        exportNames.push(exp.name);
      });

      if (exportNames.length === 0) {
        console.warn(
          "No exports found for 'src/index.js'. Skipping export statement addition."
        );
        return;
      }

      // construct export statement
      const exportStatement = `declare global {
  namespace svelteHTML {
    interface IntrinsicElements extends CustomElements {}
  } 
}\n

export { ${exportNames.join(', ')} } from "./index.js";\n`;

      // append export statement to dist/index.d.ts
      fs.appendFile('dist/index.d.ts', exportStatement).then(() => {
        console.info('Appended export statements to index.d.ts');
      }).catch((err) => {
        console.error(`Error appending to index.d.ts: ${err.message}`);
      });

    },
  }
}

export default {
  globs: ["src/**/*.*js", "scripts/wca/**/*.*js"],
  litelement: true,
  packagejson: true,
  dependencies: true,
  quiet: true,
  plugins: [
    cemSorterPlugin({
      deprecatedLast: true,
    }),
    jsxTypesPlugin({
      fileName: "index.d.ts",
      outdir: "dist",
      excludeCssCustomProperties: true
    }),
    addDtsExportsPlugin(),
  ],
};