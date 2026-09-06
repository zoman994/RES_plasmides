/**
 * feature-editor-modal.test.jsx — Sprint M-X.3 follow-up.
 *
 * Biolog: «двойной клик на фичу не должен кидать в аннотатор. Он
 * должен кидать в отдельную модалку, которая
 *   1) даёт возможность разбить фичу на N кусков (split) и слить с
 *      соседними (merge),
 *   2) выбрать тип фичи,
 *   3) переименование, разметка интронов (заглушка), изменение
 *      координат каждого куска».
 *
 * The modal owns FORM state and emits one of:
 *   - onSave({ patch })            — name / type / coords / strand
 *   - onSplit(N)                   — equal-length split into N
 *   - onMerge(neighbourId)         — merge with the chosen neighbour
 *   - onClose()                    — Cancel / Esc / backdrop click
 *
 * Wiring (annotation list → store) lives in the parent — this test
 * file pins the modal's public surface.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import FeatureEditorModal from '../FeatureEditorModal';
import useTabHotkey from '../../../CanvasSkeleton/editor/useTabHotkey';
import useUndoHotkey from '../../../CanvasSkeleton/editor/useUndoHotkey';

afterEach(cleanup);

const FEATURE = {
  id: 'f1',
  name: 'lacZα',
  type: 'CDS',
  start: 100,
  end: 900,
  strand: 1,
  level: 'region',
};

const NEIGHBOURS = [
  { id: 'p',  name: 'Pleft',   type: 'promoter',   start: 0,    end: 100,  strand: 1, level: 'region' }, // touches start (left)
  { id: 'n',  name: 'Tright',  type: 'terminator', start: 900,  end: 1100, strand: 1, level: 'region' }, // touches end (right)
  { id: 'far', name: 'Far',    type: 'CDS',        start: 2000, end: 3000, strand: 1, level: 'region' }, // not adjacent
];

describe('FeatureEditorModal — open / close', () => {
  it('renders nothing when feature is null', () => {
    const { container } = render(
      <FeatureEditorModal
        feature={null} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders with feature data pre-filled', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={NEIGHBOURS}
        onSave={() => {}} onClose={() => {}} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.getByTestId('feature-editor-modal')).toBeTruthy();
    expect(screen.getByTestId('feature-editor-name').value).toBe('lacZα');
    // 1-based inclusive segment row (single-segment feature → exactly one row).
    expect(screen.getByTestId('feature-location-start-0').value).toBe('101');
    expect(screen.getByTestId('feature-location-end-0').value).toBe('900');
  });

  it('Cancel button calls onClose', () => {
    const onClose = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={onClose} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('feature-editor-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={onClose} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape stops propagation so App\'s global hotkey resolver doesn\'t fire popFullscreen', () => {
    // Biolog «из модалки этих фичес на эскейп выбрасывает из
    // библиотеки совсем. На стартовый. А должно обратно на вивер.
    // Бесит». Without capture-phase listening + stopPropagation, the
    // App-level Escape hotkey (`navStack.length > 1 → popFullscreen`)
    // would fire alongside the modal's onClose and dump the user out
    // of the Importer back to Start. The fix: modal listener runs in
    // CAPTURE phase, calls preventDefault + stopPropagation, so any
    // global resolver checking `event.defaultPrevented` bails out.
    const onClose = vi.fn();
    const bubblePhaseListener = vi.fn();
    window.addEventListener('keydown', bubblePhaseListener);
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={onClose} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(onClose).toHaveBeenCalledTimes(1);
    // App's bubble-phase listener is shielded by stopPropagation.
    expect(bubblePhaseListener).not.toHaveBeenCalled();
    // Belt + suspenders — `defaultPrevented` is also set so any
    // resolver that checks it bails out anyway.
    expect(evt.defaultPrevented).toBe(true);
    window.removeEventListener('keydown', bubblePhaseListener);
  });
});

describe('FeatureEditorModal — Save with edits', () => {
  it('Save with renamed feature emits patch.name', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={onSave} onClose={() => {}} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId('feature-editor-name'), { target: { value: 'lacZ-alpha' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ patch: expect.objectContaining({ name: 'lacZ-alpha' }) });
  });

  it('Save with new type emits patch.type', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={onSave} onClose={() => {}} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId('feature-editor-type'), { target: { value: 'promoter' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    expect(onSave.mock.calls[0][0].patch).toMatchObject({ type: 'promoter' });
  });

  it('Save with edited coords converts UI 1-based start back to 0-based store start', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={onSave} onClose={() => {}} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    // User types start=201 (1-based) → store should see 200 (0-based).
    fireEvent.change(screen.getByTestId('feature-location-start-0'), { target: { value: '201' } });
    fireEvent.change(screen.getByTestId('feature-location-end-0'),   { target: { value: '800' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    const patch = onSave.mock.calls[0][0].patch;
    // Save emits the canonical 0-based half-open location, never scalar start/end.
    expect(patch.location).toEqual({ kind: 'single', segments: [{ start: 200, end: 800 }] });
    expect(patch.start).toBeUndefined();
    expect(patch.end).toBeUndefined();
  });

  it('Save with strand toggle to reverse emits patch.strand=-1', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={onSave} onClose={() => {}} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('feature-editor-strand-rev'));
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    expect(onSave.mock.calls[0][0].patch).toMatchObject({ strand: -1 });
  });
});

describe('FeatureEditorModal — Split sub-features / Merge / Delete', () => {
  // Sprint M-X.3 follow-up — modal got two tabs: Feature (name /
  // type / coords / strand / merge / delete) and Subfeatures
  // (split + child list). Tests in this block switch to the
  // Subfeatures tab before exercising the split UI.
  function switchToSubfeaturesTab() {
    const tab = screen.queryByTestId('feature-editor-tab-subfeatures');
    if (tab) fireEvent.click(tab);
  }

  it('«+ intron» adds an intron sub-feature emitted on save (→ AA track splices)', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={NEIGHBOURS}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    fireEvent.click(screen.getByTestId('feature-editor-add-intron'));
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    const intron = (onSave.mock.calls[0][0].subFeatures || []).find((x) => x.type === 'intron');
    expect(intron).toBeTruthy();
    // seeded inside the parent feature [100,900); biolog adjusts in the row
    expect(intron.start).toBeGreaterThanOrEqual(100);
    expect(intron.end).toBeGreaterThan(intron.start);
    expect(intron.end).toBeLessThanOrEqual(900);
  });

  it('Split button creates two sub-feature rows (parent halves)', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    // Initially no sub-feature rows.
    expect(screen.queryAllByTestId('feature-editor-subfeature-row').length).toBe(0);
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    const rows = screen.getAllByTestId('feature-editor-subfeature-row');
    expect(rows).toHaveLength(2);
  });

  it('Each sub-feature row exposes name / type / start / end inputs', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    const rows = screen.getAllByTestId('feature-editor-subfeature-row');
    expect(rows[0].querySelector('[data-testid="subfeature-name"]')).toBeTruthy();
    expect(rows[0].querySelector('[data-testid="subfeature-type"]')).toBeTruthy();
    expect(rows[0].querySelector('[data-testid="subfeature-start"]')).toBeTruthy();
    expect(rows[0].querySelector('[data-testid="subfeature-end"]')).toBeTruthy();
  });

  it('split children inherit parent name + sequential indices (lacZα-1, lacZα-2)', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    const subs = onSave.mock.calls[0][0].subFeatures;
    expect(subs.map((s) => s.name).sort()).toEqual([`${FEATURE.name}-1`, `${FEATURE.name}-2`]);
  });

  it('split children carry colour shaded from parent (related but distinct)', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    const subs = onSave.mock.calls[0][0].subFeatures;
    // Each child has a `color` field set (inherited shade from parent).
    expect(subs[0].color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(subs[1].color).toMatch(/^#[0-9a-f]{6}$/i);
    // Shades differ — siblings don't collide on the same colour.
    expect(subs[0].color).not.toBe(subs[1].color);
  });

  it('Save with split sub-features emits subFeatures array in meta', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const meta = onSave.mock.calls[0][0];
    expect(Array.isArray(meta.subFeatures)).toBe(true);
    expect(meta.subFeatures).toHaveLength(2);
    expect(meta.subFeatures[0]).toMatchObject({ name: expect.any(String), start: expect.any(Number), end: expect.any(Number) });
    // Together they cover the full parent range.
    const sortedByStart = [...meta.subFeatures].sort((a, b) => a.start - b.start);
    expect(sortedByStart[0].start).toBe(FEATURE.start);
    expect(sortedByStart[sortedByStart.length - 1].end).toBe(FEATURE.end);
  });

  it('Editing a sub-feature name flows through to onSave meta', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    const rows = screen.getAllByTestId('feature-editor-subfeature-row');
    const nameInput = rows[0].querySelector('[data-testid="subfeature-name"]');
    fireEvent.change(nameInput, { target: { value: 'signal-peptide' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    const subs = onSave.mock.calls[0][0].subFeatures;
    expect(subs.some((s) => s.name === 'signal-peptide')).toBe(true);
  });

  it('Editing sub-feature coords (1-based UI ↔ 0-based store) flows through', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    const rows = screen.getAllByTestId('feature-editor-subfeature-row');
    // Edit second row's start to 501 (1-based) — store should see 500.
    const startInput = rows[1].querySelector('[data-testid="subfeature-start"]');
    fireEvent.change(startInput, { target: { value: '501' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    const subs = onSave.mock.calls[0][0].subFeatures;
    expect(subs.some((s) => s.start === 500)).toBe(true);
  });

  it('Clicking Split again adds a third sub-feature by halving the last one', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    expect(screen.getAllByTestId('feature-editor-subfeature-row')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    expect(screen.getAllByTestId('feature-editor-subfeature-row')).toHaveLength(3);
  });

  it('Delete sub-feature button removes that row from the list', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    switchToSubfeaturesTab();
    fireEvent.click(screen.getByTestId('feature-editor-split'));
    const rows = screen.getAllByTestId('feature-editor-subfeature-row');
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[0].querySelector('[data-testid="subfeature-delete"]'));
    expect(screen.getAllByTestId('feature-editor-subfeature-row')).toHaveLength(1);
  });

  // Biolog: «ребёнка поделить нельзя же больше? Если можно — то
  // надо чтобы нельзя». Sub-feature-level annotations don't get the
  // Split / sub-features section in the modal — that path is reserved
  // for top-level (region) features only.
  it('opening the modal on a sub-feature (level: detail) hides the Split section', () => {
    const subFeature = {
      id: 'sub-1', name: 'sig-peptide', type: 'signal_peptide',
      start: 100, end: 250, strand: 1,
      level: 'detail', regionId: 'parent-1',
    };
    render(
      <FeatureEditorModal
        feature={subFeature} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.queryByTestId('feature-editor-split')).toBeNull();
    expect(screen.queryAllByTestId('feature-editor-subfeature-row').length).toBe(0);
  });

  it('opening the modal on a region keeps the Subfeatures tab', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.getByTestId('feature-editor-tab-subfeatures')).toBeTruthy();
    fireEvent.click(screen.getByTestId('feature-editor-tab-subfeatures'));
    expect(screen.getByTestId('feature-editor-split')).toBeTruthy();
  });

  it('Sub-feature modal has NO Subfeatures tab (no nesting)', () => {
    const subFeature = {
      id: 'sub-1', name: 'sig', type: 'signal_peptide',
      start: 100, end: 250, strand: 1, level: 'detail', regionId: 'parent-1',
    };
    render(
      <FeatureEditorModal
        feature={subFeature} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.queryByTestId('feature-editor-tab-subfeatures')).toBeNull();
  });

  it('header shows a level badge: Sub-feature for detail', () => {
    const subFeature = {
      id: 'sub-1', name: 'sig', type: 'signal_peptide',
      start: 100, end: 250, strand: 1,
      level: 'detail', regionId: 'parent-1',
    };
    render(
      <FeatureEditorModal
        feature={subFeature} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    const badge = screen.getByTestId('feature-editor-level-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent.toLowerCase()).toMatch(/sub|detail/);
  });

  it('header level badge says Feature for level: region', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    const badge = screen.getByTestId('feature-editor-level-badge');
    expect(badge.textContent.toLowerCase()).toMatch(/feature/);
    expect(badge.textContent.toLowerCase()).not.toMatch(/sub/);
  });

  it('Pre-existing detail-level annotations under the parent show up as sub-feature rows on open', () => {
    const existingDetails = [
      { id: 'd1', regionId: FEATURE.id, level: 'detail', name: 'sig-peptide', type: 'signal_peptide', start: 100, end: 200, strand: 1 },
      { id: 'd2', regionId: FEATURE.id, level: 'detail', name: 'mature',     type: 'misc_feature',    start: 200, end: 900, strand: 1 },
      // Detail of a DIFFERENT region — must not show up.
      { id: 'd3', regionId: 'other',  level: 'detail', name: 'x',           type: 'misc_feature',    start: 0,   end: 50,  strand: 1 },
    ];
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={existingDetails}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('feature-editor-tab-subfeatures'));
    const rows = screen.getAllByTestId('feature-editor-subfeature-row');
    expect(rows).toHaveLength(2);
    const namesInDom = rows.map((r) => r.querySelector('[data-testid="subfeature-name"]').value);
    expect(namesInDom).toContain('sig-peptide');
    expect(namesInDom).toContain('mature');
    expect(namesInDom).not.toContain('x');
  });

  it('Merge picker shows only adjacent neighbours (touching start or end)', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={NEIGHBOURS}
        onSave={() => {}} onClose={() => {}} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    // Pleft + Tright are adjacent; Far is not.
    expect(screen.queryByTestId('feature-editor-merge-p')).toBeTruthy();
    expect(screen.queryByTestId('feature-editor-merge-n')).toBeTruthy();
    expect(screen.queryByTestId('feature-editor-merge-far')).toBeNull();
  });

  it('Apply merge with chosen neighbour calls onMerge(neighbourId)', () => {
    const onMerge = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={NEIGHBOURS}
        onSave={() => {}} onClose={() => {}} onSplit={() => {}} onMerge={onMerge} onDelete={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('feature-editor-merge-p'));
    fireEvent.click(screen.getByTestId('feature-editor-merge-apply'));
    expect(onMerge).toHaveBeenCalledWith('p');
  });

  it('No adjacent neighbours → merge picker shows the empty state', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[NEIGHBOURS[2]]}
        onSave={() => {}} onClose={() => {}} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.getByTestId('feature-editor-merge-empty')).toBeTruthy();
  });

  it('Delete button calls onDelete and closes', () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={onClose} onSplit={() => {}} onMerge={() => {}} onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByTestId('feature-editor-delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('Introns section offers an enabled «+ intron» on the Subfeatures tab', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('feature-editor-tab-subfeatures'));
    expect(screen.getByTestId('feature-editor-introns')).toBeTruthy();
    expect(screen.getByTestId('feature-editor-add-intron').disabled).toBe(false);
  });
});

// ── B1-ui — canonical compound / origin-crossing location editor ──────────────
// The location UI shows ordered 1-based inclusive segment rows and Save emits a
// canonical 0-based half-open `location {kind, segments}` in traversal order. A
// metadata-only save emits NO scalar coordinate patch. Origin crossing is valid
// only on a circular currentDocument; the same ordering on a linear document
// shows an inline error and never calls onSave.
describe('FeatureEditorModal — canonical location editor', () => {
  const JOIN_FEATURE = {
    id: 'j1', name: 'splitgene', type: 'CDS', strand: 1, level: 'region',
    location: { kind: 'join', segments: [{ start: 0, end: 100 }, { start: 200, end: 300 }] },
    start: 0, end: 300,
  };
  // Origin-crossing compound feature: segment 2 wraps back to the 5′ end.
  const WRAP_FEATURE = {
    id: 'w1', name: 'oriT', type: 'misc_feature', strand: 1, level: 'region',
    location: { kind: 'join', segments: [{ start: 900, end: 1000 }, { start: 0, end: 50 }] },
    start: 900, end: 50,
  };

  it('opens a JOIN feature as ordered 1-based inclusive rows', () => {
    render(
      <FeatureEditorModal
        feature={JOIN_FEATURE} seqLength={1000} topology="linear" neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    const rows = screen.getAllByTestId('feature-location-row');
    expect(rows).toHaveLength(2);
    // 1-based inclusive: [0,100) → 1..100 ; [200,300) → 201..300.
    expect(screen.getByTestId('feature-location-start-0').value).toBe('1');
    expect(screen.getByTestId('feature-location-end-0').value).toBe('100');
    expect(screen.getByTestId('feature-location-start-1').value).toBe('201');
    expect(screen.getByTestId('feature-location-end-1').value).toBe('300');
  });

  it('editing one JOIN row emits patch.location with kind + traversal order, no scalar flattening', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={JOIN_FEATURE} seqLength={1000} topology="linear" neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    // Shrink segment 2 end 300 → 280.
    fireEvent.change(screen.getByTestId('feature-location-end-1'), { target: { value: '280' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0].patch;
    expect(patch.location).toEqual({
      kind: 'join',
      segments: [{ start: 0, end: 100 }, { start: 200, end: 280 }],
    });
    // No scalar flattening — the compound feature keeps every segment.
    expect(patch.start).toBeUndefined();
    expect(patch.end).toBeUndefined();
  });

  it('a metadata-only save (rename) emits NO location and NO scalar coordinate patch', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={JOIN_FEATURE} seqLength={1000} topology="linear" neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId('feature-editor-name'), { target: { value: 'renamed-join' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    const patch = onSave.mock.calls[0][0].patch;
    expect(patch.name).toBe('renamed-join');
    expect(patch.location).toBeUndefined();
    expect(patch.start).toBeUndefined();
    expect(patch.end).toBeUndefined();
  });

  it('circular currentDocument accepts an origin-crossing save (patch.location wraps)', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={WRAP_FEATURE} seqLength={1000} topology="circular" neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    // Grow the wrap tail 50 → 60 (UI end for [0,60) is 60).
    fireEvent.change(screen.getByTestId('feature-location-end-1'), { target: { value: '60' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0].patch;
    expect(patch.location).toEqual({
      kind: 'join',
      segments: [{ start: 900, end: 1000 }, { start: 0, end: 60 }],
    });
    expect(screen.queryByTestId('feature-location-error')).toBeNull();
  });

  it('linear currentDocument rejects the same origin-crossing ordering inline and never calls onSave', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={WRAP_FEATURE} seqLength={1000} topology="linear" neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId('feature-location-end-1'), { target: { value: '60' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    // Inline error visible, modal stays open, save suppressed.
    expect(screen.getByTestId('feature-location-error')).toBeTruthy();
    expect(screen.getByTestId('feature-editor-modal')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('metadata-only rename still rejects an unchanged wrap on a linear document', () => {
    const onSave = vi.fn();
    render(
      <FeatureEditorModal
        feature={WRAP_FEATURE} seqLength={1000} topology="linear" neighbours={[]}
        onSave={onSave} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId('feature-editor-name'), {
      target: { value: 'renamed-but-still-invalid' },
    });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    expect(screen.getByTestId('feature-location-error')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('compound parent disables scalar merge, split and intron authoring', () => {
    render(
      <FeatureEditorModal
        feature={JOIN_FEATURE} seqLength={1000} topology="linear"
        neighbours={[{
          id: 'right', name: 'right', type: 'CDS', level: 'region',
          start: 300, end: 400, strand: 1,
        }]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />,
    );
    expect(screen.queryByTestId('feature-editor-merge-right')).toBeNull();
    fireEvent.click(screen.getByTestId('feature-editor-tab-subfeatures'));
    expect(screen.getByTestId('feature-editor-split').disabled).toBe(true);
    expect(screen.getByTestId('feature-editor-add-intron').disabled).toBe(true);
    expect(screen.getByTestId('feature-editor-compound-ops-note')).toBeTruthy();
  });

  it('compound child coordinates in a parent roster are read-only, not a fake scalar edit', () => {
    const compoundChild = {
      id: 'child-join', regionId: JOIN_FEATURE.id, level: 'detail',
      name: 'joined-domain', type: 'domain', strand: 1, start: 10, end: 250,
      location: { kind: 'join', segments: [{ start: 10, end: 30 }, { start: 220, end: 250 }] },
    };
    render(
      <FeatureEditorModal
        feature={JOIN_FEATURE} seqLength={1000} topology="linear"
        neighbours={[compoundChild]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('feature-editor-tab-subfeatures'));
    const row = screen.getByTestId('feature-editor-subfeature-row');
    expect(row.querySelector('[data-testid="subfeature-start"]').disabled).toBe(true);
    expect(row.querySelector('[data-testid="subfeature-end"]').disabled).toBe(true);
    expect(row.querySelector('[data-testid="subfeature-compound-note"]')).toBeTruthy();
  });

  it('location inputs keep the global focus ring, mono font, labels and central remove icon', () => {
    render(
      <FeatureEditorModal
        feature={JOIN_FEATURE} seqLength={1000} topology="linear" neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />,
    );
    const startInput = screen.getByTestId('feature-location-start-0');
    expect(startInput.style.outline).not.toBe('none');
    expect(startInput.style.fontFamily).toContain('var(--font-mono)');
    expect(startInput.getAttribute('aria-label')).toBeTruthy();
    expect(screen.getByTestId('feature-location-remove-0').querySelector('svg')).toBeTruthy();
  });

  it('a scalar feature never offers a compound adjacent neighbour for Merge', () => {
    const compoundNeighbour = {
      id: 'compound-right', name: 'joined-right', type: 'CDS', level: 'region',
      start: 900, end: 1200, strand: 1,
      location: {
        kind: 'join',
        segments: [{ start: 900, end: 1000 }, { start: 1100, end: 1200 }],
      },
    };
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} topology="linear"
        neighbours={[compoundNeighbour]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />,
    );
    expect(screen.queryByTestId('feature-editor-merge-compound-right')).toBeNull();
  });

  it('adding a second draft segment immediately disables every scalar shortcut', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} topology="linear" neighbours={NEIGHBOURS}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />,
    );
    expect(screen.getByTestId('feature-editor-merge-n')).toBeTruthy();
    fireEvent.click(screen.getByTestId('feature-location-add'));
    expect(screen.queryByTestId('feature-editor-merge-n')).toBeNull();
    fireEvent.click(screen.getByTestId('feature-editor-tab-subfeatures'));
    expect(screen.getByTestId('feature-editor-split').disabled).toBe(true);
    expect(screen.getByTestId('feature-editor-add-intron').disabled).toBe(true);
    expect(screen.getByTestId('feature-editor-compound-ops-note')).toBeTruthy();
  });
});

function ModalHotkeyHarness({ onTab, onUndo }) {
  const [open, setOpen] = useState(false);
  useTabHotkey({ onNext: onTab, onPrev: onTab });
  useUndoHotkey({ onUndo, onRedo: () => {}, canUndo: true, canRedo: false });
  return (
    <>
      <button type="button" data-testid="feature-editor-opener" onClick={() => setOpen(true)}>
        open
      </button>
      {open && (
        <FeatureEditorModal
          feature={FEATURE} seqLength={5000} topology="linear" neighbours={[]}
          onSave={() => {}} onClose={() => setOpen(false)}
          onMerge={() => {}} onDelete={() => {}}
        />
      )}
    </>
  );
}

describe('FeatureEditorModal — modal boundary', () => {
  it('shields underlying Tab/Ctrl+Z hotkeys and restores opener focus', () => {
    const onTab = vi.fn();
    const onUndo = vi.fn();
    render(<ModalHotkeyHarness onTab={onTab} onUndo={onUndo} />);
    const opener = screen.getByTestId('feature-editor-opener');
    opener.focus();
    fireEvent.click(opener);

    const backdrop = screen.getByTestId('feature-editor-backdrop');
    expect(backdrop.hasAttribute('data-modal-open')).toBe(true);
    expect(backdrop.getAttribute('data-block-global-hotkeys')).toBe('true');
    expect(backdrop.getAttribute('role')).toBe('dialog');
    expect(backdrop.getAttribute('aria-modal')).toBe('true');

    const save = screen.getByTestId('feature-editor-save');
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab', code: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('feature-editor-close'));
    fireEvent.keyDown(save, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(onTab).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('feature-editor-cancel'));
    expect(document.activeElement).toBe(opener);
  });
});
