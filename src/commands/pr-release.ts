import fs from "node:fs";
import { get } from "node:https"; // Change to https
import chalk from "chalk";
import { program } from "commander";
import ora from "ora";
import type { Ora } from "ora";

export default program
  .command("pr-release")
  .option(
    "-n, --namespace <package-namespace>",
    "Set namespace of the package release",
    "@aurodesignsystem-dev",
  )
  .option(
    "-p, --pr-number <number>",
    "Set pull request number for the release",
    "0",
  )
  .description(
    "Generate the package version based off of PR number then update the package.json file. Note: this does not publish the package.",
  )
  .action(async (option) => {
    await updatePackageJson(option);
  });

interface ReleaseOptions {
  namespace: string;
  prNumber: number;
}

const updatePackageJson = async (option: ReleaseOptions): Promise<void> => {
  const { namespace, prNumber } = option;

  const packageSpinner = ora("Updating package.json").start();

  try {
    const packageJsonPath = "package.json";

    // Read package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    // Check if release version is on npmjs already
    packageSpinner.text = "Checking npm registry for version information...";

    const releaseVersion = `0.0.0-pr${prNumber}`;
    const packageComponent = packageJson.name.split("/")[1];
    const packageName = `${namespace}/${packageComponent}`;
    const incrementVersion = await getIncrementVersion(
      releaseVersion,
      packageName,
      packageSpinner,
    );
    const packageVersion = `${releaseVersion}.${incrementVersion}`;

    packageJson.name = packageName;
    packageJson.version = packageVersion;

    packageSpinner.text = "Writing updated package.json...";

    // Write the updated package.json back to the file
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );

    packageSpinner.succeed(
      `Package.json updated to use ${chalk.green(packageVersion)} and ${chalk.green(packageName)}`,
    );

    // Explicitly exit with success code to ensure terminal prompt returns
    process.exit(0);
  } catch (error: unknown) {
    packageSpinner.fail(`Failed to update package.json: ${error}`);
    process.exit(1); // Exit with error code
  }
};

// checks if version exists on npmjs and returns the next available increment version
const getIncrementVersion = (
  releaseVersion: string,
  packageName: string,
  spinner: Ora,
): Promise<number> => {
  return new Promise((resolve) => {
    try {
      // Use the registry URL to get all versions for the package
      const registryUrl = `https://registry.npmjs.org/${packageName}`;

      const req = get(
        registryUrl,
        {
          headers: { Accept: "application/json" },
        },
        (res) => {
          // Handle redirects
          if (
            (res.statusCode === 301 || res.statusCode === 302) &&
            res.headers.location
          ) {
            // Persist redirect message
            spinner.info(`Following redirect to ${res.headers.location}...`);
            try {
              get(
                res.headers.location,
                { headers: { Accept: "application/json" } },
                handleResponse,
              )
                .on("error", (err) => {
                  // On redirect error, default to 0
                  spinner.warn(
                    `Error following redirect: ${err.message}, defaulting to version 0`,
                  );
                  resolve(0);
                })
                .end();
            } catch (error) {
              // If redirect request fails, default to 0
              spinner.warn(
                `Redirect request failed: ${error instanceof Error ? error.message : "Unknown error"}, defaulting to version 0`,
              );
              resolve(0);
            }
            return;
          }

          handleResponse(res);
        },
      );

      function handleResponse(res: import("http").IncomingMessage) {
        if (res.statusCode !== 200) {
          // If package not found or other error, we can start with version 0
          spinner.info(
            `Package not found. Status code: ${chalk.red(res.statusCode)}, defaulting to version 0`,
          );
          resolve(0);
          return;
        }

        spinner.text = "Processing version information...";
        let data = "";
        res.on("data", (chunk: Buffer | string) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const packageData = JSON.parse(data);
            const versions = packageData.versions
              ? Object.keys(packageData.versions)
              : [];

            spinner.text = "Calculating next version number...";

            // Find the highest existing iteration for this release version
            let maxIteration = -1;
            const versionRegex = new RegExp(`^${releaseVersion}\\.(\\d+)$`);

            for (const version of versions) {
              const match = version.match(versionRegex);
              if (match) {
                const iteration = Number.parseInt(match[1], 10);
                maxIteration = Math.max(maxIteration, iteration);
              }
            }

            // Return the next iteration number and persist this important info
            if (maxIteration >= 0) {
              spinner.info(
                `Found existing version ${chalk.green(`${releaseVersion}.${maxIteration}`)}. Incrementing to ${chalk.green(`${releaseVersion}.${maxIteration + 1}`)}`,
              );
            } else {
              spinner.info(
                `No existing version found for ${chalk.green(releaseVersion)}. Starting with ${chalk.green(`${releaseVersion}.0`)}`,
              );
            }
            resolve(maxIteration + 1);
          } catch (error) {
            // In case of parsing error, default to 0
            spinner.warn(
              `Failed to parse NPM registry response: ${error instanceof Error ? error.message : "Unknown error"}, defaulting to version 0`,
            );
            resolve(0);
          }
        });
      }

      req.on("error", (err) => {
        // On request error, default to 0
        spinner.warn(`Request error: ${err.message}, defaulting to version 0`);
        resolve(0);
      });

      req.end();
    } catch (error) {
      // Catch any other errors and default to 0
      spinner.warn(
        "Error checking version in npm registry, defaulting to version 0",
      );
      resolve(0);
    }
  });
};
