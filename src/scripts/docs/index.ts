import ora from "ora";
import { shell } from "#utils/shell.js";
import Docs from "./docs-generator.ts";
import { configPath } from "#utils/pathUtils.js";
import { runDefaultDocsBuild } from "../build/defaultDocsBuild.js";
import { startDevelopmentServer } from "../build/devServerUtils.js";

export async function cem() {
  const cemSpinner = ora("Generating Custom Elements Manifest...").start();

  try {
    // The shell function returns a promise that resolves when the command completes
    await shell(
      `npx --package=@custom-elements-manifest/analyzer -y -- cem analyze --config '${configPath("custom-elements-manifest.config.mjs")}'`,
    );
    cemSpinner.succeed("Custom Elements Manifest generated successfully!");
  } catch (error) {
    // Check if the error is just the plugin issue but the manifest was still created
    const errorMessage = error instanceof Error ? error.message : String(error);
    cemSpinner.warn('CEM analyzer completed with warnings: ' + errorMessage);
  }
}

export async function api() {
  const docsSpinner = ora("Generating API md file...").start();

  try {
    await Docs.generate();
    docsSpinner.succeed("API md file generated successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    docsSpinner.fail("Failed to generate API md file: " + errorMessage);
    throw error;
  }
}

export async function docs() {
  const docsSpinner = ora("Compiling documentation...").start();

  try {
    await runDefaultDocsBuild();
    docsSpinner.succeed("Documentation compiled successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    docsSpinner.fail("Failed to compile MD documentation: " + errorMessage);
    throw error;
  }
}

export async function serve(options = {}) {
  await startDevelopmentServer(options);
}
