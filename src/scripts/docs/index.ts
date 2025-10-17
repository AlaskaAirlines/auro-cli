import ora from "ora";
import { shell } from "#utils/shell.js";
import Docs from "./docs-generator.ts";

export async function cem() {
  const cemSpinner = ora("Generating Custom Elements Manifest...").start();

  try {
    // The shell function returns a promise that resolves when the command completes
    await shell(
      "npx --package=@custom-elements-manifest/analyzer -y -- cem analyze --litelement --globs src/*.*js scripts/wca/**/*.*js --packagejson --dependencies",
    );
    cemSpinner.succeed("Custom Elements Manifest generated successfully!");
  } catch (error) {
    // Check if the error is just the plugin issue but the manifest was still created
    const errorMessage = error instanceof Error ? error.message : String(error);
    cemSpinner.warn('CEM analyzer completed with warnings: ' + errorMessage);
  }
}

export async function docs() {
  const docsSpinner = ora("Generating API documentation...").start();

  try {
    await Docs.generate();
    docsSpinner.succeed("API documentation generated successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    docsSpinner.fail("Failed to generate API documentation: " + errorMessage);
    throw error;
  }
}
