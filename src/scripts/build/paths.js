/**
 * Common node_modules directory search paths for resolving packages
 * in monorepo and hoisted dependency structures.
 */
export const MODULE_DIRS = [
  "node_modules",
  "../node_modules",
  "../../node_modules",
  "../../../node_modules",
];
