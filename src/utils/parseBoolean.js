/**
 * Parse boolean values from command line arguments
 * @param {string} value - The string value to parse
 * @returns {boolean} - The parsed boolean value
 */
export function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return true; // Default to true if just --watch is provided
}
