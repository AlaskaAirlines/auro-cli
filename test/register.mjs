/**
 * Registers the test-only resolver hook (see ./hooks.mjs). Loaded via
 * `node --import ./test/register.mjs` before the test files, so the hook is in
 * place for every subsequent import.
 */
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
