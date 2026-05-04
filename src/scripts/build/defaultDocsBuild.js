import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import {
  generateReadmeUrl,
  processContentForFile,
  templateFiller,
} from "@aurodesignsystem/auro-library/scripts/utils/sharedFileProcessorUtils.mjs";
import fs from "node:fs";
import { readFileSync, existsSync } from "node:fs";
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

      // Post-processing for markdown output files
      if (fileConfig.output.endsWith('.md')) {
        await postProcessMarkdownFile(fileConfig.output);
      }
    } catch (err) {
      Logger.error(`Error processing ${fileConfig.identifier}: ${err.message}`);
    }
  }
}

/**
 * Post-process a markdown file to resolve second-pass AURO-GENERATED-CONTENT tags,
 * convert markdown code fences to HTML, and normalize whitespace for marked.js.
 * @param {string} outputPath - The absolute path to the output markdown file.
 */
async function postProcessMarkdownFile(outputPath) {
  const outputDir = path.dirname(outputPath);

  // --- Second-pass: resolve empty AURO-GENERATED-CONTENT tags ---
  // These tags have empty content (START immediately followed by END) because
  // markdown-magic only runs one pass and doesn't process tags introduced
  // during that same pass.
  let outputContents = await fs.promises.readFile(outputPath, 'utf8');
  const emptyTagPattern = /^[ \t]*<!-- AURO-GENERATED-CONTENT:START \((FILE|CODE):src=([^)]+)\) -->\n[ \t]*<!-- AURO-GENERATED-CONTENT:END -->/gm;
  let match;
  let modified = false;

  // Fallback directory: paths in shared partials are typically written
  // relative to the demo/ output directory. When the same partial is
  // inlined into a README (output at the project root), the path
  // won't resolve from that shallower directory. Using the demo dir
  // as a fallback ensures nested imports resolve consistently.
  const demoDir = pathFromCwd('demo');

  while ((match = emptyTagPattern.exec(outputContents)) !== null) {
    const [fullMatch, type, srcPath] = match;
    const resolvedPath = path.resolve(outputDir, srcPath);
    const fallbackPath = path.resolve(demoDir, srcPath);
    const actualPath = existsSync(resolvedPath) ? resolvedPath : (existsSync(fallbackPath) ? fallbackPath : null);

    if (actualPath) {
      const fileContent = readFileSync(actualPath, 'utf8');
      let replacement;

      if (type === 'FILE') {
        replacement = `<!-- AURO-GENERATED-CONTENT:START (FILE:src=${srcPath}) -->\n<!-- The below content is automatically added from ${srcPath} -->\n${fileContent.trimEnd()}\n<!-- AURO-GENERATED-CONTENT:END -->`;
      } else {
        // CODE: wrap in a pre/code HTML block with language classes
        const ext = path.extname(srcPath).slice(1) || 'html';
        const escaped = fileContent.trimEnd()
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        replacement = `<!-- AURO-GENERATED-CONTENT:START (CODE:src=${srcPath}) -->\n<!-- The below code snippet is automatically added from ${srcPath} -->\n<pre class="language-${ext}"><code class="language-${ext}">${escaped}\n</code></pre>\n<!-- AURO-GENERATED-CONTENT:END -->`;
      }

      outputContents = outputContents.replace(fullMatch, replacement);
      // Reset lastIndex so the regex rescans from the start of
      // the replacement — otherwise consecutive tags are skipped
      // because the string length changed.
      emptyTagPattern.lastIndex = 0;
      modified = true;
    }
  }

  if (modified) {
    // Replace template variables (e.g. {{ componentName }}) in content
    // introduced by second-pass inlining — the first pass only
    // replaces variables in the original file, not in nested partials.
    outputContents = templateFiller.replaceTemplateValues(outputContents);
    await fs.promises.writeFile(outputPath, outputContents);
  }

  // --- Convert markdown code fences to <pre><code> HTML blocks ---
  // marked.js won't parse fences inside HTML block context, so all
  // fenced code blocks need to be converted to raw HTML for consistent rendering.
  outputContents = await fs.promises.readFile(outputPath, 'utf8');
  const fencePattern = /^[ \t]*```(\w*)\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
  const convertedContents = outputContents.replace(fencePattern, (_match, lang, code) => {
    const language = lang || 'html';
    const escaped = code.trimEnd()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre class="language-${language}"><code class="language-${language}">${escaped}\n</code></pre>`;
  });

  if (convertedContents !== outputContents) {
    await fs.promises.writeFile(outputPath, convertedContents);
  }

  // --- Whitespace normalization for marked.js compatibility ---
  outputContents = await fs.promises.readFile(outputPath, 'utf8');

  // Dedent and fix blank lines inside <pre><code>...</code></pre> blocks
  outputContents = outputContents.replace(
    /(<pre[^>]*><code[^>]*>)([\s\S]*?)(<\/code><\/pre>)/g,
    (_match, open, content, close) => {
      const lines = content.split('\n');
      // Find minimum indentation across non-empty lines
      const nonEmpty = lines.filter(l => l.trim().length > 0);
      if (nonEmpty.length === 0) return _match;
      const minIndent = Math.min(...nonEmpty.map(l => {
        const m = l.match(/^[ \t]*/);
        return m ? m[0].length : 0;
      }));
      // Dedent and replace blank lines with zero-width space
      const processed = lines.map(l => {
        if (l === '') return '\u200B';
        if (l.trim().length === 0) return '\u200B';
        return minIndent > 0 ? l.substring(minIndent) : l;
      });
      // Strip trailing empty/zwsp lines
      while (processed.length > 0 && (processed[processed.length - 1] === '\u200B' || processed[processed.length - 1] === '')) {
        processed.pop();
      }
      return open + processed.join('\n') + close;
    }
  );

  // Strip leading whitespace outside <pre> blocks
  const outputLines = outputContents.split('\n');
  let insidePre = false;

  for (let i = 0; i < outputLines.length; i++) {
    if (/<pre[\s>]/i.test(outputLines[i])) {
      insidePre = true;
    }
    if (!insidePre) {
      // Only strip leading whitespace before HTML tags — not before markdown
      // content like indented list items, which rely on indentation for structure.
      outputLines[i] = outputLines[i].replace(/^[ \t]+(?=<)/, '');
    }
    if (/<\/pre>/i.test(outputLines[i])) {
      insidePre = false;
    }
  }

  await fs.promises.writeFile(outputPath, outputLines.join('\n'));
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
