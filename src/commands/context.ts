import fs from "node:fs/promises";
import path from "node:path";
import { program } from "commander";
import ora from "ora";
import { AURO_CONTEXT } from "#static/auroContext.js";

export default program
  .command("context")
  .description(
    "Generate an AI assistant context document for the Auro Design System",
  )
  .option(
    "-o, --output <path>",
    "Write context to a file instead of stdout (e.g. AURO_CONTEXT.md)",
  )
  .action(async (options) => {
    if (options.output) {
      const spinner = ora(`Writing context to ${options.output}...`).start();
      try {
        const outputPath = path.resolve(process.cwd(), options.output);
        await fs.writeFile(outputPath, AURO_CONTEXT, "utf-8");
        spinner.succeed(`Auro context written to ${options.output}`);
        console.log(
          "\nPaste this file into your AI coding tool (Claude, Cursor, Copilot, etc.) to prime it on Auro components.",
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        spinner.fail(`Failed to write context: ${message}`);
        process.exit(1);
      }
    } else {
      process.stdout.write(AURO_CONTEXT);
    }
  });
