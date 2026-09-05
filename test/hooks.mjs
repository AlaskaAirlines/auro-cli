/**
 * Test-only ESM resolver hook.
 *
 * Source modules import each other with `.js` specifiers (via the package's
 * `#alias/*` map) because that's what the production bundle needs. When the test
 * runner executes the TypeScript sources directly (Node 22 type-stripping), those
 * `.js` targets don't exist on disk — the sibling is `.ts`. This hook retries a
 * failed `.js` resolution as `.ts`, so a value import like
 * `#utils/fetchManifest.js` resolves to `src/utils/fetchManifest.ts`.
 *
 * Genuinely-`.js` sources (e.g. `#utils/auroSplash.js`) resolve on the first
 * attempt and never reach the fallback, so they're unaffected.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      specifier.endsWith(".js") &&
      (error?.code === "ERR_MODULE_NOT_FOUND" ||
        error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED")
    ) {
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
    throw error;
  }
}
