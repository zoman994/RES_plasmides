/**
 * snippet-entry-point.test.jsx — M-CANVAS-WORKFLOW-UX K3.
 *
 * Entry-point «+ Обвес»: SnippetCatalogModal (categories / search /
 * preview / custom) + INSERT_SNIPPET → a kind='snippet' piece in the
 * zone (embedsInPrimer:true, SPEC §3.1.B). Mirrors the K2
 * zone-assembly-toolbar harness for the integration leg.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, within, fireEvent,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import SnippetCatalogModal from '../editor/assembly-mode/SnippetCatalogModal';
import { bootstrapStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';

afterEach(cleanup);
beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  resetDBForTests('bodgegene-db-snip-ep');
});

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function openEmptyZone() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'ZT', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  return zid;
}
const zonePieces = (zid) => S.pieces.filter((p) => p.zoneId === zid);

describe('K3 — INSERT_SNIPPET reducer/adapter', () => {
  it('INSERT_SNIPPET on a zone → kind=snippet piece, embedsInPrimer:true, in zone', () => {
    const zid = openEmptyZone();
    act(() => {
      A.insertSnippet(zid, { sequence: 'CATCATCATCATCATCAT', snippetType: '6xHis', name: '6xHis' });
    });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('snippet');
    expect(ps[0].sequence).toBe('CATCATCATCATCATCAT');
    expect(ps[0].snippetType).toBe('6xHis');
    expect(ps[0].embedsInPrimer).toBe(true);
  });
});

describe('K3 — SnippetCatalogModal', () => {
  it('renders the 4 category filters + built-in snippets; search narrows', () => {
    render(<SnippetCatalogModal onPick={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('snippet-catalog-modal')).toBeTruthy();
    expect(screen.getByTestId('snippet-cat-tag')).toBeTruthy();
    expect(screen.getByTestId('snippet-cat-restriction')).toBeTruthy();
    expect(screen.getByTestId('snippet-item-snip-tag-6xHis')).toBeTruthy();
    act(() => {
      fireEvent.change(screen.getByTestId('snippet-search'), { target: { value: 'FLAG' } });
    });
    expect(screen.getByTestId('snippet-item-snip-tag-FLAG')).toBeTruthy();
    expect(screen.queryByTestId('snippet-item-snip-tag-6xHis')).toBeNull();
  });

  it('select → preview → Добавить fires onPick with sequence/snippetType/name', () => {
    let picked = null;
    render(<SnippetCatalogModal onPick={(s) => { picked = s; }} onCancel={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('snippet-item-snip-tag-6xHis')); });
    expect(screen.getByTestId('snippet-preview').textContent).toMatch(/CATCATCAT/);
    act(() => { fireEvent.click(screen.getByTestId('snippet-add')); });
    expect(picked).toMatchObject({
      sequence: 'CATCATCATCATCATCAT', snippetType: '6xHis', name: '6xHis',
    });
  });

  it('custom: invalid sequence blocked, valid one saved + selectable', async () => {
    render(<SnippetCatalogModal onPick={() => {}} onCancel={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('snippet-custom-toggle')); });
    act(() => {
      fireEvent.change(screen.getByTestId('snippet-custom-name'), { target: { value: 'pelB' } });
      fireEvent.change(screen.getByTestId('snippet-custom-seq'), { target: { value: 'ACGTX' } });
    });
    expect(screen.getByTestId('snippet-custom-save').disabled).toBe(true);
    act(() => {
      fireEvent.change(screen.getByTestId('snippet-custom-seq'), { target: { value: 'ATGAAATAC' } });
    });
    expect(screen.getByTestId('snippet-custom-save').disabled).toBe(false);
    fireEvent.click(screen.getByTestId('snippet-custom-save'));
    // Dexie put → list → setState is multi-tick; findBy polls.
    expect(await screen.findByText('pelB')).toBeTruthy();
  });

  it('Esc → onCancel', () => {
    let cancelled = false;
    render(<SnippetCatalogModal onPick={() => {}} onCancel={() => { cancelled = true; }} />);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(cancelled).toBe(true);
  });
});

describe('K3 — «+ Обвес» toolbar integration', () => {
  it('«+ Обвес» opens modal; pick a built-in → snippet piece in the zone', () => {
    const zid = openEmptyZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-snippet')); });
    const modal = screen.getByTestId('snippet-catalog-modal');
    act(() => { fireEvent.click(within(modal).getByTestId('snippet-item-snip-tag-FLAG')); });
    act(() => { fireEvent.click(within(modal).getByTestId('snippet-add')); });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('snippet');
    expect(ps[0].sequence).toBe('GATTACAAGGATGACGATGACAAG');
  });
});
