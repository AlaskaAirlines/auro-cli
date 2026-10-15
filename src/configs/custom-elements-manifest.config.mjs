import { deprecatedProseToFieldPlugin } from "@aurodesignsystem/auro-library/scripts/build/deprecatedProseToFieldPlugin.mjs";
import { cemSorterPlugin } from "@wc-toolkit/cem-sorter";
import { jsxTypesPlugin } from "@wc-toolkit/jsx-types";
import { categoryPlugin } from "#scripts/cem/categoryPlugin.mjs";
import { internalPlugin } from "#scripts/cem/internalPlugin.mjs";
import { numericBoundsPlugin } from "#scripts/cem/numericBoundsPlugin.mjs";
import { privateAttributesPlugin } from "#scripts/cem/privateAttributesPlugin.mjs";
import { readonlyAttributesPlugin } from "#scripts/cem/readonlyAttributesPlugin.mjs";
import { relevantWhenPlugin } from "#scripts/cem/relevantWhenPlugin.mjs";
import { requiredWhenPlugin } from "#scripts/cem/requiredWhenPlugin.mjs";
import addDtsExportsPlugin from "#scripts/docs/plugins/addDtsExportsPlugin";
import forcePrivatePlugin from "#scripts/docs/plugins/forcePrivatePlugin";

export default {
  globs: ["src/**/*.*js", "scripts/wca/**/*.*js"],
  litelement: true,
  packagejson: true,
  dependencies: true,
  quiet: true,
  plugins: [
    // These run before the sorter and JSX types, so the generated types match the cleaned-up manifest
    deprecatedProseToFieldPlugin(),
    numericBoundsPlugin(),
    requiredWhenPlugin(),
    relevantWhenPlugin(),
    categoryPlugin(),
    readonlyAttributesPlugin(),
    privateAttributesPlugin(),
    internalPlugin(),
    cemSorterPlugin({
      deprecatedLast: true,
    }),
    jsxTypesPlugin({
      fileName: "index.d.ts",
      outdir: "dist",
      excludeCssCustomProperties: true,
    }),
    addDtsExportsPlugin(),
    forcePrivatePlugin(),
  ],
};
