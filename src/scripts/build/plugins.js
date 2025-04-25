import path from "node:path";
import { glob } from "glob";

export function watchGlobs(globs) {
  return {
    buildStart() {
      const items = Array.isArray(globs) ? globs : [globs];
      for (const item of items) {
        for (const filename of glob.sync(path.resolve(item))) {
          this.addWatchFile(filename);
        }
      }
    },
  };
}
