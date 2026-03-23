const { computeMidpCoverage } = require('../services/coverageService');

describe('coverageService', () => {
  it('flags missing deliverable when no file matched', () => {
    const midp = {
      containers: [{ id: 'c1', type: 'DR', tidpSource: { discipline: 'MEP' } }]
    };
    const fileResults = [
      {
        midpMatch: {
          matched: true,
          containerId: 'c2'
        }
      }
    ];
    const c = computeMidpCoverage(midp, fileResults);
    expect(c.missingDeliverables.length).toBe(1);
    expect(c.expectedCount).toBe(1);
    expect(c.matchedCount).toBe(0);
  });

  it('counts matched container', () => {
    const midp = {
      containers: [{ id: 'c1', type: 'DR', tidpSource: { discipline: 'ARC' } }]
    };
    const fileResults = [{ midpMatch: { matched: true, containerId: 'c1' } }];
    const c = computeMidpCoverage(midp, fileResults);
    expect(c.missingDeliverables.length).toBe(0);
    expect(c.matchedCount).toBe(1);
  });
});
