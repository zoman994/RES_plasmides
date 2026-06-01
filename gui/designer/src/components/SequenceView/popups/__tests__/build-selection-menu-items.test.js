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
