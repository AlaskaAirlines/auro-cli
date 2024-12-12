import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";

import { Git } from "../utils/gitUtils.js";

const commitMessage = `chore: update .gitignore and remove demo files from cache

This commit removes the demo files from the cache and updates the
.gitignore file to exclude the demo files from being tracked by git.

We were getting a ton of noise in the repo from the demo files on
every build. This commit should help clean that up.

`;

// Run tasks sequentially
const run = async () => {
  await Git.createBranch("migration/git-config-updates");

  await Git.addToGitignore("demo/*.md");
  await Git.addToGitignore("demo/*min.js");
  await Git.removeFromGitCache([
    "demo/api.md",
    "demo/index.md",
    "demo/index.min.js",
    "demo/api.min.js",
  ]);

  await Git.commitStagedFiles(commitMessage);
};

run().catch(Logger.error);
