const { containerKeyForMatch } = require('./validationCore');

/**
 * MIDP expected deliverables vs files that matched a container (by container id).
 */

function computeMidpCoverage(midpSnapshot, fileResults) {
  const containers = midpSnapshot?.containers || [];
  const matchedKeys = new Set();
  for (const fr of fileResults) {
    if (fr.midpMatch?.matched && fr.midpMatch.containerId != null) {
      matchedKeys.add(String(fr.midpMatch.containerId));
    }
  }

  const missing = [];
  containers.forEach((c, i) => {
    const key = containerKeyForMatch(c, i);
    if (!matchedKeys.has(key)) {
      missing.push({
        containerId: key,
        name: c.name || c.container_name || key,
        type: c.type || c.format_type
      });
    }
  });

  const expectedCount = containers.length;
  const matchedCount = expectedCount - missing.length;

  return {
    expectedCount,
    matchedCount,
    missingDeliverables: missing
  };
}

module.exports = { computeMidpCoverage };
