import { api, cem } from "#scripts/docs/index.ts";
import { codeConnect } from "#scripts/figma/code-connect.ts";

/**
 * Analyzes web components and generates API documentation.
 * Code Connect runs right after the CEM, so `auro build` and `auro dev` refresh
 * the Code Connect files whenever the CEM is rebuilt.
 */
export async function analyzeComponents() {
  await cem();

  const code = await codeConnect({ quiet: true });
  if (code !== 0) {
    throw new Error(`Code Connect failed (exit code ${code})`);
  }

  await api();
}
