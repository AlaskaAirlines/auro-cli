import { program } from "commander";
import Docs from "#scripts/docs-generator.js";

export default program
  .command("cem-docs")
  .action(async () => {
    await Docs.generate();
  });
