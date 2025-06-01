import { IGNORED_FILES } from "../constant/constant.js";

/**
 * Returns true if the given filename matches any of the IGNORED_FILES patterns.
 *
 * Supports:
 *   - Directory patterns (e.g., "dist/")
 *   - Extension patterns (e.g., "*.log")
 *   - Exact matches
 *   - Patterns with * wildcards (e.g., "foo*bar")
 *
 * @param {string} filename
 * @returns {boolean}
 */
export function shouldIgnoreFile(filename) {
  if (!filename) {
    return false; // Ignore empty filenames
  }
  return IGNORED_FILES.some((pattern) => {
    if (pattern.endsWith("/")) {
      // Directory pattern (e.g., "dist/")
      return filename.startsWith(pattern) || filename.includes(`/${pattern}`);
    } else if (pattern.startsWith("*.")) {
      // Extension pattern (e.g., "*.log")
      return filename.endsWith(pattern.slice(1));
    } else if (pattern.includes("*")) {
      // More complex pattern matching could be added here
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return regex.test(filename);
    }
    // Exact match
    return filename === pattern || filename.endsWith(`/${pattern}`);
  });
}
