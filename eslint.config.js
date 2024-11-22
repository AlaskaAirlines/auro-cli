import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import path from "node:path";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import babelParser from "@babel/eslint-parser";

const dirname = path.dirname(new URL(import.meta.url).pathname);
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
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          presets: ["@babel/preset-env"],
        },
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];
