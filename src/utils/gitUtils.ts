import { appendFile, readFile } from "node:fs/promises";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import simpleGit from "simple-git";

// @ts-ignore - something about the call signature is not happy. it works so we don't care too much
const git = simpleGit();

export class Git {
	static async checkGitignore(pattern: string) {
		if (pattern === "") return false;
		try {
			const fileContent = await readFile(".gitignore", "utf-8");
			return fileContent.includes(pattern);
		} catch (err) {
			Logger.error(`Error reading file: ${err}`);
			return false;
		}
	}

	// Function to add file to .gitignore
	static async addToGitignore(pattern: string, log = true) {
		await Git.checkGitignore(pattern).then(async (result) => {
			if (result) {
				Logger.warn(`${pattern} already exists`);
			} else {
				try {
					await appendFile(".gitignore", `\n${pattern}`);
					if (log) {
						Logger.success(`${pattern} added to .gitignore`);
					}
				} catch (err) {
					Logger.error(err);
				}
			}
		});
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
