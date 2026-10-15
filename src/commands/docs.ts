import process from "node:process";
import { program } from "commander";
import ora from "ora";
import { withServerOptions } from "#commands/_sharedOptions.js";
import { api, cem, docs, serve, watchDocs } from "#scripts/docs/index.ts";
import { codeConnect } from "#scripts/figma/code-connect.ts";

let docsCommand = program
  .command("docs")
  .description("Generate API documentation")
  .option(
    "-c, --cem",
    "Generate Custom Elements Manifest (CEM) file, then the Code Connect files (dist/figma/<tag>.figma.ts, figma/<tag>.mismatch.md, figma/<tag>.translate.md) for components in the Figma connector config. The Figma data is fetched with FIGMA_ACCESS_TOKEN; without it Code Connect is skipped with a warning",
    false,
  )
  .option("-a, --api", "Creates api md file from CEM", false)
  .option("-w, --watch", "Watch for changes and rebuild docs", false)
  .option("-r, --readme-template <url>", "URL to the README template file")
  .option("--skip-readme", "Skip README.md processing", false)
  .option(
    "--figma-check",
    "For CI: only check the Code Connect files; write nothing and exit 1 if the translate or mismatch file is out of date",
    false,
  );

docsCommand = withServerOptions(docsCommand);

/** Options accepted by the `docs` action (the server options pass through). */
export interface DocsOptions {
  cem?: boolean;
  api?: boolean;
  watch?: boolean;
  serve?: boolean;
  readmeTemplate?: string;
  skipReadme?: boolean;
  figmaCheck?: boolean;
  [key: string]: unknown;
}

/** The docs steps `runDocs` drives. Overridable so tests can stub them. */
export interface DocsSteps {
  cem: typeof cem;
  api: typeof api;
  docs: typeof docs;
  serve: typeof serve;
  watchDocs: typeof watchDocs;
  /** Code Connect build; defaults to the real one when a test does not stub it. */
  codeConnect?: typeof codeConnect;
}

/** The real docs steps. Exported so tests can stub them on the registered command. */
export const defaultDocsSteps: DocsSteps = {
  cem,
  api,
  docs,
  serve,
  watchDocs,
  codeConnect,
};

/** Carries the Code Connect exit code past the catch-all that exits 1. */
class CodeConnectFailure extends Error {
  code: number;

  constructor(code: number) {
    super(`Code Connect exited with ${code}`);
    this.code = code;
  }
}

/**
 * Run the `docs` command. Exits 1 if any step fails, except that in watch mode
 * a docs build failure is reported and the server and watcher still start, so
 * fixing the docs triggers a rebuild. `--figma-check` skips everything else and
 * exits with the Code Connect result (0 current, 1 stale, 2 bad input).
 */
export async function runDocs(
  options: DocsOptions,
  steps: DocsSteps = defaultDocsSteps,
): Promise<void> {
  const connect = steps.codeConnect ?? codeConnect;

  if (options.figmaCheck) {
    const code = await connect({ check: true });
    if (code !== 0) {
      process.exit(code);
    }
    return;
  }

  try {
    if (options.cem) {
      await steps.cem();

      // Code Connect reads the CEM just built, so it runs only with --cem.
      const code = await connect({});
      if (code !== 0) {
        throw new CodeConnectFailure(code);
      }
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
    if (error instanceof CodeConnectFailure) {
      process.exit(error.code);
    }
    ora().fail(
      `Docs failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// Commander calls the action as `(options, command)`, so wrap runDocs rather
// than passing it directly, which would make the Command object its `steps`.
export default docsCommand.action((options: DocsOptions) => runDocs(options));
