import process from "node:process";
import { program } from "commander";

import { readFile, writeFile } from "node:fs/promises";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { syncDotGithubDir } from "#scripts/syncDotGithubDir.js";

export default program
  .command("sync")
  .description(
    "Script runner to synchronize local repository configuration files",
  )
  .action(async () => {
    Logger.info("Synchronizing repository configuration files...");

    Logger.warn(
      "Note: sync does not create a new git branch. Changes are added to the current branch.",
    );

    const cwd = process.cwd();

    await syncDotGithubDir(cwd);

    // Cleanup for specific files
    // ------------------------------------------------------

    // Some files have specific cleanup tasks that need to be run after syncing

    // CODEOWNERS - has a bizarre issue with line endings. This is a workaround!
    // Maybe it has to do with the file type since there's no ending?
    const codeownersPath = `${cwd}/.github/CODEOWNERS`;
    const codeowners = await readFile(codeownersPath, { encoding: "utf-8" });

    // Convert line endings to \n
    const codeownersFixed = codeowners
      .replace(/\r\n/gu, "\n")
      .replace(/\n\n/gu, "\n");
    await writeFile(codeownersPath, codeownersFixed, { encoding: "utf-8" });

    if (codeownersFixed.includes("\r") || codeownersFixed.includes("\n\n")) {
      Logger.error("CODEOWNERS file still has Windows line endings.");
    }
  });
