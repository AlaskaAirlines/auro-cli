import { spawn } from "node:child_process";
import ora from "ora";

const shell = (command, _args) => {
  const commandString = `${command} ${_args ? _args.join(" ") : ""}`;

  // Initialize the spinner but don't start it - we'll just use it for completion status
  const spinner = ora();

  // Store command output to display after completion
  const commandOutput = [];

  const child = spawn(command, _args || [], { stdio: "pipe", shell: true });

  child.stdout.on("data", (data) => {
    // Convert buffer to string
    const output = data.toString();

    // Store full output
    commandOutput.push(output);

    // Output directly to console
    process.stdout.write(output);
  });

  child.stderr.on("data", (data) => {
    const output = data.toString();
    commandOutput.push(output);
    process.stderr.write(output);
  });

  child.on("close", (code) => {
    if (code !== 0) {
      spinner.fail(`${commandString} failed (code ${code})`);
    } else {
      spinner.succeed(`${commandString} completed successfully`);
    }
  });
};

export { shell };
