/**
 * Default docs build — failure reporting and snippet fidelity. A docs file that
 * fails to generate (missing include, leftover `{{ … }}` placeholder) must fail
 * the build by name without stopping the other files, and code snippets must come
 * through unchanged: blank lines kept (as `&#10;`, never U+200B) and `#` lines
 * untouched.
 *
 * @see ../src/scripts/build/defaultDocsBuild.js
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { type TestContext, test } from "node:test";
import {
  escapeUnknownPlaceholders,
  findUnreplacedPlaceholders,
  processDocFiles,
} from "../src/scripts/build/defaultDocsBuild.js";
import { tempCwd } from "./support.ts";

/**
 * Stage a component project from a `{ relativePath: contents }` map, chdir into
 * it (restored after the test) and silence the build's console output.
 */
async function stageProject(
  t: TestContext,
  files: Record<string, string>,
): Promise<string> {
  const cwd = await tempCwd(t);
  // Component repos always have demo/; the library won't create it.
  await mkdir(path.join(cwd, "demo"));
  const all: Record<string, string> = {
    "package.json": JSON.stringify({
      name: "@aurodesignsystem/auro-tabs",
      version: "1.0.0",
    }),
    ...files,
  };
  for (const [rel, contents] of Object.entries(all)) {
    const file = path.join(cwd, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents, "utf-8");
  }

  const origCwd = process.cwd();
  process.chdir(cwd);
  t.after(() => process.chdir(origCwd));
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
  return cwd;
}

/** Run the docs build with a local README template (or none). */
function build(cwd: string, readme = true): Promise<void> {
  return processDocFiles(
    { localReadmePath: path.join(cwd, "docTemplates/README.md") },
    !readme,
  );
}

/** A docs partial that pulls one snippet in with a CODE include. */
function snippetPartial(src: string): string {
  return `# Example\n\n<!-- AURO-GENERATED-CONTENT:START (CODE:src=${src}) -->\n<!-- AURO-GENERATED-CONTENT:END -->\n`;
}

/** Decode the first generated `<pre><code>` block back to the text a reader copies. */
async function copiedSnippet(cwd: string, output: string): Promise<string> {
  const generated = await readFile(path.join(cwd, output), "utf-8");
  const body = generated.match(
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/,
  );
  assert.ok(body, `no <pre><code> block in ${output}`);
  assert.ok(!generated.includes("​"), "generated docs contain U+200B");
  return body[1]
    .replaceAll("&#10;", "\n")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

test("a missing README include fails the build by name; other files still generate", async (t) => {
  const cwd = await stageProject(t, {
    "docTemplates/README.md":
      "# {{ capitalize name }}\n\n<!-- AURO-GENERATED-CONTENT:START (FILE:src=./docs/partials/customRegistration.md) -->\n<!-- AURO-GENERATED-CONTENT:END -->\n",
    "docs/partials/index.md": "# Index for {{ name }}\n",
  });

  await assert.rejects(build(cwd), (err: Error) => {
    assert.match(err.message, /Failed to generate 1 docs file\(s\)/);
    assert.match(err.message, /README\.md: .*customRegistration\.md/);
    return true;
  });
  assert.equal(
    await readFile(path.join(cwd, "demo/index.md"), "utf-8"),
    "# Index for tabs\n",
  );
});

test("every failed docs file is listed in the error", async (t) => {
  const cwd = await stageProject(t, {
    "docTemplates/README.md":
      "<!-- AURO-GENERATED-CONTENT:START (FILE:src=./docs/partials/missing.md) -->\n<!-- AURO-GENERATED-CONTENT:END -->\n",
    "docs/pages/broken.md":
      "<!-- AURO-GENERATED-CONTENT:START (CODE:src=./nope.js) -->\n<!-- AURO-GENERATED-CONTENT:END -->\n",
  });

  await assert.rejects(build(cwd), (err: Error) => {
    assert.match(err.message, /Failed to generate 2 docs file\(s\)/);
    assert.match(err.message, /- README\.md: .*missing\.md/);
    assert.match(err.message, /- broken\.md: .*nope\.js/);
    return true;
  });
});

test("a missing file in a nested (second-pass) include is reported by name", async (t) => {
  const cwd = await stageProject(t, {
    "docs/partials/index.md":
      "<!-- AURO-GENERATED-CONTENT:START (FILE:src=./../docs/partials/shared.md) -->\n<!-- AURO-GENERATED-CONTENT:END -->\n",
    "docs/partials/shared.md":
      "<!-- AURO-GENERATED-CONTENT:START (CODE:src=./../apiExamples/gone.html) -->\n<!-- AURO-GENERATED-CONTENT:END -->\n",
  });

  await assert.rejects(build(cwd, false), (err: Error) => {
    assert.match(
      err.message,
      /index\.md: Included file\(s\) not found: \.\/\.\.\/apiExamples\/gone\.html/,
    );
    return true;
  });
});

test("a missing nested include is listed once, even when a later include resolves", async (t) => {
  const cwd = await stageProject(t, {
    "apiExamples/here.html": "<p>here</p>\n",
    "docs/partials/index.md":
      "<!-- AURO-GENERATED-CONTENT:START (FILE:src=./../docs/partials/shared.md) -->\n<!-- AURO-GENERATED-CONTENT:END -->\n",
    "docs/partials/shared.md":
      "<!-- AURO-GENERATED-CONTENT:START (CODE:src=./../apiExamples/gone.html) -->\n<!-- AURO-GENERATED-CONTENT:END -->\n\n<!-- AURO-GENERATED-CONTENT:START (CODE:src=./../apiExamples/here.html) -->\n<!-- AURO-GENERATED-CONTENT:END -->\n",
  });

  await assert.rejects(build(cwd, false), (err: Error) => {
    assert.equal(err.message.match(/gone\.html/g)?.length, 1, err.message);
    return true;
  });
});

test("an unreplaced {{ … }} placeholder in prose fails the build", async (t) => {
  const cwd = await stageProject(t, {
    // `\{{` is Handlebars' escape, so the placeholder survives replacement.
    "docs/partials/index.md": "# Index\n\nHello \\{{ leftover }}\n",
  });

  await assert.rejects(build(cwd, false), (err: Error) => {
    assert.match(
      err.message,
      /index\.md: Unreplaced template placeholders: \{\{ leftover \}\}/,
    );
    return true;
  });
});

test("a misspelled template variable in prose fails the build", async (t) => {
  const cwd = await stageProject(t, {
    "docs/partials/index.md": "# Index for {{ nmae }}\n",
  });

  await assert.rejects(build(cwd, false), (err: Error) => {
    assert.match(
      err.message,
      /index\.md: Unreplaced template placeholders: \{\{ nmae \}\}/,
    );
    return true;
  });
});

test("escapeUnknownPlaceholders escapes only expressions Handlebars can't resolve", () => {
  const content = [
    "{{ name }} {{capitalize name}} {{~ Version ~}} {{ monorepoName }} {{ custom }}",
    '{{ withAuroNamespace "button" }} {{ packageName }}',
    "{{ count }} {{item.title}} {{ value | async }}",
    "{{ 'HOME.TITLE' | translate }} {{ !flag }} {{ 1 + 2 }} {{ -1 }} {{ 'x' }} {{ @index }} {{ ../x }} {{ {a:1} }}",
    "{{this}} {{ null }} {{ name.length }} {{ name | uppercase }} {{ capitalize item.title }}",
    "{{#if name}}x{{else}}y{{/if}} {{~#if name~}}x{{~/if~}} {{!-- note --}} {{> partial}} {{{ raw }}} \\{{ done }}",
  ].join("\n");

  assert.equal(
    escapeUnknownPlaceholders(content, { custom: "x" }),
    [
      "{{ name }} {{capitalize name}} {{~ Version ~}} {{ monorepoName }} {{ custom }}",
      '{{ withAuroNamespace "button" }} {{ packageName }}',
      "\\{{ count }} \\{{item.title}} \\{{ value | async }}",
      "\\{{ 'HOME.TITLE' | translate }} \\{{ !flag }} \\{{ 1 + 2 }} \\{{ -1 }} \\{{ 'x' }} \\{{ @index }} \\{{ ../x }} \\{{ {a:1} }}",
      "\\{{this}} \\{{ null }} \\{{ name.length }} \\{{ name | uppercase }} \\{{ capitalize item.title }}",
      "{{#if name}}x{{else}}y{{/if}} {{~#if name~}}x{{~/if~}} {{!-- note --}} {{> partial}} {{{ raw }}} \\{{ done }}",
    ].join("\n"),
  );
});

test("escapeUnknownPlaceholders escapes Handlebars syntax in code but not in prose", () => {
  const handlebars =
    "{{#each items}}{{this}}{{else}}none{{/each}} {{~#if name~}}{{~/if~}} {{!-- note --}} {{> header}} {{{ raw }}} {{ name }}";
  const escaped =
    "\\{{#each items}}\\{{this}}\\{{else}}none\\{{/each}} \\{{~#if name~}}\\{{~/if~}} \\{{!-- note --}} \\{{> header}} \\{{{ raw }}} {{ name }}";
  const content = [
    "{{#if name}}x{{/if}}",
    "```hbs",
    handlebars,
    "```",
    `<pre><code>${handlebars}</code></pre>`,
    `<code>${handlebars}</code>`,
    `Use \`${handlebars}\` in templates.`,
    "{{> partial}}",
  ].join("\n");

  assert.equal(
    escapeUnknownPlaceholders(content),
    [
      "{{#if name}}x{{/if}}",
      "```hbs",
      escaped,
      "```",
      `<pre><code>${escaped}</code></pre>`,
      `<code>${escaped}</code>`,
      `Use \`${escaped}\` in templates.`,
      "{{> partial}}",
    ].join("\n"),
  );
});

test("Handlebars block, comment, partial and triple-stash syntax in snippets comes through unchanged", async (t) => {
  const source = [
    "{{!-- Lists the items --}}",
    "{{> header }}",
    "<ul>",
    "  {{#each items}}",
    "  <li>{{this}} {{{ html }}}</li>",
    "  {{else}}",
    "  <li>None</li>",
    "  {{/each}}",
    "</ul>",
    "",
  ].join("\n");
  const cwd = await stageProject(t, {
    "apiExamples/list.hbs": source,
    "docs/partials/index.md": [
      snippetPartial("./../apiExamples/list.hbs"),
      "```hbs",
      source.trimEnd(),
      "```",
      "",
      "Write `{{#each items}}` to loop.",
      "",
    ].join("\n"),
    // Nested include: filled by the second pass, not auro-library.
    "docs/pages/nested.md": [
      "<!-- AURO-GENERATED-CONTENT:START (FILE:src=./../docs/partials/list.md) -->",
      "<!-- AURO-GENERATED-CONTENT:END -->",
      "",
    ].join("\n"),
    "docs/partials/list.md": snippetPartial("./../apiExamples/list.hbs"),
  });

  await build(cwd, false);

  assert.equal(await copiedSnippet(cwd, "demo/index.md"), source.trimEnd());
  assert.equal(await copiedSnippet(cwd, "demo/nested.md"), source.trimEnd());
  const generated = await readFile(path.join(cwd, "demo/index.md"), "utf-8");
  const blocks = [
    ...generated.matchAll(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g),
  ];
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1][1], blocks[0][1]);
  assert.match(generated, /Write `\{\{#each items\}\}` to loop\./);
});

test("framework {{ }} in snippets comes through unchanged; template variables are still filled", async (t) => {
  const vue =
    "<template>\n  <p>{{ count }} {{ item.label }}</p>\n</template>\n";
  const cwd = await stageProject(t, {
    "apiExamples/counter.vue": vue,
    "docs/partials/index.md": [
      "# {{ capitalize name }}",
      "",
      "```html",
      '<script src="https://cdn.jsdelivr.net/npm/@aurodesignsystem/{{ namespace }}-{{ name }}@latest/+esm"></script>',
      "```",
      "",
      "```js",
      "const msg = `{{ greeting }}`;",
      "```",
      "",
      "<!-- AURO-GENERATED-CONTENT:START (FILE:src=./../docs/partials/vue.md) -->",
      "<!-- AURO-GENERATED-CONTENT:END -->",
      "",
    ].join("\n"),
    "docs/partials/vue.md": snippetPartial("./../apiExamples/counter.vue"),
  });

  await build(cwd, false);

  const generated = await readFile(path.join(cwd, "demo/index.md"), "utf-8");
  assert.match(generated, /# Tabs/);
  assert.match(generated, /@aurodesignsystem\/auro-tabs@latest/);
  assert.match(generated, /const msg = `\{\{ greeting \}\}`;/);
  const vueBlock = generated.match(
    /<pre class="language-vue"><code[^>]*>([\s\S]*?)<\/code><\/pre>/,
  );
  assert.ok(vueBlock, "no Vue snippet in demo/index.md");
  assert.equal(
    vueBlock[1].replaceAll("&lt;", "<").replaceAll("&gt;", ">"),
    vue.trimEnd(),
  );
});

test("Angular and expression {{ }} in snippets come through unchanged", async (t) => {
  const angular =
    "<h1>{{ 'HOME.TITLE' | translate }}</h1>\n<p *ngIf=\"!flag\">{{ !flag }} {{ 1 + 2 }} {{ 'x' }} {{ -1 }}</p>\n";
  const cwd = await stageProject(t, {
    "apiExamples/home.html": angular,
    "docs/partials/index.md": snippetPartial("./../apiExamples/home.html"),
  });

  await build(cwd, false);

  assert.equal(await copiedSnippet(cwd, "demo/index.md"), angular.trimEnd());
});

test("an escaped \\{{ name }} stays literal in a file with nested includes", async (t) => {
  const cwd = await stageProject(t, {
    "apiExamples/basic.html": "<auro-tabs>{{ name }}</auro-tabs>\n",
    "docs/partials/index.md": [
      "# {{ capitalize name }}",
      "",
      "```vue",
      "<p>\\{{ name }}</p>",
      "```",
      "",
      "<!-- AURO-GENERATED-CONTENT:START (FILE:src=./../docs/partials/basic.md) -->",
      "<!-- AURO-GENERATED-CONTENT:END -->",
      "",
    ].join("\n"),
    "docs/partials/basic.md": snippetPartial("./../apiExamples/basic.html"),
  });

  await build(cwd, false);

  const generated = await readFile(path.join(cwd, "demo/index.md"), "utf-8");
  assert.match(generated, /# Tabs/);
  assert.match(generated, /&lt;p&gt;\{\{ name \}\}&lt;\/p&gt;/);
  // Template variables in the nested snippet are still filled.
  assert.match(generated, /&lt;auro-tabs&gt;tabs&lt;\/auro-tabs&gt;/);
});

test("findUnreplacedPlaceholders ignores {{ }} inside code", () => {
  const content = [
    "Prose {{ one }}",
    '<pre class="language-html"><code class="language-html">{{ pre }}</code></pre>',
    "<code>{{ inline-html }}</code>",
    "```vue",
    "<p>{{ fenced }}</p>",
    "```",
    "Use `{{ inline }}` in templates.",
    "More {{ two }}",
  ].join("\n");

  assert.deepEqual(findUnreplacedPlaceholders(content), [
    "{{ one }}",
    "{{ two }}",
  ]);
});

test("blank lines in a snippet are kept as real newlines, never U+200B", async (t) => {
  const source =
    "function a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}\n\nfunction c() {}\n";
  const cwd = await stageProject(t, {
    "demo/utils/onTabSelected.js": source,
    "docs/partials/index.md": snippetPartial("./utils/onTabSelected.js"),
  });

  await build(cwd, false);

  const generated = await readFile(path.join(cwd, "demo/index.md"), "utf-8");
  // No literal blank line inside the <pre>: it would end the HTML block in marked.js.
  assert.ok(!/<pre[^>]*>[\s\S]*?\n[ \t]*\n[\s\S]*?<\/pre>/.test(generated));
  assert.equal(await copiedSnippet(cwd, "demo/index.md"), source.trimEnd());
});

test("a CSS snippet with top-level #id rules comes through unchanged", async (t) => {
  const source =
    ".foo {\n  color: red;\n}\n#custom-tab-example::part(slider) {\n  color: blue;\n}\n#other {\n  color: green;\n}\n";
  const cwd = await stageProject(t, {
    "apiExamples/custom-content.css": source,
    "docs/partials/index.md": snippetPartial(
      "./../apiExamples/custom-content.css",
    ),
  });

  await build(cwd, false);

  assert.equal(await copiedSnippet(cwd, "demo/index.md"), source.trimEnd());
});

test("a shell snippet with # comments and repeated blank lines comes through unchanged", async (t) => {
  const source = "# comment\necho hi\n\n\n# another\necho bye\n";
  const cwd = await stageProject(t, {
    "apiExamples/script.sh": source,
    "docs/partials/index.md": snippetPartial("./../apiExamples/script.sh"),
  });

  await build(cwd, false);

  assert.equal(await copiedSnippet(cwd, "demo/index.md"), source.trimEnd());
});

// Nested include: top-level CODE includes go through auro-library's markdown-magic.
test("a snippet included from inside a partial with $ replacement patterns ($$, $&, $', $`) comes through unchanged", async (t) => {
  const source = "const el = $$('auro-tabs');\nconst a = '$&';\nconst b = \"$'\";\nconst c = '$`';\n";
  const cwd = await stageProject(t, {
    "apiExamples/dollar.js": source,
    "docs/partials/index.md": [
      "<!-- AURO-GENERATED-CONTENT:START (FILE:src=./../docs/partials/example.md) -->",
      "<!-- AURO-GENERATED-CONTENT:END -->",
      "",
    ].join("\n"),
    "docs/partials/example.md": snippetPartial("./../apiExamples/dollar.js"),
  });

  await build(cwd, false);

  assert.equal(await copiedSnippet(cwd, "demo/index.md"), source.trimEnd());
});

test("a snippet included from inside a partial comes through unchanged; template variables are still filled", async (t) => {
  const source =
    "# comment\necho {{ name }}\n\n\n# another\n> quoted\n\necho bye\n";
  const cwd = await stageProject(t, {
    "apiExamples/script.sh": source,
    "docs/partials/index.md": [
      "# {{ capitalize name }}",
      "",
      "<!-- AURO-GENERATED-CONTENT:START (FILE:src=./../docs/partials/example.md) -->",
      "<!-- AURO-GENERATED-CONTENT:END -->",
      "",
    ].join("\n"),
    "docs/partials/example.md": snippetPartial("./../apiExamples/script.sh"),
  });

  await build(cwd, false);

  assert.equal(
    await copiedSnippet(cwd, "demo/index.md"),
    source.replace("{{ name }}", "tabs").trimEnd(),
  );
});

test("blank lines in a CRLF snippet don't end the HTML block", async (t) => {
  const source = "function a() {\r\n  return 1;\r\n}\r\n\r\nfunction b() {}\r\n";
  const cwd = await stageProject(t, {
    "apiExamples/crlf.js": source,
    "docs/partials/index.md": snippetPartial("./../apiExamples/crlf.js"),
  });

  await build(cwd, false);

  // marked.js reads CRLF and a lone CR as newlines.
  const generated = (
    await readFile(path.join(cwd, "demo/index.md"), "utf-8")
  ).replace(/\r\n|\r/g, "\n");
  assert.ok(!/<pre[^>]*>[\s\S]*?\n[ \t]*\n[\s\S]*?<\/pre>/.test(generated));
  assert.equal(
    await copiedSnippet(cwd, "demo/index.md"),
    source.replaceAll("\r\n", "\n").trimEnd(),
  );
});
