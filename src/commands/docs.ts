import { program } from "commander";
import { api, cem, docs, serve, watchDocs } from "#scripts/docs/index.ts";
import { withServerOptions } from "#commands/_sharedOptions.js";

let docsCommand = program
  .command("docs")
  .description("Generate API documentation")
  .option("-c, --cem", "Generate Custom Elements Manifest (CEM) file", false)
  .option("-a, --api", "Creates api md file from CEM", false)
  .option("-w, --watch", "Watch for changes and rebuild docs", false)
  .option("-r, --readme-template <url>", "URL to the README template file")
  .option("--skip-readme", "Skip README.md processing", false)
  
  docsCommand = withServerOptions(docsCommand);

  export default docsCommand.action(async (options) => {

    if (options.cem) {
      await cem();
    }

    if (options.api) {
      await api();
    }

    await docs(options);

    if( options.serve ) {
        await serve(options);
    }

    if (options.watch) {
        await watchDocs(options);
    }

  });
