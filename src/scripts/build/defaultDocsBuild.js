import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import {
  generateReadmeUrl,
  processContentForFile,
  templateFiller,
} from "@aurodesignsystem/auro-library/scripts/utils/sharedFileProcessorUtils.mjs";
import fs from "node:fs";
import path from "node:path";

const PAGE_TEMPLATE_PATH = "/docs/pages";

/**
 * Processor config object.
 * @typedef {Object} ProcessorConfig
 * @property {boolean} [overwriteLocalCopies=true] - The release version tag to use instead of master.
 * @property {string} [remoteReadmeVersion="master"] - The release version tag to use instead of master.
 * @property {string} [remoteReadmeUrl] - The release version tag to use instead of master.
 * @property {string} [remoteReadmeVariant=""] - The variant string to use for the README source (like "_esm" to make README_esm.md).
 * @param {ProcessorConfig} config - The configuration for this processor.
 */
export const defaultDocsProcessorConfig = {
  overwriteLocalCopies: true,
  remoteReadmeVersion: "master",
  // eslint-disable-next-line no-warning-comments
  // TODO: remove this variant when all components are updated to use latest auro-library
  // AND the default README.md is updated to use the new paths
  remoteReadmeVariant: "_updated_paths",
};

function pathFromCwd(pathLike) {
  const cwd = process.cwd();
  return `${cwd}/${pathLike}`;
}

/**
 * @param {ProcessorConfig} config - The configuration for this processor.
 * @param {boolean} [skipReadme=false] - Whether to skip README.md processing.
 * @returns {import('../utils/sharedFileProcessorUtils').FileProcessorConfig[]}
 */
export async function fileConfigs(config, skipReadme = false) {
  const configs = [];

  // ---------- README.md ----------
  // Don't need to check for existence of README.md since it's always created
  if (!skipReadme) {
    const inputConfig = config.localReadmePath
      ? config.localReadmePath
      : {
          remoteUrl:
            config.remoteReadmeUrl ||
            generateReadmeUrl(
              config.remoteReadmeVersion,
              config.remoteReadmeVariant,
            ),
          fileName: pathFromCwd("/docTemplates/README.md"),
          overwrite: config.overwriteLocalCopies,
        };

    configs.push({
      identifier: "README.md",
      input: inputConfig,
      output: pathFromCwd("/README.md"),
    });
  }

  // ---------- index.md ----------
  if (fileExists("/docs/partials/index.md")) {
    configs.push({
      identifier: "index.md",
      input: pathFromCwd("/docs/partials/index.md"),
      output: pathFromCwd("/demo/index.md"),
      mdMagicConfig: {
        output: {
          directory: pathFromCwd("/demo"),
        },
      },
    });
  }

  // ---------- api.md ----------
  if (fileExists("/docs/partials/api.md")) {
    configs.push({
      identifier: "api.md",
      input: pathFromCwd("/docs/partials/api.md"),
      output: pathFromCwd("/demo/api.md"),
      preProcessors: [templateFiller.formatApiTable],
    });
  }

  // ---------- Page Templates ----------
  const pageTemplateFullPath = pathFromCwd(PAGE_TEMPLATE_PATH);

  if (fs.existsSync(pageTemplateFullPath)) {
    const pageFiles = await fs.promises.readdir(pageTemplateFullPath);

    const pageObjects = pageFiles.map((file) => ({
      identifier: file,
      input: path.join(pageTemplateFullPath, file),
      output: pathFromCwd(`/demo/${file}`),
    }));

    configs.push(...pageObjects);
  }

  return configs;
}

/**
 *
 * @param {ProcessorConfig} config - The configuration for this processor.
 * @param {boolean} [skipReadme=false] - Whether to skip README.md processing.
 * @return {Promise<void>}
 */
export async function processDocFiles(config = defaultDocsProcessorConfig, skipReadme = false) {
  // setup
  await templateFiller.extractNames();

  const fileConfigsList = await fileConfigs(config, skipReadme);

  for (const fileConfig of fileConfigsList) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await processContentForFile(fileConfig);
    } catch (err) {
      Logger.error(`Error processing ${fileConfig.identifier}: ${err.message}`);
    }
  }
}

export async function runDefaultDocsBuild(options = {}) {
  const readmeTemplate = options.readmeTemplate;
  const isLocalPath = readmeTemplate && !readmeTemplate.startsWith("http");

  await processDocFiles({
    ...defaultDocsProcessorConfig,
    ...(isLocalPath
      ? { localReadmePath: path.resolve(process.cwd(), readmeTemplate) }
      : {
          remoteReadmeUrl:
            readmeTemplate ||
            "https://raw.githubusercontent.com/AlaskaAirlines/auro-templates/main/templates/default/README.md",
        }),
  }, options.skipReadme);
}

/**
 * Check if a file exists.
 * @private
 * @param {String} pathToFile - The path to the file to check if it exists.
 * @returns {Boolean}}
 */
function fileExists(pathToFile) {
  return fs.existsSync(pathFromCwd(pathToFile));
}
