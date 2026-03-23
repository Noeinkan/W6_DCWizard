const {
  parseNamingConvention,
  parseFilename,
  matchToMIDP,
  classifyDocument,
  containerKeyForMatch
} = require('../services/validationCore');

describe('validationCore', () => {
  it('parseFilename validates segments', () => {
    const conv = parseNamingConvention({
      namingFields: [{ fieldName: 'Project' }, { fieldName: 'Type' }]
    });
    const ok = parseFilename('PRJ-DR.pdf', conv);
    expect(ok.valid).toBe(true);
    expect(ok.fields.project).toBe('PRJ');
    expect(ok.fields.type).toBe('DR');
  });

  it('matchToMIDP scores type and discipline', () => {
    const midp = {
      containers: [
        {
          id: 'c1',
          type: 'DR',
          tidpSource: { discipline: 'ARC' }
        }
      ]
    };
    const parsed = { type: 'DR', originator: 'ARC' };
    const m = matchToMIDP(parsed, midp);
    expect(m.matched).toBe(true);
    expect(m.containerId).toBe('c1');
  });

  it('containerKeyForMatch is stable without id', () => {
    const c = { name: 'A', type: 'DR' };
    expect(containerKeyForMatch(c, 0)).toMatch(/^synthetic:0:/);
  });

  it('classifyDocument maps revision', () => {
    const r = classifyDocument({ type: 'DR', originator: 'ARC', revision: 'C02' });
    expect(r.suitability.code).toBe('S2');
  });

  it('parseFilename returns invalid when no naming convention defined', () => {
    const conv = parseNamingConvention({});
    const result = parseFilename('anything.pdf', conv);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/No naming convention/);
  });

  it('parseFilename rejects too few segments', () => {
    const conv = parseNamingConvention({
      namingFields: [{ fieldName: 'Project' }, { fieldName: 'Type' }, { fieldName: 'Originator' }]
    });
    const result = parseFilename('PRJ-DR.pdf', conv);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Expected 3 fields/);
  });
});
