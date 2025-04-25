import path from "node:path";
import { glob } from "glob";

/**
 * Creates a plugin that watches file globs and adds them to Rollup's watch list.
 * @param {string|string[]} globs - Glob pattern(s) to watch
 * @returns {object} - Rollup plugin
 */
export function watchGlobs(globs) {
  return {
    name: "watch-globs",
    buildStart() {
      const items = Array.isArray(globs) ? globs : [globs];

      for (const item of items) {
        try {
          for (const filename of glob.sync(path.resolve(item))) {
            this.addWatchFile(filename);
          }
        } catch (error) {
          this.error(`Error watching glob pattern "${item}": ${error.message}`);
        }
      }
    },
  };
}
