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

describe('FeatureEditorModal — Split / Merge / Delete / Introns', () => {
  it('Split into 2 calls onSplit(2) and closes the modal via onClose', () => {
    const onSplit = vi.fn();
    const onClose = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={onClose} onSplit={onSplit} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('feature-editor-split-2'));
    expect(onSplit).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('Split into 4 fires onSplit(4)', () => {
    const onSplit = vi.fn();
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onSplit={onSplit} onMerge={() => {}} onDelete={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('feature-editor-split-4'));
    expect(onSplit).toHaveBeenCalledWith(4);
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

  it('Introns section is rendered as a stub (button disabled with hint text)', () => {
    render(
      <FeatureEditorModal
        feature={FEATURE} seqLength={5000} neighbours={[]}
        onSave={() => {}} onClose={() => {}} onSplit={() => {}} onMerge={() => {}} onDelete={() => {}}
      />
    );
    const stub = screen.getByTestId('feature-editor-introns');
    expect(stub).toBeTruthy();
    // Stub button should be disabled (or carry the «coming soon» note).
    const btn = stub.querySelector('button');
    if (btn) expect(btn.disabled).toBe(true);
  });
});
