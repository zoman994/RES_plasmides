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
import FeatureEditorModal from '../FeatureEditorModal';

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
    // 1-based UI coords (pre-fix Importer convention): start UI = 101.
    expect(screen.getByTestId('feature-editor-start').value).toBe('101');
    expect(screen.getByTestId('feature-editor-end').value).toBe('900');
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
    fireEvent.change(screen.getByTestId('feature-editor-start'), { target: { value: '201' } });
    fireEvent.change(screen.getByTestId('feature-editor-end'),   { target: { value: '800' } });
    fireEvent.click(screen.getByTestId('feature-editor-save'));
    const patch = onSave.mock.calls[0][0].patch;
    expect(patch.start).toBe(200);
    expect(patch.end).toBe(800);
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

  it('Introns section is rendered as a stub on the Subfeatures tab', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('feature-editor-tab-subfeatures'));
    const stub = screen.getByTestId('feature-editor-introns');
    expect(stub).toBeTruthy();
    const btn = stub.querySelector('button');
    if (btn) expect(btn.disabled).toBe(true);
  });
});
