import path from "node:path";
import { fileURLToPath } from "node:url";
import { globby } from "globby";

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
export default function (plop) {
  plop.setHelper("auroComponentName", (str) => {
    // Will return something like `AuroButton` for `button`
    return `Auro${str.charAt(0).toUpperCase() + str.slice(1)}`;
  });

  plop.setHelper("auroDashCase", (str) => {
    // Will return something like `auro-button` for `button`
    return `auro-${str}`;
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
    ],
    actions: (data) => {
      /** @type {import("plop").ActionType[]} */
      const actions = [];

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
      const styleTemplateDir = fromDefaultTemplateDir("styles");

      actions.push({
        type: "addMany",
        force: true,
        destination: "{{ auroDashCase name }}/src/styles",
        base: styleTemplateDir,
        templateFiles: `${styleTemplateDir}/*.scss`,
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

      return actions;
    },
  });
}
