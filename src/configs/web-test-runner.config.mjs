import { rollupAdapter } from "@web/dev-server-rollup";
import { litScss } from "rollup-plugin-scss-lit";

export default {
  files: "test/**/*.test.js",
  nodeResolve: true,
  coverageConfig: {
    threshold: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    reporters: ["html"],
  },
  mimeTypes: {
    "**/*.scss": "js",
  },
  plugins: [
    rollupAdapter(
      litScss({
        options: {
          loadPaths: ["../../node_modules", "../node_modules", "node_modules"],
        },
      }),
    ),
  ],
  testRunnerHtml: (testFramework) => `<html>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aurodesignsystem/design-tokens@latest/dist/auro-classic/CSSCustomProperties.css">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aurodesignsystem/design-tokens@latest/dist/alaska/CSSCustomProperties--alaska.css">
      </head>
      <body>
        <script type="module" src="${testFramework}"></script>
      </body>
    </html>`,
};
