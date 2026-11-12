export function isSupervisor(profile) {
  return profile?.role === 'staff' && profile?.access_level === 'supervisor';
}
export function canUseExecutiveReport(profile) {
  return isSupervisor(profile);
}
export function canUseCfoOverview(profile) {
  return isSupervisor(profile);
}
export function canUseOperationalStaffFeatures(profile) {
  return profile?.role === 'staff' && ['supervisor','admin'].includes(profile?.access_level);
}
