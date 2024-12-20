import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";

import { Git } from "../../utils/gitUtils.js";

// Run tasks sequentially
const run = async () => {
  await Git.addToGitignore(
    "## Added by Auro CLI migration (github-config-and-gitignore-changes)",
    false,
  );
  await Git.addToGitignore("demo/*.md");
  await Git.addToGitignore("demo/*.min.js");
  await Git.addToGitignore("", false);
  await Git.removeFromGitCache([
    "demo/api.md",
    "demo/index.md",
    "demo/index.min.js",
    "demo/api.min.js",
  ]);
};

run().catch(Logger.error);
