import { program } from "commander";
import { cem, docs } from "#scripts/docs/index.ts";

export const docsCommand = program
  .command("docs")
  .description("Generate API documentation")
  .option("-c, --cem", "Generate Custom Elements Manifest (CEM) file", false)
  .action(async (options) => {

    if (options.cem) {
      await cem();
    }

    await docs();
  });
