/**
 * Ported from Capsar server/services/dcService.js (naming + MIDP heuristics).
 */

const TYPE_CODE_MAP = {
  DR: 'Drawing',
  SP: 'Specification',
  CA: 'Calculation',
  MS: 'Model',
  RV: 'Report',
  SC: 'Schedule',
  PP: 'Presentation',
  HS: 'Health & Safety',
  CO: 'Correspondence',
  MN: 'Minutes',
  PR: 'Programme',
  SU: 'Survey',
  ST: 'Statement',
  HE: 'Health Examination',
  IN: 'Installation',
  TE: 'Test Record',
  WP: 'Work Package'
};

const ORIGINATOR_DISCIPLINE_MAP = {
  ARC: 'Architecture',
  STR: 'Structure',
  MEP: 'MEP',
  CIV: 'Civil',
  MEC: 'Mechanical',
  ELE: 'Electrical',
  PLB: 'Plumbing',
  FIR: 'Fire',
  INT: 'Interior Design',
  LAN: 'Landscape',
  GEO: 'Geotechnical',
  ENV: 'Environmental',
  PM: 'Project Management',
  SV: 'Survey',
  CS: 'Cost',
  CN: 'Construction'
};

function revisionToSuitability(revision) {
  if (!revision) return { code: 'S0', label: 'Work in Progress' };
  const prefix = revision.toUpperCase().charAt(0);
  if (prefix === 'P') return { code: 'S0', label: 'Work in Progress' };
  if (prefix === 'D') return { code: 'S1', label: 'Suitable for Coordination' };
  if (prefix === 'C') return { code: 'S2', label: 'Suitable for Construction' };
  if (prefix === 'A') return { code: 'S3', label: 'As-Built' };
  if (prefix === 'S') return { code: 'S4', label: 'Spatial Coordination' };
  return { code: 'S0', label: 'Work in Progress' };
}

function parseNamingConvention(bepSnapshot) {
  const namingFields = bepSnapshot?.namingFields || [];
  const fields = namingFields
    .filter((f) => f.fieldName && f.fieldName.trim())
    .map((f) => f.fieldName.replace(/[\[\]]/g, '').trim());
  return { fields, separator: '-' };
}

function parseFilename(filename, convention) {
  const { fields, separator } = convention;
  const base = filename.replace(/\.[^.]+$/, '');
  const segments = base.split(separator);
  const errors = [];
  const parsed = {};

  if (fields.length === 0) {
    return { valid: false, fields: {}, errors: ['No naming convention defined'] };
  }

  if (segments.length < fields.length) {
    errors.push(`Expected ${fields.length} fields, found ${segments.length}`);
  }
  if (segments.length > fields.length) {
    errors.push(`Too many segments: expected ${fields.length}, found ${segments.length}`);
  }

  fields.forEach((fieldName, i) => {
    const key = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    parsed[key] = segments[i] || '';
    if (!segments[i]) {
      errors.push(`Missing field: ${fieldName}`);
    }
  });

  return { valid: errors.length === 0, fields: parsed, errors };
}

function containerKeyForMatch(container, index) {
  if (container?.id != null && container.id !== '') return String(container.id);
  const name = container?.name || container?.container_name || 'item';
  const type = container?.type || container?.format_type || '';
  return `synthetic:${index}:${name}:${type}`;
}

function matchToMIDP(parsedFields, midpSnapshot) {
  const containers = midpSnapshot?.containers || [];
  if (containers.length === 0) {
    return { matched: false, notes: 'No MIDP containers available' };
  }

  const typeKey = Object.keys(parsedFields).find((k) => k.includes('type'));
  const originatorKey = Object.keys(parsedFields).find(
    (k) => k.includes('originator') || k.includes('role')
  );
  const typeVal = typeKey ? (parsedFields[typeKey] || '').toUpperCase() : '';
  const originatorVal = originatorKey ? (parsedFields[originatorKey] || '').toUpperCase() : '';

  let match = null;
  let score = 0;
  let matchIndex = -1;

  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    let s = 0;
    const containerType = (container.type || container.format_type || '').toUpperCase();
    const containerDiscipline = (
      container.tidpSource?.discipline ||
      container.discipline ||
      ''
    ).toUpperCase();
    const containerTeam = (container.tidpSource?.teamName || container.task_name || '').toUpperCase();

    if (typeVal && containerType.includes(typeVal)) s += 2;
    if (originatorVal && (containerDiscipline.includes(originatorVal) || containerTeam.includes(originatorVal)))
      s += 2;
    if (s > score) {
      score = s;
      match = container;
      matchIndex = i;
    }
  }

  if (!match || score === 0) {
    return { matched: false, notes: 'No matching container in MIDP' };
  }

  let timing = 'unscheduled';
  const dueDate = match.dueDate || match.due_date;
  if (dueDate) {
    const due = new Date(dueDate);
    const today = new Date();
    if (!Number.isNaN(due.getTime())) {
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      timing = diffDays > 7 ? 'early' : diffDays >= -3 ? 'on-time' : 'late';
    }
  }

  return {
    matched: true,
    containerId: containerKeyForMatch(match, matchIndex),
    containerName: match.name || match.container_name,
    milestone: match.milestone || match.delivery_milestone,
    dueDate,
    timing
  };
}

function classifyDocument(parsedFields) {
  const typeKey = Object.keys(parsedFields).find((k) => k.includes('type'));
  const originatorKey = Object.keys(parsedFields).find(
    (k) => k.includes('originator') || k.includes('role')
  );
  const revisionKey = Object.keys(parsedFields).find((k) => k.includes('revision'));

  const typeCode = typeKey ? (parsedFields[typeKey] || '').toUpperCase() : '';
  const originatorCode = originatorKey ? (parsedFields[originatorKey] || '').toUpperCase() : '';
  const revisionCode = revisionKey ? (parsedFields[revisionKey] || '') : '';

  return {
    documentType: TYPE_CODE_MAP[typeCode] || typeCode || 'Unknown',
    discipline: ORIGINATOR_DISCIPLINE_MAP[originatorCode] || originatorCode || 'Unknown',
    suitability: revisionToSuitability(revisionCode)
  };
}

module.exports = {
  parseNamingConvention,
  parseFilename,
  matchToMIDP,
  classifyDocument,
  revisionToSuitability,
  containerKeyForMatch
};
