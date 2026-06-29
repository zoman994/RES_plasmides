import { describe, it, expect } from 'vitest';
import { STATUS_META, statusMeta, lineageRoleLabel, entryStatus } from '../version-status';

describe('version-status', () => {
  it('exposes RU labels for the three statuses', () => {
    expect(STATUS_META.release.label).toBe('релиз');
    expect(STATUS_META.wip.label).toBe('рабочая');
    expect(STATUS_META.deprecated.label).toBe('устар.');
    // every status carries a color + bg token for the chip
    for (const k of Object.keys(STATUS_META)) {
      expect(typeof STATUS_META[k].color).toBe('string');
      expect(typeof STATUS_META[k].bg).toBe('string');
    }
  });

  it('statusMeta returns null for missing / unknown status', () => {
    expect(statusMeta(null)).toBeNull();
    expect(statusMeta('bogus')).toBeNull();
    expect(statusMeta('release')).toBe(STATUS_META.release);
  });

  it('lineageRoleLabel maps role → RU word (default = версия)', () => {
    expect(lineageRoleLabel('branch')).toBe('ветка');
    expect(lineageRoleLabel('version')).toBe('версия');
    expect(lineageRoleLabel(undefined)).toBe('версия');
  });

  it('entryStatus reads origin.status, null when absent', () => {
    expect(entryStatus({ origin: { status: 'release' } })).toBe('release');
    expect(entryStatus({ origin: {} })).toBeNull();
    expect(entryStatus(null)).toBeNull();
  });
});
