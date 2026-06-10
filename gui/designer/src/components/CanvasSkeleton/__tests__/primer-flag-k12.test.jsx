/**
 * primer-flag-k12.test.jsx — M-CANVAS-WORKFLOW-UX K12 (SPEC §3 шаг 3 +
 * §3.3 «Праймеры панель»). UI for the K1 primer.autoMode field:
 * 🔧 auto / 🔒 manual badge + [🔒] lock + [🔄] reset buttons. Editing
 * the sequence auto-locks (manual override per SPEC).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, fireEvent, within,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import AssemblyPrimersPanel from '../editor/assembly-mode/AssemblyPrimersPanel';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function seedPrimer(zoneId, autoMode) {
  // WRITE_ASSEMBLY_PRIMER needs a draft with at least one segment to
  // compute the assembly sequence. Seed a zone + a sourced segment,
  // then write a primer over the first 20 bp.
  act(() => {
    A.addContainer({
      id: `cZ-${zoneId}`, kind: 'molecule', name: 'pUC',
      sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT', annotations: [],
    });
  });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { id: zoneId, name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  act(() => { A.insertSegment(zoneId, `cZ-${zoneId}`, 0, 32, false); });
  act(() => {
    A.writeAssemblyPrimer({
      draftId: zoneId,
      range: { start: 0, end: 20 },
      direction: 'forward',
      source: { kind: 'segment', segmentId: 'irrelevant' },
      name: 'asm-fwd-1',
      sequence: 'AAAACCCCGGGGTTTTAAAA',
    });
  });
  const id = S.assemblyDraftPrimers[zoneId][0].id;
  if (autoMode != null) {
    act(() => { A.updateAssemblyPrimer(zoneId, id, { autoMode }); });
  }
  return id;
}

function renderPanel(draftId) {
  return render(
    <SkeletonProvider>
      <H />
      <AssemblyPrimersPanel draftId={draftId} />
    </SkeletonProvider>,
  );
}

describe('K12 — autoMode badge', () => {
  it('🔧 черновик badge when autoMode = auto (WT-UX-18 — auto reads as draft)', () => {
    renderPanel('d1');
    const id = seedPrimer('d1', 'auto');
    // WT-UX-18 — auto primers now read as «черновик» (доведите в редакторе),
    // not a neutral 🔧. data-draft + visible text + explicit tooltip.
    const badge = screen.getByTestId(`assembly-primer-automode-${id}`);
    expect(badge.textContent).toMatch(/🔧/);
    expect(badge.textContent).toMatch(/черновик/);
    expect(badge.getAttribute('data-draft')).toBe('true');
  });

  it('🔒 badge when autoMode = manual', () => {
    renderPanel('d2');
    const id = seedPrimer('d2', 'manual');
    expect(screen.getByTestId(`assembly-primer-automode-${id}`).textContent).toBe('🔒');
  });

  it('back-compat: missing autoMode defaults to manual (🔒)', () => {
    renderPanel('d3');
    const id = seedPrimer('d3', null);
    expect(screen.getByTestId(`assembly-primer-automode-${id}`).textContent).toBe('🔒');
  });
});

describe('K12 — lock/reset buttons', () => {
  it('lock button visible only when autoMode = auto', () => {
    renderPanel('d1');
    const id = seedPrimer('d1', 'auto');
    expect(screen.getByTestId(`assembly-primer-lock-${id}`)).toBeTruthy();
    expect(screen.queryByTestId(`assembly-primer-reset-${id}`)).toBeNull();
  });

  it('reset button visible only when autoMode = manual', () => {
    renderPanel('d2');
    const id = seedPrimer('d2', 'manual');
    expect(screen.getByTestId(`assembly-primer-reset-${id}`)).toBeTruthy();
    expect(screen.queryByTestId(`assembly-primer-lock-${id}`)).toBeNull();
  });

  it('click lock → autoMode becomes manual', () => {
    renderPanel('d1');
    const id = seedPrimer('d1', 'auto');
    act(() => { fireEvent.click(screen.getByTestId(`assembly-primer-lock-${id}`)); });
    expect(S.assemblyDraftPrimers.d1.find((p) => p.id === id).autoMode).toBe('manual');
  });

  it('click reset → autoMode becomes auto', () => {
    renderPanel('d2');
    const id = seedPrimer('d2', 'manual');
    act(() => { fireEvent.click(screen.getByTestId(`assembly-primer-reset-${id}`)); });
    expect(S.assemblyDraftPrimers.d2.find((p) => p.id === id).autoMode).toBe('auto');
  });
});

describe('K12 — manual edit auto-locks', () => {
  it('editing the sequence on an auto primer flips autoMode to manual', () => {
    renderPanel('d1');
    const id = seedPrimer('d1', 'auto');
    act(() => { fireEvent.click(screen.getByTestId('assembly-primer-edit')); });
    const m = screen.getByTestId('assembly-primer-edit-modal');
    act(() => {
      fireEvent.change(within(m).getByTestId('assembly-primer-edit-seq'), {
        target: { value: 'AAACCCGGGTTT' },
      });
      fireEvent.click(within(m).getByTestId('assembly-primer-edit-save'));
    });
    const p = S.assemblyDraftPrimers.d1.find((x) => x.id === id);
    expect(p.sequence).toBe('AAACCCGGGTTT');
    expect(p.autoMode).toBe('manual');
  });
});
