import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export function getAuroHomeDir() {
  const homeDir = os.homedir() || process.env.HOME || process.env.USERPROFILE;

  if (!homeDir) {
    throw new Error("Unable to determine user home directory");
  }

  return path.join(homeDir, ".auro");
}

export function withHomeDir(...args) {
  return path.join(getAuroHomeDir(), ...args);
}

export function fromCliRoot(...relativePath) {
  const cliScript = fs.realpathSync(process.argv[1]);
  const dirname = path.dirname(cliScript);

  return path.resolve(dirname, ...relativePath);
}
  
export const configPath = (file) => fromCliRoot("configs",file)

export const migrationPath = (path) => fromCliRoot("migrations",path)
