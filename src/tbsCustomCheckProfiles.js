import { defaultCustomCheckPositions, normalizeCustomCheckPositions } from './tbsCustomCheckLayout.js';

// Browser-only, per-client named check-stock layouts. Stores no payees, amounts or bank data.
const LEGACY_NAME = 'Previous Custom Calibration';
export const MAX_CUSTOM_CHECK_PROFILES = 40;

function cleanName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
}
function sameName(a, b) {
  return cleanName(a).toLocaleLowerCase() === cleanName(b).toLocaleLowerCase();
}
function safeOffset(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-2, Math.min(2, number)) : 0;
}
function safeScale(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 80 && number <= 120 ? number : 100;
}
export function normalizeCustomCheckSettings(settings) {
  return {
    positions: normalizeCustomCheckPositions(settings?.positions),
    offsetX: safeOffset(settings?.offsetX),
    offsetY: safeOffset(settings?.offsetY),
    scalePct: safeScale(settings?.scalePct),
  };
}
export function emptyCustomCheckSettings() {
  return { positions: defaultCustomCheckPositions(), offsetX: 0, offsetY: 0, scalePct: 100 };
}
export function getNamedCustomCheckProfile(library, name) {
  return library?.presets?.find(p => sameName(p.name, name)) || null;
}
export function normalizeCustomCheckProfileLibrary(saved, legacyPositions = null) {
  const presets = [];
  if (Array.isArray(saved?.presets)) {
    for (const item of saved.presets) {
      const name = cleanName(item?.name);
      if (!name || presets.some(p => sameName(p.name, name)) || presets.length >= MAX_CUSTOM_CHECK_PROFILES) continue;
      presets.push({ name, ...normalizeCustomCheckSettings(item) });
    }
  }
  // The old single-position setting is imported rather than deleted or overwritten.
  if (!Array.isArray(saved?.presets) && !presets.length && legacyPositions && typeof legacyPositions === 'object' && !Array.isArray(legacyPositions)) {
    presets.push({ name: LEGACY_NAME, ...normalizeCustomCheckSettings({ positions: legacyPositions }) });
  }
  const selectedName = saved?.selectedName === '' ? '' : (getNamedCustomCheckProfile({ presets }, saved?.selectedName)?.name || presets[0]?.name || '');
  return { presets, selectedName };
}
export function saveNamedCustomCheckProfile(library, name, settings, overwrite = false) {
  const label = cleanName(name);
  const current = normalizeCustomCheckProfileLibrary(library);
  if (!label) return { library: current, error: 'Enter a name for this check layout.' };
  const index = current.presets.findIndex(p => sameName(p.name, label));
  if (index >= 0 && !overwrite) {
    return { library: current, error: 'This name is already saved. Choose another name or update the selected layout.' };
  }
  if (index < 0 && overwrite) return { library: current, error: 'Select an existing layout to update.' };
  if (index < 0 && current.presets.length >= MAX_CUSTOM_CHECK_PROFILES) {
    return { library: current, error: 'Maximum saved check layouts reached.' };
  }
  const value = { name: index >= 0 ? current.presets[index].name : label, ...normalizeCustomCheckSettings(settings) };
  const presets = current.presets.slice();
  if (index >= 0) presets[index] = value;
  else presets.push(value);
  return { library: { presets, selectedName: value.name }, error: '' };
}
export function selectNamedCustomCheckProfile(library, name) {
  const current = normalizeCustomCheckProfileLibrary(library);
  const item = getNamedCustomCheckProfile(current, name);
  if (!item) return { ...current, selectedName: '' };
  return { ...current, selectedName: item.name };
}
export function deleteNamedCustomCheckProfile(library, name) {
  const current = normalizeCustomCheckProfileLibrary(library);
  return {
    presets: current.presets.filter(p => !sameName(p.name, name)),
    selectedName: '',
  };
}
