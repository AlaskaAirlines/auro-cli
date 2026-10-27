/**
 * Code Connect, run for the components in the Figma connector config right
 * after the CEM is built (`auro docs --cem`, `auro build`, `auro dev`). It first fetches the Figma data from the Figma API
 * (needs `FIGMA_ACCESS_TOKEN`; without it the whole step is skipped with a warning)
 * and saves it in `figma/snapshots/`. From the built `custom-elements.json`, that
 * data and `figma/<tag>.translate.md` it then writes the CEM map and
 * `<tag>.figma.ts` (in `figma/`), tops up the translate file with
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
import { run as buildIcons } from "#scripts/figma/build-icons.mjs";
import { run as buildMismatch } from "#scripts/figma/build-mismatch.mjs";
import { run as buildTranslate } from "#scripts/figma/build-translate.mjs";
import { resolveFigmaContext, runSteps } from "#scripts/figma/context.js";
import { run as fetchFigma } from "#scripts/figma/fetch-figma.mjs";
import { run as genCemMap } from "#scripts/figma/gen-cem-map.mjs";

export interface CodeConnectOptions {
  check?: boolean;
  /** Don't print the "not configured, skipping" line (used by every `auro build`). */
  quiet?: boolean;
}

/** Run the Code Connect steps in `cwd` and return the exit code. */
export async function codeConnect(
  options: CodeConnectOptions = {},
  cwd: string = process.cwd(),
): Promise<number> {
  const resolved = resolveFigmaContext(cwd);
  if (resolved.kind === "skip") {
    if (!options.quiet) {
      console.log(
        `Code Connect not configured (${resolved.reason}), skipping.`,
      );
    }
    return 0;
  }
  if (resolved.kind === "error") {
    console.error(`auro docs: ${resolved.message}`);
    return 2;
  }

  const { ctx } = resolved;
  if (ctx.iconLibrary) {
    // The icon repo: there is no Figma component set to bind, so the mismatch file is code-side only (ctx.noFigma), and build-icons
    // maps the Figma icon components to <auro-icon>: it tops up the icons table of <tag>.translate.md (its input) and writes the
    // "unmapped" section of the mismatch file (output only). build-icons reads the Figma API, so `check` (which never fetches) leaves it out.
    const needsToken = !options.check && !process.env.FIGMA_ACCESS_TOKEN;
    if (needsToken) {
      console.warn(
        `auro docs: FIGMA_ACCESS_TOKEN is not set, skipping the icon mappings for ${ctx.tag}.`,
      );
    }
    return runSteps(
      [
        { argv: [], step: genCemMap },
        { argv: options.check ? ["--check"] : [], step: buildMismatch },
        ...(options.check || needsToken
          ? []
          : [{ argv: [], step: buildIcons }]),
      ],
      ctx,
    );
  }
  if (
    options.check &&
    !existsSync(path.join(ctx.figmaDir, `${ctx.tag}.translate.md`))
  ) {
    console.error(
      `auro docs: ${ctx.tag} is in the Figma connector config but figma/${ctx.tag}.translate.md is missing. Run \`auro docs --cem\` and commit the result.`,
    );
    return 1;
  }

  if (!options.check && !process.env.FIGMA_ACCESS_TOKEN) {
    console.warn(
      `auro docs: FIGMA_ACCESS_TOKEN is not set, skipping Code Connect for ${ctx.tag}.`,
    );
    return 0;
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
