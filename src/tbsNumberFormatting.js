// Presentation-only decimal formatting; financial values are never mutated by these helpers.
const twoDecimalNumberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDecimal(value, empty = '0.00') {
  if (value === '' || value === null || value === undefined) return empty;
  const number = Number(value);
  return Number.isFinite(number) ? twoDecimalNumberFormatter.format(number) : empty;
}

export function formatPercentage(value, empty = '0.00%') {
  return value === '' || value === null || value === undefined
    ? empty
    : `${formatDecimal(value, empty)}%`;
}

export function formatDecimalInput(value) {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value);
}
