import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Copies the processed README.md from the project root into the demo directory as readme.md.
 */
export function copyReadmeToDemo() {
  const cwd = process.cwd();
  const readmeSrc = resolve(cwd, "README.md");
  const readmeDest = join(resolve(cwd, "demo"), "readme.md");

  if (!existsSync(readmeSrc)) {
    return;
  }

  const demoDir = resolve(cwd, "demo");
  if (!existsSync(demoDir)) {
    mkdirSync(demoDir, { recursive: true });
  }

  copyFileSync(readmeSrc, readmeDest);
}
