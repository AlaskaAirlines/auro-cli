import { program } from "commander";
import { shell } from "../utils/shell.js";

export default program
  .command('dev')
  .description('Runs web-dev-server command')
  .option('-p, --path <type>', 'Customize the path')
  .action((options) => {

    shell('npx web-dev-server', [`--open ${options.path || "demo/"}`, '--node-resolve', '--watch'])

});