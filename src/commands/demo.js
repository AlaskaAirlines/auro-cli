import { program } from "commander";
import { shell } from "../utils/shell.js";

export default program
  .command("demo")
  .description("demo command")
  .action(() => {
    shell("multi-gitter print ./scripts/multi-gitter/check-status.sh");
  });
