/**
 * PC-K9 — Restriction toggle relocated to SkeletonHeader (was inside
 * the retired library footer).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import CanvasSkeleton from '../index';
import { useStore, bootstrapStore } from '../../../store';

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });
afterEach(cleanup);

describe('PC-K9 — restriction toggle in SkeletonHeader', () => {
  it('header toggle button visible', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-restriction-header-toggle')).toBeTruthy();
  });

  it('clicking toggle opens popover with RestrictionPanel content', () => {
    render(<CanvasSkeleton />);
    expect(screen.queryByTestId('skeleton-restriction-header-popover')).toBeNull();
    fireEvent.click(screen.getByTestId('skeleton-restriction-header-toggle'));
    expect(screen.getByTestId('skeleton-restriction-header-popover')).toBeTruthy();
    expect(screen.getByTestId('skeleton-restriction-panel')).toBeTruthy();
  });

  it('header pill reflects showReSites store state', () => {
    render(<CanvasSkeleton />);
    const pill = screen.getByTestId('skeleton-restriction-header-toggle');
    // Default state — assume showReSites=false (no global setup).
    expect(pill.textContent).toMatch(/Скрыты/);
    act(() => { useStore.setState({ showReSites: true }); });
    expect(pill.textContent).toMatch(/Видны/);
  });
});
