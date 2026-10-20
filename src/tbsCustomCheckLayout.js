// Independent positions of the four printed Custom check fields, measured in inches
// from the upper-left corner of the check area (not the full paper).
export const CUSTOM_CHECK_FIELDS = Object.freeze({
  date: { label: 'Date', x: 6.05, y: 0.20, width: 1.48 },
  payee: { label: 'Name / Payee', x: 0.34, y: 1.03, width: 4.95 },
  words: { label: 'Amount in words (English)', x: 0.34, y: 1.57, width: 5.90 },
  amount: { label: 'Amount', x: 6.05, y: 1.03, width: 1.48 },
  memo: { label: 'Memo', x: 0.34, y: 2.12, width: 3.00 },
});

export function defaultCustomCheckPositions() {
  return Object.fromEntries(Object.entries(CUSTOM_CHECK_FIELDS).map(([key, field]) => [
    key, { x: field.x, y: field.y },
  ]));
}

export function updateCustomCheckPosition(positions, fieldKey, axis, value) {
  const spec = CUSTOM_CHECK_FIELDS[fieldKey];
  if (!spec || !['x', 'y'].includes(axis) || value === '' || value === null || value === undefined) return positions;
  const number = Number(value);
  if (!Number.isFinite(number)) return positions;
  // Keep each complete underline inside the check area.
  const maximum = axis === 'x' ? 8.0 - spec.width : 3.25 - 0.38;
  const next = Math.round(Math.max(0, Math.min(maximum, number)) * 100) / 100;
  const existing = positions?.[fieldKey] || { x: spec.x, y: spec.y };
  return { ...positions, [fieldKey]: { ...existing, [axis]: next } };
}

export function normalizeCustomCheckPositions(saved) {
  let positions = defaultCustomCheckPositions();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return positions;
  for (const key of Object.keys(CUSTOM_CHECK_FIELDS)) {
    for (const axis of ['x', 'y']) {
      if (typeof saved[key]?.[axis] === 'number' && Number.isFinite(saved[key][axis])) {
        positions = updateCustomCheckPosition(positions, key, axis, saved[key][axis]);
      }
    }
  }
  return positions;
}

export function formatCustomCheckDate(date) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : String(date || '');
}
