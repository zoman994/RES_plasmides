/**
 * sanger-helpers.test.js — T10 K2 (§5.3, DEC-T10-04/07).
 */
import { describe, it, expect } from 'vitest';
import {
  SANGER_STATUS_CYCLE, cycleSangerStatus, statusColor, statusIcon,
} from '../lib/sanger-helpers';

describe('T10 K2 — sanger-helpers', () => {
  it('cycle order is pending → verified → failed → null → pending', () => {
    expect(SANGER_STATUS_CYCLE).toEqual(['pending', 'verified', 'failed', null]);
    expect(cycleSangerStatus('pending')).toBe('verified');
    expect(cycleSangerStatus('verified')).toBe('failed');
    expect(cycleSangerStatus('failed')).toBeNull();
    expect(cycleSangerStatus(null)).toBe('pending');
  });

  it('cycle from an unknown value restarts at pending', () => {
    expect(cycleSangerStatus('weird')).toBe('pending');
    expect(cycleSangerStatus(undefined)).toBe('pending');
  });

  it('statusColor maps to the --sanger-* tokens', () => {
    expect(statusColor('verified')).toBe('var(--sanger-verified)');
    expect(statusColor('failed')).toBe('var(--sanger-failed)');
    expect(statusColor('pending')).toBe('var(--sanger-pending)');
    expect(statusColor(null)).toBe('transparent');
    expect(statusColor('weird')).toBe('transparent');
  });

  it('statusIcon glyphs', () => {
    expect(statusIcon('verified')).toBe('✓');
    expect(statusIcon('failed')).toBe('✗');
    expect(statusIcon('pending')).toBe('○');
    expect(statusIcon(null)).toBe(' ');
  });
});
