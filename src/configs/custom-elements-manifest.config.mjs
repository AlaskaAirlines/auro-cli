import { cemSorterPlugin } from "@wc-toolkit/cem-sorter";
import { jsxTypesPlugin } from "@wc-toolkit/jsx-types";

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
      defaultExport: true,
      excludeCssCustomProperties: true,
    })
  ],
};