/**
 * sanger-helpers — T10 K2 (§5.3, DEC-T10-04/07). Pure status helpers
 * for the Sanger lab notebook: cycle order, colour token, glyph.
 */
export const SANGER_STATUS_CYCLE = ['pending', 'verified', 'failed', null];

export function cycleSangerStatus(current) {
  const idx = SANGER_STATUS_CYCLE.indexOf(current);
  // unknown / undefined → idx -1 → next is index 0 ('pending')
  return SANGER_STATUS_CYCLE[(idx + 1) % SANGER_STATUS_CYCLE.length];
}

export function statusColor(status) {
  switch (status) {
    case 'verified': return 'var(--sanger-verified)';
    case 'failed': return 'var(--sanger-failed)';
    case 'pending': return 'var(--sanger-pending)';
    default: return 'transparent';
  }
}

export function statusIcon(status) {
  switch (status) {
    case 'verified': return '✓';
    case 'failed': return '✗';
    case 'pending': return '○';
    default: return ' ';
  }
}
