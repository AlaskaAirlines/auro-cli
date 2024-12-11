import { program } from "commander";
import process from "node:process";

import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { syncDotGithubDir } from "../scripts/syncDotGithubDir.js";

export default program
  .command("sync")
  .description(
    "Script runner to synchronize local repository configuration files",
  )
  .action(async () => {
    Logger.info("Synchronizing repository configuration files...");

    const cwd = process.cwd();

    await syncDotGithubDir(cwd);
  });
