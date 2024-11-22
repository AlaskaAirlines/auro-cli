import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import path from "node:path";
import { fileURLToPath } from "url";
import babelConfig from "./babelConfig.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...compat.extends("@aurodesignsystem/eslint-config"),
  eslintPluginPrettierRecommended,
  {
    languageOptions: babelConfig,
    rules: {
      "no-console": "off",
    },
  },
];
