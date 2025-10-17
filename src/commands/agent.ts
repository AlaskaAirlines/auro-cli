import fs from "node:fs/promises";
import path from "node:path";
import { program } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { createMultiGitterDependencyTreeConfig } from "#scripts/agent/run-migrations/writeMultiGitterConfig.js";
import {
  formatDependencyTree,
  getBatchedUpdateOrder,
} from "#scripts/formatDependencyTree.ts";
import { fromCliRoot, withHomeDir } from "#utils/pathUtils.js";
import { shell } from "#utils/shell.js";

// Multi-gitter and other config files live here
const CONFIG_DIR = withHomeDir("run-migrations", "config");
// Generated output files live here
const OUTPUT_DIR = withHomeDir("run-migrations", "outputs");

enum AgentActions {
  RunMigration = "run-migration",
  // Add more actions as needed
}

interface AgentAnswers {
  agentAction: AgentActions;
}

// Agent component options
// =========================================================

const auroComponents = [
  "@aurodesignsystem/auro-accordion",
  "@aurodesignsystem/auro-alert",
  "@aurodesignsystem/auro-avatar",
  "@aurodesignsystem/auro-background",
  "@aurodesignsystem/auro-backtotop",
  "@aurodesignsystem/auro-button",
  "@aurodesignsystem/auro-badge",
  "@aurodesignsystem/auro-banner",
  "@aurodesignsystem/auro-card",
  "@aurodesignsystem/auro-carousel",
  "@aurodesignsystem/auro-datetime",
  "@aurodesignsystem/auro-dialog",
  "@aurodesignsystem/auro-drawer",
  "@aurodesignsystem/auro-formkit",
  "@aurodesignsystem/auro-flight",
  "@aurodesignsystem/auro-flightline",
  "@aurodesignsystem/auro-header",
  "@aurodesignsystem/auro-hyperlink",
  "@aurodesignsystem/auro-icon",
  "@aurodesignsystem/auro-loader",
  "@aurodesignsystem/auro-lockup",
  "@aurodesignsystem/auro-nav",
  "@aurodesignsystem/auro-pane",
  "@aurodesignsystem/auro-popover",
  "@aurodesignsystem/auro-sidenav",
  "@aurodesignsystem/auro-skeleton",
  "@aurodesignsystem/auro-slideshow",
  "@aurodesignsystem/auro-table",
  "@aurodesignsystem/auro-tabs",
  "@aurodesignsystem/auro-toast",
];

const auroPackages = [
  ...auroComponents,
  "@aurodesignsystem/auro-library",
  "@aurodesignsystem/WebCoreStyleSheets",
  "@aurodesignsystem/AuroDesignTokens",
  "@aurodesignsystem/auro-cli",
  "@alaskaairux/icons",
];

// Agent helpers
// =========================================================
interface DependencyTreeAnswers {
  useExisting: boolean;
}

async function getOrCreateDependencyTree(
  relevantPackages: string[],
): Promise<string> {
  // check if output and config directories exist, if not create them
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    console.error("Failed to create output or config directories:", error);
    process.exit(1);
  }

  const spinner = ora("Creating dependency tree...").start();

  // Create multi-gitter dependency tree configuration
  spinner.text = "Creating multi-gitter dependency tree configuration...";
  await createMultiGitterDependencyTreeConfig(CONFIG_DIR);

  spinner.text = "Scraping dependencies from Auro packages...";

  // Run multi-gitter using the generated config
  const scriptPath = fromCliRoot("static", "getAuroDeps.js");
  const multiGitterCommand = `multi-gitter run "node ${scriptPath}" --config ${path.join(CONFIG_DIR, "multi-gitter_DEPENDENCY_TREE.yml")}`;
  try {
    await shell(multiGitterCommand);
  } catch (error) {
    spinner.fail("Failed to generate dependency tree:");
    console.error(error);
    process.exit(1);
  }

  spinner.text = "Generating dependency tree JSON file using packages...";
  await formatDependencyTree(OUTPUT_DIR, relevantPackages);

  spinner.succeed("Dependency tree generated successfully.");

  return path.join(OUTPUT_DIR, "dependencyTree.json");
}

const getDependencyBatchesFromTree = async (
  dependencyTreePath: string,
): Promise<string[][]> => {
  const spinner = ora("Loading dependency tree...").start();
  const dependencyTree = JSON.parse(
    await fs.readFile(dependencyTreePath, "utf-8"),
  );

  spinner.text = "Processing dependency tree...";
  const batches = getBatchedUpdateOrder(dependencyTree);
  spinner.succeed("Dependency batches created successfully.");

  return batches;
};

// Agent command
// =========================================================
export default program.command("agent").action(async (option) => {
  const answers = await inquirer.prompt([
    {
      type: "select",
      name: "agentAction",
      message: "What agent action do you want to perform?",
      choices: [
        {
          name: "Run a migration on auro components",
          value: AgentActions.RunMigration,
        },
      ],
      default: [AgentActions.RunMigration],
    },

    {
      type: "input",
      name: "migrationId",
      message: "What migration id do you want to run?",
      when: (answers) => answers.agentAction === AgentActions.RunMigration,
      validate: (input) =>
        input.trim() !== "" || "Migration id cannot be empty.",
    },

    {
      type: "confirm",
      name: "useExisting",
      message: "Would you like to specify starting packages?",
      default: true,
      transformer: (value) =>
        value ? "Yes = Packages related to selections" : "No = All packages",
      when: (answers) => answers.agentAction === AgentActions.RunMigration,
    },

    {
      type: "checkbox",
      name: "startWithComponents",
      message:
        "Enter the components to start with (comma-separated, blank for all):",
      choices: auroComponents.map((component) => ({
        name: component.replace("@aurodesignsystem/", ""),
        value: component,
      })),
      when: (answers) =>
        answers.agentAction === AgentActions.RunMigration &&
        answers.useExisting,
    },
  ]);

  switch (answers.agentAction) {
    case AgentActions.RunMigration: {
      // Placeholder for actual migration logic
      const spinner = ora("Running migration...").start();
      const dependencyTreePath = await getOrCreateDependencyTree(
        answers.startWithComponents,
      );

      spinner.text = "Getting dependency batches from tree...";
      const dependencyBatches =
        await getDependencyBatchesFromTree(dependencyTreePath);

      const batchedUpdateOrderText = dependencyBatches
        .map(
          (batch, index) =>
            `Batch ${index + 1}\n${batch.map((pkg) => `  - ${pkg.replace("@aurodesignsystem", "AlaskaAirlines").replace("@alaskaairux/icons", "AlaskaAirlines/Icons")}`).join("\n")}`,
        )
        .join("\n\n");

      console.log(batchedUpdateOrderText);

      spinner.text = "Running migrations on dependency batches...";
      // DO STUFF HERE :)

      new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate async operation
      spinner.succeed("Migration process completed successfully.");

      // spinner.succeed("Migration process completed.");
      break;
    }
    // Add more cases for additional actions as needed
    default:
      console.error("Unknown action selected.");
    // spinner.fail("Unknown action selected.");
  }
});
