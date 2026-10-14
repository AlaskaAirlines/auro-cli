/**
 * Code Connect, run by `auro docs --figma` for the components in the Figma connector
 * config. It first fetches the Figma data from the Figma API (needs `FIGMA_ACCESS_TOKEN`)
 * and saves it in `figma/snapshots/`. From the built `custom-elements.json`, that
 * data and `figma/<tag>.translate.md` it then writes the CEM map and
 * `<tag>.figma.ts` (gitignored, in `dist/figma/`), tops up the translate file with
 * `TBD` rows for new gaps, and refreshes `figma/<tag>.mismatch.md`.
 *
 * `check` writes nothing and never fetches (it reads the saved data): it exits 1 when the translate or mismatch
 * file is out of date (for CI).
 *
 * Exit codes: 0 ok, 1 stale (`check` only), 2 bad input.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { run as buildFigma } from "#scripts/figma/build-figma.mjs";
import { run as buildMismatch } from "#scripts/figma/build-mismatch.mjs";
import { run as buildTranslate } from "#scripts/figma/build-translate.mjs";
import { resolveFigmaContext, runSteps } from "#scripts/figma/context.js";
import { run as fetchFigma } from "#scripts/figma/fetch-figma.mjs";
import { run as genCemMap } from "#scripts/figma/gen-cem-map.mjs";

export interface CodeConnectOptions {
  check?: boolean;
}

/** Run the Code Connect steps in `cwd` and return the exit code. */
export async function codeConnect(
  options: CodeConnectOptions = {},
  cwd: string = process.cwd(),
): Promise<number> {
  const resolved = resolveFigmaContext(cwd);
  if (resolved.kind === "skip") {
    console.log(`Code Connect not configured (${resolved.reason}), skipping.`);
    return 0;
  }
  if (resolved.kind === "error") {
    console.error(`auro docs: ${resolved.message}`);
    return 2;
  }

  const { ctx } = resolved;
  if (
    options.check &&
    !existsSync(path.join(ctx.figmaDir, `${ctx.tag}.translate.md`))
  ) {
    console.error(
      `auro docs: ${ctx.tag} is in the Figma connector config but figma/${ctx.tag}.translate.md is missing. Run \`auro docs --figma\` and commit the result.`,
    );
    return 1;
  }

  const check = options.check ? ["--check"] : [];
  return runSteps(
    [
      ...(options.check ? [] : [{ argv: [], step: fetchFigma }]),
      { argv: [], step: genCemMap },
      { argv: check, step: buildMismatch },
      { argv: check, step: buildTranslate },
      { argv: options.check ? ["--validate"] : [], step: buildFigma },
    ],
    ctx,
  );
}
