/**
 * Escapes special regex characters in a string so it can be safely used as
 * a literal search term inside `new RegExp()`.
 *
 * Without this, two problems exist whenever raw user input is passed
 * straight into RegExp:
 *
 *  1. Security (ReDoS): a specially-crafted search string can trigger
 *     catastrophic backtracking in the regex engine, hanging the server on
 *     that single request - a real denial-of-service risk once this API is
 *     reachable from the internet, not just trusted local users.
 *
 *  2. Correctness: characters like `.` mean "any character" in a regex,
 *     not a literal dot - so searching for an IP address like
 *     "192.168.1.1" would also match "192x168x1x1", which is simply wrong
 *     search behavior, not just a security gap.
 *
 * Escaping the input fixes both at once.
 */
function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
