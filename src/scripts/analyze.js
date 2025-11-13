
import { cem, api } from '#scripts/docs/index.ts';

/**
 * Analyzes web components and generates API documentation.
 */
export async function analyzeComponents() {
  
  await cem();

  await api();

}