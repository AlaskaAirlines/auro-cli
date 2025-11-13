import { program } from "commander";
import { api, cem, docs, serve } from "#scripts/docs/index.ts";
import { withServerOptions } from "#commands/_sharedOptions.js";

let docsCommand = program
  .command("docs")
  .description("Generate API documentation")
  .option("-c, --cem", "Generate Custom Elements Manifest (CEM) file", false)
  .option("-a, --api", "Creates api md file from CEM", false)
  
  docsCommand = withServerOptions(docsCommand);

  export default docsCommand.action(async (options) => {

    if (options.cem) {
      await cem();
    }

    if (options.api) {
      await api();
    }

    await docs();

    if( options.serve ) {
        await serve(options);
    }

  });
