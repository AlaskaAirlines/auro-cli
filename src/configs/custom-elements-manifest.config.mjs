import { cemSorterPlugin } from "@wc-toolkit/cem-sorter";

export default {
  globs: ["src/*.*js", "scripts/wca/**/*.*js"],
  litelement: true,
  packagejson: true,
  dependencies: true,
  plugins: [
    cemSorterPlugin({
      deprecatedLast: true,
      customFields: ["customProperty"],
    }),
  ],
};