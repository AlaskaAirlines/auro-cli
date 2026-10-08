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
 * @property {string} [monorepoName] - The name of the monorepo, used as a template variable.
 * @property {Record<string, unknown>} [extraVars] - Additional template variables to pass to the template filler.
 * @param {ProcessorConfig} config - The configuration for this processor.
 */
export const defaultDocsProcessorConfig = {
  overwriteLocalCopies: true,
  remoteReadmeVersion: "master",
  // eslint-disable-next-line no-warning-comments
  // TODO: remove this variant when all components are updated to use latest auro-library
  // AND the default README.md is updated to use the new paths
  remoteReadmeVariant: "_updated_paths",
  monorepoName: undefined,
  extraVars: {},
};

function pathFromCwd(pathLike) {
  const cwd = process.cwd();
  return `${cwd}/${pathLike}`;
}

/**
 * Walk up the directory tree from the given start directory to find the monorepo
 * root — identified as the nearest ancestor (or self) whose package.json has a
 * "workspaces" field. Falls back to the start directory if none is found.
 * @param {string} [startDir=process.cwd()] - Directory to start searching from.
 * @returns {string} Absolute path to the monorepo root directory.
 */
function findMonorepoRoot(startDir = process.cwd()) {
  let dir = startDir;
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.workspaces) return dir;
      } catch {
        // malformed package.json — keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return startDir;
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
 * Process every docs file. A failure in one file doesn't stop the others; once
 * all files have run, any failures are thrown together as a single error.
 * @param {ProcessorConfig} config - The configuration for this processor.
 * @param {boolean} [skipReadme=false] - Whether to skip README.md processing.
 * @return {Promise<void>}
 * @throws {Error} Listing every docs file that failed to generate.
 */
export async function processDocFiles(config = defaultDocsProcessorConfig, skipReadme = false) {
  // setup
  await templateFiller.extractNames();

  const fileConfigsList = await fileConfigs(config, skipReadme);

  let monorepoName = config.monorepoName;
  if (!monorepoName) {
    try {
      const rootPkgPath = path.join(findMonorepoRoot(), "package.json");
      const pkgJson = JSON.parse(readFileSync(rootPkgPath, "utf8"));
      // Strip the npm scope prefix ("@scope/") to get the bare package name used in
      // template variables such as {{ monorepoName }} (e.g. "auro-formkit").
      monorepoName = pkgJson.name?.replace(/^@[^/]+\//, '');
    } catch {
      // no root package.json or name field — leave undefined
    }
  }

  const extraVars = {
    ...(monorepoName ? { monorepoName } : {}),
    ...(config.extraVars || {}),
  };

  const failures = [];

  for (const fileConfig of fileConfigsList) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await processContentForFile({
        ...fileConfig,
        extraVars,
        // Runs just before auro-library's Handlebars pass.
        preProcessors: [
          ...(fileConfig.preProcessors ?? []),
          (content) => escapeUnknownPlaceholders(content, extraVars),
        ],
      });

      // Post-processing for markdown output files
      if (fileConfig.output.endsWith('.md')) {
        await postProcessMarkdownFile(fileConfig.output, extraVars);

        const placeholders = findUnreplacedPlaceholders(
          await fs.promises.readFile(fileConfig.output, 'utf8'),
        );
        if (placeholders.length > 0) {
          throw new Error(`Unreplaced template placeholders: ${placeholders.join(', ')}`);
        }
      }
    } catch (err) {
      Logger.error(`Error processing ${fileConfig.identifier}: ${err.message}`);
      failures.push(`${fileConfig.identifier}: ${err.message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Failed to generate ${failures.length} docs file(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`,
    );
  }
}

/**
 * Variables auro-library's template filler fills. Keep in sync with
 * `AuroTemplateFiller.replaceTemplateValues`. A name missing here isn't
 * dropped silently: it's left as `{{ … }}` and fails the placeholder check.
 */
const TEMPLATE_VARIABLES = [
  'name', 'Name', 'namespace', 'Namespace', 'Version', 'dtVersion', 'wcssVersion',
  'monorepoName',
];

/** Helpers auro-library's template filler registers. */
const TEMPLATE_HELPERS = ['capitalize', 'withAuroNamespace', 'packageName'];

/**
 * Handlebars block, `else`, comment, partial, unescaped and decorator
 * expressions (`{{#if}}`, `{{else}}`, `{{!-- --}}`, `{{> header}}`,
 * `{{{ raw }}}`, …), matched on the text after `{{`.
 */
const HANDLEBARS_SYNTAX = /^~?(?:[#/^!>&{*]|\s*else\b)/;

/**
 * Code in markdown: `<pre>` and `<code>` elements, fenced blocks and inline
 * code spans.
 */
const CODE_PATTERN = /<pre\b[\s\S]*?<\/pre>|<code\b[\s\S]*?<\/code>|^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$|`[^`\n]*`/gim;

/**
 * Whether Handlebars should fill a `{{ … }}` expression: a template variable
 * on its own (`{{ name }}`), or a template helper whose arguments are template
 * variables or string literals (`{{ capitalize name }}`). Other Handlebars
 * syntax is filled in prose only.
 * @param {string} expression - The text between `{{` and `}}`.
 * @param {Set<string>} variables - Template variable names.
 * @param {boolean} inCode - Whether the expression is in code.
 * @returns {boolean}
 */
function isTemplateExpression(expression, variables, inCode) {
  if (HANDLEBARS_SYNTAX.test(expression)) {
    return !inCode;
  }
  const [head, ...args] = expression.replace(/^~?\s*|\s*~?$/g, '').split(/\s+/);
  if (TEMPLATE_HELPERS.includes(head)) {
    return args.every((arg) => variables.has(arg) || /^(["']).*\1$/.test(arg));
  }
  return args.length === 0 && variables.has(head);
}

/**
 * Escape `{{ … }}` expressions that aren't template variables or helper calls,
 * so Handlebars outputs them literally instead of replacing them with an empty
 * string. In code, Handlebars block, comment, partial and triple-stash syntax
 * is escaped too, so Vue, Angular and Handlebars examples come through
 * unchanged. In prose, that syntax is left to Handlebars, and misspelled
 * variables are left for the placeholder check to catch.
 * @param {string} content - Template source about to be filled.
 * @param {Record<string, unknown>} [extraVars={}] - Extra template variables.
 * @returns {string}
 */
export function escapeUnknownPlaceholders(content, extraVars = {}) {
  const variables = new Set([...TEMPLATE_VARIABLES, ...Object.keys(extraVars)]);
  const escapeText = (text, inCode) => text.replace(
    /(?<![\\{])\{\{([\s\S]*?)\}\}/g,
    (match, expression) => (isTemplateExpression(expression, variables, inCode) ? match : `\\${match}`),
  );

  let result = '';
  let proseStart = 0;
  for (const code of content.matchAll(CODE_PATTERN)) {
    result += escapeText(content.slice(proseStart, code.index), false) + escapeText(code[0], true);
    proseStart = code.index + code[0].length;
  }
  return result + escapeText(content.slice(proseStart), false);
}

/**
 * Fill template values in content inlined by the second pass, escaping
 * unknown `{{ … }}` first so they come through unchanged.
 * @param {string} content - The inlined file's contents.
 * @param {Record<string, unknown>} extraVars - Extra template variables.
 * @returns {string}
 */
function fillInlinedContent(content, extraVars) {
  return templateFiller.replaceTemplateValues(
    escapeUnknownPlaceholders(content, extraVars),
    extraVars,
  );
}

/**
 * Find `{{ … }}` template placeholders left in generated markdown. Code is
 * ignored — `<pre>`/`<code>` elements, fenced blocks and inline code spans can
 * legitimately contain `{{ }}` (Handlebars, Vue, Angular examples).
 * @param {string} content - The generated markdown.
 * @returns {string[]} The unreplaced placeholders, in order of appearance.
 */
export function findUnreplacedPlaceholders(content) {
  return content.replace(CODE_PATTERN, '').match(/\{\{[\s\S]*?\}\}/g) ?? [];
}

/**
 * Post-process a markdown file to resolve second-pass AURO-GENERATED-CONTENT tags,
 * convert markdown code fences to HTML, and normalize whitespace for marked.js.
 * @param {string} outputPath - The absolute path to the output markdown file.
 * @param {Record<string, unknown>} [extraVars={}] - Additional template variables for second-pass replacement.
 */
async function postProcessMarkdownFile(outputPath, extraVars = {}) {
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
  const missingIncludes = [];

  while ((match = emptyTagPattern.exec(outputContents)) !== null) {
    const [fullMatch, type, srcPath] = match;
    const resolvedPath = path.resolve(outputDir, srcPath);
    const fallbackPath = path.resolve(demoDir, srcPath);
    const actualPath = existsSync(resolvedPath) ? resolvedPath : (existsSync(fallbackPath) ? fallbackPath : null);

    if (actualPath) {
      // Fill template values here, in the inlined content only. Filling the
      // whole file again would also fill a literal `{{ name }}` that the first
      // pass produced from a `\{{ name }}` escape.
      const fileContent = readFileSync(actualPath, 'utf8');
      let replacement;

      if (type === 'FILE') {
        replacement = `<!-- AURO-GENERATED-CONTENT:START (FILE:src=${srcPath}) -->\n<!-- The below content is automatically added from ${srcPath} -->\n${fillInlinedContent(fileContent, extraVars).trimEnd()}\n<!-- AURO-GENERATED-CONTENT:END -->`;
      } else {
        // CODE: wrap in a pre/code HTML block with language classes. Fill after
        // wrapping: the filler's prose cleanup (blank lines, `#` and `>` lines)
        // skips <pre>, so the snippet comes through unchanged.
        const ext = path.extname(srcPath).slice(1) || 'html';
        const escaped = fileContent.trimEnd()
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const pre = fillInlinedContent(
          `<pre class="language-${ext}"><code class="language-${ext}">${escaped}\n</code></pre>`,
          extraVars,
        );
        replacement = `<!-- AURO-GENERATED-CONTENT:START (CODE:src=${srcPath}) -->\n<!-- The below code snippet is automatically added from ${srcPath} -->\n${pre}\n<!-- AURO-GENERATED-CONTENT:END -->`;
      }

      // Function replacer: a string replacement would expand `$$`, `$&`, `$'`
      // and `` $` `` in the snippet.
      outputContents = outputContents.replace(fullMatch, () => replacement);
      // Reset lastIndex so the regex rescans from the start of
      // the replacement — otherwise consecutive tags are skipped
      // because the string length changed.
      emptyTagPattern.lastIndex = 0;
      modified = true;
    } else {
      // The scan restarts after each replacement, so a missing include can be
      // seen more than once.
      if (!missingIncludes.includes(srcPath)) {
        missingIncludes.push(srcPath);
      }
    }
  }

  if (missingIncludes.length > 0) {
    throw new Error(`Included file(s) not found: ${missingIncludes.join(', ')}`);
  }

  if (modified) {
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
      // Split on CRLF too: a `\r` left on a blank line would become a literal
      // blank line in marked.js (it reads a lone `\r` as a newline).
      const lines = content.split(/\r?\n/);
      // Find minimum indentation across non-empty lines
      const nonEmpty = lines.filter(l => l.trim().length > 0);
      if (nonEmpty.length === 0) return _match;
      const minIndent = Math.min(...nonEmpty.map(l => {
        const m = l.match(/^[ \t]*/);
        return m ? m[0].length : 0;
      }));
      const processed = lines.map(l => (minIndent > 0 ? l.substring(minIndent) : l));
      // Strip trailing blank lines
      while (processed.length > 0 && processed[processed.length - 1].trim() === '') {
        processed.pop();
      }
      // A literal blank line ends the HTML block in marked.js (e.g. a <pre>
      // nested in other HTML), so end each blank line with an encoded newline
      // (&#10;) instead. It renders and copies as a real newline.
      const body = processed
        .map((l, i) => (i === processed.length - 1 ? l : `${l}${l.trim() === '' ? '&#10;' : '\n'}`))
        .join('');
      return open + body + close;
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
