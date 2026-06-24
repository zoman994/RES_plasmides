/**
 * LibraryActionRow + read-only banner — Sprint M-X.7a v2 K3.
 *
 * Component-level tests covering:
 *   • action-row variants per zone (loose/active/readonly/lab × kind)
 *   • disabled state surfaces correct title (tooltip)
 *   • handler dispatch on click
 *   • read-only banner conditional in SequenceTab + AnnotationsTab
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import LibraryActionRow from '../LibraryActionRow';
import SequenceTab from '../tabs/SequenceTab';
import AnnotationsTab from '../tabs/AnnotationsTab';

// AnnotationsTab mounts the heavy <Annotator embedded>; stub it so
// the banner test doesn't need the annotator pipeline running.
vi.mock('../../../Annotator', () => ({
  default: () => <div data-testid="annotator-stub">annotator</div>,
}));
// SequenceView is heavy too — stub keeps the readOnly+banner test
// focused on the wrapper layer.
vi.mock('../../../SequenceView', () => ({
  default: React.forwardRef(() => <div data-testid="seq-view-stub">seqview</div>),
}));

afterEach(cleanup);

describe('M-X.7a v2 K3 — LibraryActionRow', () => {
  const container = { id: 'c1', kind: 'container', name: 'pUC19' };
  const primer = { id: 'p1', kind: 'primer', name: 'M13F' };

  it('renders nothing when entry or zone is missing', () => {
    const { container: c1 } = render(<LibraryActionRow entry={null} zone="loose" />);
    expect(c1.firstChild).toBeNull();
    cleanup();
    const { container: c2 } = render(<LibraryActionRow entry={container} />);
    expect(c2.firstChild).toBeNull();
  });

  it('loose × container row exposes data-zone + data-kind', () => {
    render(<LibraryActionRow entry={container} zone="loose" ctx={{ hasActiveProject: true }} />);
    const row = screen.getByTestId('library-action-row');
    expect(row.getAttribute('data-zone')).toBe('loose');
    expect(row.getAttribute('data-kind')).toBe('container');
    expect(screen.getByTestId('library-action-addToActiveProject')).toBeTruthy();
    expect(screen.getByTestId('library-action-delete')).toBeTruthy();
  });

  it('active_bodge × container shows only WORKING actions (no DAG / saveAsVersion stubs)', () => {
    render(<LibraryActionRow entry={container} zone="active_bodge" ctx={{}} />);
    // The dead/disabled rows were removed in the 17.06.2026 cleanup.
    expect(screen.queryByTestId('library-action-saveAsVersion')).toBeNull();
    expect(screen.queryByTestId('library-action-showInDag')).toBeNull();
    expect(screen.queryByTestId('library-action-containerWindow')).toBeNull();
    // What remains is enabled.
    expect(screen.getByTestId('library-action-extractToLoose')).toBeTruthy();
    expect(screen.getByTestId('library-action-delete')).toBeTruthy();
  });

  it('readonly_bodge × container shows only copy + align (no openAsActive/view stubs)', () => {
    render(<LibraryActionRow entry={container} zone="readonly_bodge" ctx={{ hasActiveProject: true }} />);
    expect(screen.queryByTestId('library-action-openAsActive')).toBeNull();
    expect(screen.queryByTestId('library-action-view')).toBeNull();
    expect(screen.getByTestId('library-action-copyToActive')).toBeTruthy();
    expect(screen.getByTestId('library-action-align')).toBeTruthy();
  });

  it('lab_pool × primer shows toggleLabStock with «Снять метку» when inLabStock=true', () => {
    const e = { ...primer, inLabStock: true };
    render(<LibraryActionRow entry={e} zone="lab_pool" ctx={{}} />);
    expect(screen.getByTestId('library-action-toggleLabStock').textContent).toMatch(/Снять метку/);
  });

  it('handler dispatch — primary click invokes ctx callback with entry id', () => {
    const onClone = vi.fn();
    render(
      <LibraryActionRow
        entry={container}
        zone="loose"
        ctx={{ hasActiveProject: true, cloneEntryToActiveProject: onClone }}
      />,
    );
    fireEvent.click(screen.getByTestId('library-action-addToActiveProject'));
    expect(onClone).toHaveBeenCalledWith('c1');
  });

  it('disabled action click does NOT invoke handler (addToActiveProject w/o active project)', () => {
    const onClone = vi.fn();
    render(
      <LibraryActionRow
        entry={container}
        zone="loose"
        ctx={{ hasActiveProject: false, cloneEntryToActiveProject: onClone }}
      />,
    );
    const btn = screen.getByTestId('library-action-addToActiveProject');
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClone).not.toHaveBeenCalled();
  });
});

describe('read-only banner conditional', () => {
  // 17.06.2026 — the Sequence tab is editable by default; its read-only
  // banner was removed (Игорь). It NEVER renders now, regardless of props.
  it('SequenceTab renders NO read-only banner (editable by default)', () => {
    render(
      <SequenceTab sequence="ATGC" annotations={[]} topology="circular" name="X" editable />,
    );
    expect(screen.queryByTestId('sequence-readonly-banner')).toBeNull();
  });

  it('AnnotationsTab + isReadOnlyZone=true → banner visible', () => {
    render(
      <AnnotationsTab
        sequence="ATGC"
        annotations={[]}
        fileName="X"
        isReadOnlyZone
      />,
    );
    expect(screen.getByTestId('annotations-readonly-banner')).toBeTruthy();
  });

  it('AnnotationsTab + isReadOnlyZone=false → no banner', () => {
    render(
      <AnnotationsTab
        sequence="ATGC"
        annotations={[]}
        fileName="X"
        isReadOnlyZone={false}
      />,
    );
    expect(screen.queryByTestId('annotations-readonly-banner')).toBeNull();
  });
});
