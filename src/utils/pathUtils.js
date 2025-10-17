import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
  const filename = fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);

  return path.resolve(dirname, ...relativePath);
}
