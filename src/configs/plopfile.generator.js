import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const cliRootDir = path.resolve(path.dirname(__filename), "..");
const configDir = path.join(cliRootDir, "configs");

function fromDefaultTemplateDir(...paths) {
  return path.join(configDir, "templates", "default", ...paths);
}

/**
 *
 * @param {import("plop").NodePlopAPI} plop
 */
export default async function (plop) {
  // Loads the npmInstall action type
  await plop.load("plop-pack-npm-install");

  plop.setHelper("auroComponentName", (str) => {
    // Will return something like `AuroButton` for `button`
    return `Auro${plop.getHelper("pascalCase")(str)}`;
  });

  plop.setHelper("auroDashCase", (str) => {
    // Will return something like `auro-button` for `button`
    return `auro-${plop.getHelper("dashCase")(str)}`;
  });

  plop.setGenerator("component-generator", {
    prompts: [
      {
        type: "input",
        name: "commandPlsIgnore",
        message: "This is a placeholder workaround to ignore the command line",
      },
      {
        type: "input",
        name: "name",
        message: "What should this component be called?",
      },
      {
        type: "input",
        name: "description",
        message: "What does this component do? (It is a component that...)",
      },
    ],
    actions: (data) => {
      /** @type {import("plop").ActionType[]} */
      const actions = [];

      actions.push("Generating component files...");
      // - Component root directory
      actions.push({
        type: "add",
        force: true,
        path: "{{ auroDashCase name }}/package.json",
        templateFile: fromDefaultTemplateDir("package.json"),
      });

      // - src/auro-{{ name }}.js
      actions.push({
        type: "add",
        force: true,
        path: "{{ auroDashCase name }}/src/{{ auroDashCase name }}.js",
        templateFile: fromDefaultTemplateDir("src", "component.js.hbs"),
      });

      // - src/index.ts
      actions.push({
        type: "add",
        force: true,
        path: "{{ auroDashCase name }}/src/index.js",
        templateFile: fromDefaultTemplateDir("src", "index.js.hbs"),
      });

      // - src/registered.ts
      actions.push({
        type: "add",
        force: true,
        path: "{{ auroDashCase name }}/src/registered.js",
        templateFile: fromDefaultTemplateDir("src", "registered.js.hbs"),
      });

      // - src/styles/*
      const styleTemplateDir = fromDefaultTemplateDir("src", "styles");

      actions.push({
        type: "addMany",
        force: true,
        destination: "{{ auroDashCase name }}/src/styles",
        base: styleTemplateDir,
        templateFiles: `${styleTemplateDir}/**.scss`,
      });

      // - src/apiExamples/*
      const apiExampleDir = fromDefaultTemplateDir("apiExamples");

      actions.push({
        type: "addMany",
        force: true,
        destination: "{{ auroDashCase name }}/apiExamples",
        base: apiExampleDir,
        templateFiles: `${apiExampleDir}/*.hbs`,
      });

      // - scripts/wca/{{ auroDashCase name }}.js
      actions.push({
        type: "add",
        force: true,
        path: "{{ auroDashCase name }}/scripts/wca/{{ auroDashCase name }}.js",
        templateFile: fromDefaultTemplateDir(
          "scripts",
          "wca",
          "wca-component.js.hbs",
        ),
      });

      // - demo/*
      const demoTemplateDir = fromDefaultTemplateDir("demo");

      actions.push({
        type: "addMany",
        force: true,
        destination: "{{ auroDashCase name }}/demo",
        base: demoTemplateDir,
        templateFiles: `${demoTemplateDir}/*`,
      });

      // - docs/*
      const docsTemplateDir = fromDefaultTemplateDir("docs");

      actions.push({
        type: "addMany",
        force: true,
        destination: "{{ auroDashCase name }}/docs",
        base: docsTemplateDir,
        templateFiles: `${docsTemplateDir}/**`,
      });

      // post generation tasks
      // ------------------------------------------------

      actions.push("Installing dependencies...");

      actions.push({
        type: "npmInstall",
        path: `${process.cwd()}/${plop.renderString("{{ auroDashCase name }}", data)}`,
        verbose: true,
      });

      actions.push(`Done! To get started, run the following commands:

$ cd ${plop.renderString("{{ auroDashCase name }}", data)}
$ npm run dev

Happy coding!

`);

      return actions;
    },
  });
}
