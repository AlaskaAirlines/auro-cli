import { program } from "commander";
import figlet from "figlet";
import chalk from "chalk";

export default program
  .command('hello')
  .description('Says hello to you')
  .option('-n, --name <type>', 'Customize the name')
  .action((options) => {
    console.log(
      chalk.greenBright(figlet.textSync(`Hello, ${options.name || 'you'}`, { horizontalLayout: "half" }))
    );
});