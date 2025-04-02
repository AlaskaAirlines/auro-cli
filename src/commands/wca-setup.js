/* eslint-disable no-await-in-loop, line-comment-position, no-inline-comments, jsdoc/require-jsdoc, no-undef, prettier/prettier */

import { program } from "commander";
import fs from "fs";
import path from "path";
import glob from "glob";
import util from "util";
import getTemplatedComponentCode from "../scripts/prepWcaCompatibleCode.mjs";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";

const promisifiedGlob = util.promisify(glob);

const WAC_DIR = path.resolve(process.cwd(), "./scripts/wca");

async function globPath(sources) {
  try {
    const fileArrays = await Promise.all(
      sources.map((source) => promisifiedGlob(source)),
    );
    return fileArrays.flat();
  } catch (err) {
    console.error("Error processing glob patterns:", err);
    throw err; // Re-throw to handle failure at caller
  }
}

async function createExtendsFile(filePaths) {
  if (!fs.existsSync(WAC_DIR)) {
    await fs.promises.mkdir(WAC_DIR, { recursive: true });
  }

  for (const filePath of filePaths) {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    const fileContent = await fs.promises.readFile(resolvedPath, "utf-8");
    const newPath = path.resolve(WAC_DIR, `${path.basename(filePath)}`);
    const newCode = getTemplatedComponentCode(
      fileContent,
      path.relative(WAC_DIR, filePath),
    );
    await fs.promises.writeFile(newPath, newCode);
  }
}

async function main() {
  // files to analyze
  const filePaths = await globPath(["./src/auro-*.js"]);
  await createExtendsFile(filePaths);
}

export default program
  .command("wca-setup")
  .description("Set up WCA (Web Component Analyzer) for the project")
  .action(() => {
    main()
      .then(() => {
        Logger.success("WCA setup completed successfully.");
      })
      .catch((error) => {
        Logger.error(`WCA setup failed: ${error.message}`);
      });
  });
