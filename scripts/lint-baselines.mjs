import { relative } from "node:path";

function normalizePath(root, filePath) {
  return relative(root, filePath).split("\\").join("/");
}

function baselineKey(file, rule) {
  return `${file}:${rule}`;
}

/**
 * Reconciles lint output with the exact-count Cumulus debt baseline.
 *
 * Exact matches are suppressed from normal ESLint output. A smaller count is
 * stale debt and a larger count is expanded debt; both remain visible and add
 * a deterministic baseline error.
 */
export function reconcileLintBaselines(results, baselines, root) {
  const expected = new Map(
    baselines.map(({ file, rule, count }) => [baselineKey(file, rule), count]),
  );
  const actual = new Map();

  for (const result of results) {
    const file = normalizePath(root, result.filePath);
    for (const message of result.messages) {
      if (message.ruleId === null) continue;
      const key = baselineKey(file, message.ruleId);
      if (!expected.has(key)) continue;
      actual.set(key, (actual.get(key) ?? 0) + 1);
    }
  }

  const mismatches = [];
  const exactKeys = new Set();
  for (const [key, expectedCount] of expected) {
    const actualCount = actual.get(key) ?? 0;
    if (actualCount === expectedCount) {
      exactKeys.add(key);
      continue;
    }
    mismatches.push({ key, expected: expectedCount, actual: actualCount });
  }

  const filteredResults = results.map((result) => {
    const file = normalizePath(root, result.filePath);
    const messages = result.messages.filter((message) => {
      if (message.ruleId === null) return true;
      return !exactKeys.has(baselineKey(file, message.ruleId));
    });
    return {
      ...result,
      messages,
      errorCount: messages.filter((message) => message.severity === 2).length,
      warningCount: messages.filter((message) => message.severity === 1).length,
      fatalErrorCount: messages.filter((message) => message.fatal === true).length,
      fixableErrorCount: messages.filter(
        (message) => message.severity === 2 && message.fix !== undefined,
      ).length,
      fixableWarningCount: messages.filter(
        (message) => message.severity === 1 && message.fix !== undefined,
      ).length,
    };
  });

  return { results: filteredResults, mismatches };
}

