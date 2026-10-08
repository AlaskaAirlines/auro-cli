import { program } from "commander";
import ora from "ora";
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

/** Options accepted by the `docs` action (the server options pass through). */
export interface DocsOptions {
  cem?: boolean;
  api?: boolean;
  watch?: boolean;
  serve?: boolean;
  readmeTemplate?: string;
  skipReadme?: boolean;
  [key: string]: unknown;
}

/** The docs steps `runDocs` drives. Overridable so tests can stub them. */
export interface DocsSteps {
  cem: typeof cem;
  api: typeof api;
  docs: typeof docs;
  serve: typeof serve;
  watchDocs: typeof watchDocs;
}

/** The real docs steps. Exported so tests can stub them on the registered command. */
export const defaultDocsSteps: DocsSteps = { cem, api, docs, serve, watchDocs };

/**
 * Run the `docs` command. Exits 1 if any step fails, except that in watch mode
 * a docs build failure is reported and the server and watcher still start, so
 * fixing the docs triggers a rebuild.
 */
export async function runDocs(
  options: DocsOptions,
  steps: DocsSteps = defaultDocsSteps,
): Promise<void> {
  try {
    if (options.cem) {
      await steps.cem();
    }

    if (options.api) {
      await steps.api();
    }

    try {
      await steps.docs(options);
    } catch (error) {
      // docs() has already reported the failure. In watch mode keep going,
      // so fixing the docs triggers a rebuild.
      if (!options.watch) {
        throw error;
      }
    }

    if (options.serve) {
      await steps.serve(options);
    }

    if (options.watch) {
      await steps.watchDocs(options);
    }
  } catch (error) {
    ora().fail(`Docs failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Commander calls the action as `(options, command)`, so wrap runDocs rather
// than passing it directly, which would make the Command object its `steps`.
export default docsCommand.action((options: DocsOptions) => runDocs(options));
