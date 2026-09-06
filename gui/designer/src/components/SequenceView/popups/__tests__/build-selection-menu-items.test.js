/**
 * build-selection-menu-items — «Add to common features» item (SPEC_COMMON_FEATURES
 * DEC-CF-05). Present only when the selection matches a region feature AND the
 * onPromoteToCommon consumer prop is wired; gone otherwise (so Annotator-preview /
 * Assembly / PCR viewers don't get it).
 */
import { describe, it, expect, vi } from 'vitest';
import { buildSelectionMenuItems } from '../build-selection-menu-items.js';
import { STRINGS } from '../../../../lib/strings';

const REGION = { level: 'region', start: 10, end: 40, name: 'GFP', type: 'CDS', id: 'r1' };

function base(overrides = {}) {
  return {
    contextMenu: { x: 5, y: 5 },
    caretAnchor: 10,
    caretPos: 40,
    annotations: [REGION],
    setContextMenu: vi.fn(),
    onEditKeyDown: vi.fn(),
    onAnnotationEdit: vi.fn(),
    ...overrides,
  };
}

const keys = (items) => (items || []).map((i) => i.key);

describe('buildSelectionMenuItems — promote to common', () => {
  it('includes the promote item when region matches AND onPromoteToCommon is wired', () => {
    const items = buildSelectionMenuItems(base({ onPromoteToCommon: vi.fn() }));
    expect(keys(items)).toContain('promote-common');
    const item = items.find((i) => i.key === 'promote-common');
    expect(item.label).toBe(STRINGS.commonFeatures.promoteMenuItem);
  });

  it('omits the promote item without the onPromoteToCommon prop', () => {
    const items = buildSelectionMenuItems(base());
    expect(keys(items)).not.toContain('promote-common');
  });

  it('omits the promote item when the selection matches no region', () => {
    // Selection 50..60 does not equal the region 10..40 → no matchedRegion.
    const items = buildSelectionMenuItems(base({
      caretAnchor: 50, caretPos: 60, onPromoteToCommon: vi.fn(),
    }));
    expect(keys(items)).not.toContain('promote-common');
  });

  it('clicking the item closes the menu and calls onPromoteToCommon with region + range', () => {
    const onPromoteToCommon = vi.fn();
    const setContextMenu = vi.fn();
    const items = buildSelectionMenuItems(base({ onPromoteToCommon, setContextMenu }));
    items.find((i) => i.key === 'promote-common').onClick();
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(onPromoteToCommon).toHaveBeenCalledWith({ region: REGION, start: 10, end: 40 });
  });
});

describe('buildSelectionMenuItems — «Отметить как интрон»', () => {
  // a sub-range strictly inside the CDS [10,40)
  const inside = { caretAnchor: 15, caretPos: 25 };

  it('offers the item for a sub-selection inside a translatable region', () => {
    const items = buildSelectionMenuItems(base({ ...inside }));
    expect(keys(items)).toContain('mark-intron');
  });

  it('dispatches a detail intron linked to the parent CDS and closes the menu', () => {
    const onAnnotationEdit = vi.fn();
    const setContextMenu = vi.fn();
    const items = buildSelectionMenuItems(base({ ...inside, onAnnotationEdit, setContextMenu }));
    items.find((i) => i.key === 'mark-intron').onClick();
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(onAnnotationEdit).toHaveBeenCalledWith({
      kind: 'create',
      payload: {
        type: 'intron', level: 'detail', regionId: 'r1',
        start: 15, end: 25, strand: 1, name: 'интрон',
      },
    });
  });

  it('omits the item when the selection is not inside any CDS', () => {
    const items = buildSelectionMenuItems(base({ caretAnchor: 50, caretPos: 60 }));
    expect(keys(items)).not.toContain('mark-intron');
  });

  it('omits the item when the selection equals the whole region (that is the CDS, not an intron)', () => {
    const items = buildSelectionMenuItems(base({ caretAnchor: 10, caretPos: 40 }));
    expect(keys(items)).not.toContain('mark-intron');
  });

  it('omits the item in read-only viewers (no onAnnotationEdit)', () => {
    const items = buildSelectionMenuItems(base({ ...inside, onAnnotationEdit: undefined }));
    expect(keys(items)).not.toContain('mark-intron');
  });
});

describe('buildSelectionMenuItems — FEAT-EXTRACT (извлечь в библиотеку)', () => {
  it('includes the extract item when a region matches AND onExtractFeature is wired', () => {
    const onExtractFeature = vi.fn();
    const items = buildSelectionMenuItems(base({ onExtractFeature }));
    expect(keys(items)).toContain('extract-feature');
    const item = items.find((i) => i.key === 'extract-feature');
    expect(item.label).toBe('Извлечь в библиотеку');
    item.onClick();
    expect(onExtractFeature).toHaveBeenCalledWith({ region: REGION, start: 10, end: 40 });
  });

  it('omits the extract item without the onExtractFeature prop', () => {
    expect(keys(buildSelectionMenuItems(base()))).not.toContain('extract-feature');
  });

  it('omits the extract item when the selection does not match a region', () => {
    const items = buildSelectionMenuItems(base({ caretAnchor: 12, caretPos: 38, onExtractFeature: vi.fn() }));
    expect(keys(items)).not.toContain('extract-feature');
  });
});

describe('buildSelectionMenuItems — origin-crossing selection', () => {
  it('offers only primer writes and sends their canonical monotonic range', () => {
    const onWritePrimer = vi.fn();
    const setContextMenu = vi.fn();
    const items = buildSelectionMenuItems(base({
      caretAnchor: -287,
      caretPos: 13,
      onWritePrimer,
      onOpenAnnotator: vi.fn(),
      onBlastSelection: vi.fn(),
      onCreatePiece: vi.fn(),
      setContextMenu,
      selectionRange: {
        start: 2399, end: 2699, length: 300, wrapsOrigin: true,
      },
    }));

    expect(keys(items)).toEqual(['primer-fwd', 'primer-rev']);
    items[0].onClick();
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(onWritePrimer).toHaveBeenCalledWith({
      direction: 'forward', start: 2399, end: 2699,
    });
  });
});
