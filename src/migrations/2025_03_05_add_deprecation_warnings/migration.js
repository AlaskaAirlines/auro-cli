import fs from "node:fs";
import path from "node:path";

const TARGET_FILES = ["docTemplates/README.md"];

/**
 * Return absolute path of a file (does not check if file exists).
 * @param {string} filePath
 * @return {string}
 */
function getAbsolutePath(filePath) {
  return path.join(process.cwd(), filePath);
}

const PROCESSOR_TEMPLATE = `
import path from "node:path";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import {
  processContentForFile,
  templateFiller,
} from "@aurodesignsystem/auro-library/scripts/utils/sharedFileProcessorUtils.mjs";

/**
 * Return absolute path of a file (does not check if file exists).
 * @param {string} filePath
 * @return {string}
 */
function getAbsolutePath(filePath) {
  return path.join(process.cwd(), filePath);
}

export const fileConfigs = () => [
  // README.md
  {
    identifier: "README.md",
    input: \`\${getAbsolutePath("docTemplates/README.md")}\`,
    output: \`\${getAbsolutePath("README.md")}\`,
  },
  // index.md
  {
    identifier: "index.md",
    input: \`\${getAbsolutePath("docs/partials/index.md")}\`,
    output: \`\${getAbsolutePath("demo/index.md")}\`,
    mdMagicConfig: {
      output: {
        directory: "./demo",
      },
    },
  },
  // api.md
  {
    identifier: "api.md",
    input: \`\${getAbsolutePath("docs/partials/api.md")}\`,
    output:  \`\${getAbsolutePath("demo/api.md")}\`,
    preProcessors: [templateFiller.formatApiTable],
  },
];

export const defaultDocsProcessorConfig = {
  component: undefined,
  overwriteLocalCopies: false,
  remoteReadmeVersion: "master",
};

/**
 *
 * @param {ProcessorConfig} config - The configuration for this processor.
 * @return {Promise<void>}
 */
export async function processDocFiles(config = defaultDocsProcessorConfig) {
  // setup
  await templateFiller.extractNames();

  for (const fileConfig of fileConfigs(config)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await processContentForFile(fileConfig);
    } catch (err) {
      Logger.error(\`Error processing \${fileConfig.identifier}: \${err.message}\`);
    }
  }
}

processDocFiles({ overwriteLocalCopies: false })
  .then(() => {
    Logger.log("Docs processed successfully");
  })
  .catch((err) => {
    Logger.error(\`Error processing docs: \${err.message}\`);
  });

`;

function createNewProcessor() {
  const filePath = getAbsolutePath('packageScripts/deprecatedDocsProcessor.js');

  if (fs.existsSync(filePath)) {
    console.error(`Error: File ${filePath} already exists!`);
    return;
  }

  fs.writeFileSync(filePath, PROCESSOR_TEMPLATE);
}

function updatePackageJson() {
  const filePath = getAbsolutePath('package.json');

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File ${filePath} not found!`);
    return;
  }

  const content = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // Update build:docs to use new processor path
  // old path is/was node ./node_modules/@aurodesignsystem/auro-library/scripts/build/generateDocs.mjs
  content.scripts["build:docs"] =
    "node ./packageScripts/deprecatedDocsProcessor.js";

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

function processFile(filePath) {
  try {
    const fullPath = getAbsolutePath(filePath);

    if (!fs.existsSync(fullPath)) {
      console.error(`Error: File ${filePath} not found!`);
      return false;
    }

    const content = fs.readFileSync(fullPath, "utf8");
    const headingMatch = content.match(/^# .+$/m);

    if (!headingMatch) {
      console.error(`No heading found in ${filePath}`);
      return false;
    }

    const firstHeading = headingMatch[0];
    const headingText = firstHeading.replace(/^# /, "");
    const replacement = `# ${headingText} (DEPRECATED)

> **WARNING:** This component is deprecated and is no longer supported. Please migrate to the new [Auro Formkit](https://www.npmjs.com/package/@aurodesignsystem/auro-formkit) instead.
`;

    const modifiedContent = content.replace(firstHeading, replacement);

    fs.writeFileSync(fullPath, modifiedContent);
    console.log(`Successfully updated ${filePath}`);

    return true;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

function addDeprecationNotice() {
  let successCount = 0;
  let failCount = 0;

  TARGET_FILES.forEach((file) => {
    if (processFile(file)) {
      successCount++;
    } else {
      failCount++;
    }
  });
  console.log(`\nProcess completed:`);
  console.log(`Successfully processed: ${successCount} files`);
  console.log(`Failed to process: ${failCount} files`);
  if (failCount > 0) {
    process.exit(1);
  }
}

createNewProcessor();
updatePackageJson();
addDeprecationNotice();
