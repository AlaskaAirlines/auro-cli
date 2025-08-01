import path from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

const __filename = fileURLToPath(import.meta.url);
const cliRootDir = path.resolve(path.dirname(__filename), "..");

function migrationTemplateDir(...paths) {
  return path.join(
    cliRootDir,
    "docs-head-content-update",
    "template",
    ...paths,
  );
}

/**
 * Creates modify actions for all HTML files in the demo directory
 * @param {string} pattern - The regex pattern to match in the files
 * @param {string} templateFile - The template file to use for replacement
 * @returns {Array} Array of modify actions for each HTML file
 */
function createHtmlModifyActions(pattern, templateFile, auroComponent) {
  const actions = [];

  // Find all HTML files in the demo directory
  const htmlFiles = globSync("demo/**/*.html", { absolute: false });

  // Create a modify action for each HTML file
  for (const htmlFilePath of htmlFiles) {
    actions.push({
      type: "modify",
      pattern: pattern,
      path: htmlFilePath,
      templateFile: templateFile,
      data: {
        name: auroComponent,
      },
    });
  }

  return actions;
}

/**
 *
 * @param {import("plop").NodePlopAPI} plop
 */
export default async function (plop) {
  // gets the package.json file from the current working directory
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const packageJson = await import(packageJsonPath, {
    assert: { type: "json" },
  });
  const auroComponent = packageJson.default.name.replace(
    /^@aurodesignsystem/,
    "",
  ); // Extract component name from package.json

  plop.setGenerator("component-generator", {
    prompts: [],
    actions: (data) => {
      /** @type {import("plop").ActionType[]} */
      const actions = [];

      actions.push("Updating html files...");

      // Create modify actions for all HTML files in the demo directory
      const headPattern = /<head\b[^>]*>([\s\S]*?)<\/head>/i;
      const headTemplate = migrationTemplateDir("head.html.hbs");

      // Add all the HTML file modification actions
      const htmlModifyActions = createHtmlModifyActions(
        headPattern,
        headTemplate,
        auroComponent,
      );
      actions.push(...htmlModifyActions);

      return actions;
    },
  });
}
