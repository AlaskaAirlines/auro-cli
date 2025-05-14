import { spawn } from "node:child_process";
import ora from "ora";

const shell = (command, _args) => {
  const commandString = `${command} ${_args ? _args.join(" ") : ""}`;

  // Initialize the spinner but don't start it - we'll just use it for completion status
  const spinner = ora();

  // Parse command string if no args are provided
  let finalCommand = command;
  let finalArgs = _args || [];

  if (!_args && typeof command === "string") {
    const parts = command.split(" ");
    finalCommand = parts[0];
    finalArgs = parts.slice(1);
  }

  // Simple check for watch mode - if the command contains --watch or -w flags
  const isWatchMode =
    commandString.includes("--watch") || commandString.includes(" -w");

  // Use different stdio configurations based on watch mode
  const stdio = isWatchMode
    ? "inherit" // Full TTY support for watch mode
    : ["inherit", "pipe", "pipe"]; // Capture output but allow input for normal mode

  const child = spawn(finalCommand, finalArgs, {
    stdio,
    shell: true,
  });

  // Only set up output capture if we're not in watch mode (stdio isn't 'inherit')
  if (!isWatchMode) {
    // Store command output to display after completion
    const commandOutput = [];

    child.stdout?.on("data", (data) => {
      // Convert buffer to string
      const output = data.toString();

      // Store full output
      commandOutput.push(output);

      // Output directly to console
      process.stdout.write(output);
    });

    child.stderr?.on("data", (data) => {
      const output = data.toString();
      commandOutput.push(output);
      process.stderr.write(output);
    });
  }

  // Set up a promise to track command completion
  return new Promise((resolve, reject) => {
    child.on("close", (code) => {
      if (code !== 0) {
        // In watch mode, don't treat exit codes as errors - these are typically user terminations
        if (isWatchMode) {
          spinner.info(`Watch mode terminated with code ${code}`);
          resolve(); // Resolve without an error for watch mode commands
        } else {
          spinner.fail(`${commandString} failed (code ${code})`);
          reject(new Error(`Command failed with exit code ${code}`));
        }
      } else {
        spinner.succeed(`${commandString} completed successfully`);
        resolve();
      }
    });
  });
};

export { shell };
