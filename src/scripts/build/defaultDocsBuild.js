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
 * @returns {import('../utils/sharedFileProcessorUtils').FileProcessorConfig[]}
 */
export async function fileConfigs(config) {
  const pageTemplateFullPath = pathFromCwd(PAGE_TEMPLATE_PATH);
  let pageFiles = [];

  if (fs.existsSync(pageTemplateFullPath)) {
    pageFiles = await fs.promises.readdir(pageTemplateFullPath);
  }

  const pageObjects = pageFiles.map((file) => ({
    identifier: file,
    input: path.join(pathFromCwd(PAGE_TEMPLATE_PATH), file),
    output: pathFromCwd(`/demo/${file}`),
  }));

  return [
    {
      identifier: "README.md",
      input: {
        remoteUrl:
          config.remoteReadmeUrl ||
          generateReadmeUrl(
            config.remoteReadmeVersion,
            config.remoteReadmeVariant,
          ),
        fileName: pathFromCwd("/docTemplates/README.md"),
        overwrite: config.overwriteLocalCopies,
      },
      output: pathFromCwd("/README.md"),
    },
    {
      identifier: "index.md",
      input: pathFromCwd("/docs/partials/index.md"),
      output: pathFromCwd("/demo/index.md"),
      mdMagicConfig: {
        output: {
          directory: pathFromCwd("/demo"),
        },
      },
    },
    {
      identifier: "api.md",
      input: pathFromCwd("/docs/partials/api.md"),
      output: pathFromCwd("/demo/api.md"),
      preProcessors: [templateFiller.formatApiTable],
    },
  ...pageObjects]
};

/**
 *
 * @param {ProcessorConfig} config - The configuration for this processor.
 * @return {Promise<void>}
 */
export async function processDocFiles(config = defaultDocsProcessorConfig) {
  // setup
  await templateFiller.extractNames();

  const fileConfigsList = await fileConfigs(config);

  for (const fileConfig of fileConfigsList) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await processContentForFile(fileConfig);
    } catch (err) {
      Logger.error(`Error processing ${fileConfig.identifier}: ${err.message}`);
    }
  }
}

export async function runDefaultDocsBuild() {
  await processDocFiles({
    ...defaultDocsProcessorConfig,
    remoteReadmeUrl:
      "https://raw.githubusercontent.com/AlaskaAirlines/auro-templates/main/templates/default/README.md",
  });
}
