import fs from "fs";
import chalk from "chalk";
import { promisify } from "util";
import simpleGit from "simple-git";

const appendFile = promisify(fs.appendFile);
const git = simpleGit();

// Function to add file to .gitignore
const addToGitignore = async (pattern) => {
  try {
    await appendFile(".gitignore", `\n${pattern}`);
    console.log(chalk.green(`${pattern} added to .gitignore`));
  } catch (err) {
    console.log(chalk.red(err));
  }
};

// Function to remove file from git cache
const removeFromGitCache = async (files) => {
  try {
    await git.rmKeepLocal(files);
    console.log(chalk.green(`${files.join(", ")} are removed from git cache`));
  } catch (err) {
    console.log(chalk.red(err));
  }
};

// Run tasks sequentially
const run = async () => {
  await addToGitignore("demo/*.md");
  await addToGitignore("demo/*min.js");
  await removeFromGitCache([
    "demo/api.md",
    "demo/index.md",
    "demo/index.min.js",
    "demo/api.min.js",
  ]);
};

run();
