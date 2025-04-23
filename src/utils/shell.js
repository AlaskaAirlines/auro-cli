import { spawn } from "node:child_process";
import ora from "ora";

const shell = (command, _args) => {
  const spinner = ora(
    `Running ${command} ${_args ? _args.join(" ") : ""}`,
  ).start();

  const child = spawn(command, _args || [], { stdio: "pipe", shell: true });

  child.stdout.on("data", (data) => {
    spinner.text = data.toString();
  });

  child.stderr.on("data", (data) => {
    spinner.text = data.toString();
  });

  child.on("close", (code) => {
    spinner.stop();
    if (code !== 0) {
      spinner.fail(`${command} ${_args ? _args.join(" ") : ""} (code ${code})`);
    } else {
      spinner.succeed(
        `${command} ${_args ? _args.join(" ") : ""} (code ${code})`,
      );
    }
  });
};

export { shell };
