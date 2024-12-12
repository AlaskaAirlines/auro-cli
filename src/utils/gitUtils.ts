import fs from "node:fs";
import { promisify } from "node:util";
import simpleGit from "simple-git";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";

const appendFile = promisify(fs.appendFile);
// @ts-ignore - something about the call signature is not happy. it works so we don't care too much
const git = simpleGit();

export class Git {
  // Function to add file to .gitignore
  static async addToGitignore(pattern: string) {
    try {
      await appendFile(".gitignore", `\n${pattern}`);
      Logger.success(`${pattern} added to .gitignore`);
    } catch (err) {
      Logger.error(err);
    }
  }

  // Function to remove file from git cache
  static async removeFromGitCache(files: string[]) {
    try {
      await git.rmKeepLocal(files);
      Logger.success(`${files.join(", ")} are removed from git cache`);
    } catch (err) {
      Logger.error(err);
    }
  }

  static async createBranch(branchName: string) {
    try {
      await git.checkoutLocalBranch(branchName);
      Logger.success(`Created and switched to ${branchName} branch`);
    } catch (err) {
      Logger.error(err);
    }
  }

  static async commitStagedFiles(message: string) {
    try {
      await git.add(".");
      await git.commit(message);
      Logger.success(`Committed with message: ${message}`);
    } catch (err) {
      Logger.error(err);
    }
  }
}
