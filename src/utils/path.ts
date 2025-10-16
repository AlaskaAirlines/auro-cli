import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

export const cliRootDir = path.resolve(path.dirname(__filename), "..");

export const configPath = (file: string) => path.join(
      cliRootDir,
      "dist",
      "configs",
      file
    );