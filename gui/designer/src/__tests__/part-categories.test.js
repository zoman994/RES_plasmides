import { describe, it, expect } from 'vitest';
import {
  TYPE_CATEGORIES, CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_ICONS,
  STUDENT_CATEGORIES, getCategoryForType, groupByCategory,
} from '../part-categories';
import { FEATURE_COLORS } from '../theme';

describe('part-categories', () => {
  it('CATEGORY_ORDER contains all unique categories from TYPE_CATEGORIES', () => {
    const usedCategories = new Set(Object.values(TYPE_CATEGORIES));
    for (const cat of usedCategories) {
      expect(CATEGORY_ORDER).toContain(cat);
    }
  });

  it('every category in CATEGORY_ORDER has a label and icon', () => {
    for (const cat of CATEGORY_ORDER) {
      expect(CATEGORY_LABELS[cat]).toBeDefined();
      expect(CATEGORY_ICONS[cat]).toBeDefined();
    }
  });

  it('STUDENT_CATEGORIES is a subset of CATEGORY_ORDER', () => {
    for (const cat of STUDENT_CATEGORIES) {
      expect(CATEGORY_ORDER).toContain(cat);
    }
  });

  it('most types from FEATURE_COLORS have a mapping in TYPE_CATEGORIES', () => {
    const unmapped = [];
    for (const type of Object.keys(FEATURE_COLORS)) {
      if (!TYPE_CATEGORIES[type]) unmapped.push(type);
    }
    // All should be mapped (fallback to 'other' still works, but explicit is better)
    expect(unmapped).toEqual([]);
  });

  it('getCategoryForType returns correct category', () => {
    expect(getCategoryForType('CDS')).toBe('coding');
    expect(getCategoryForType('promoter')).toBe('regulatory');
    expect(getCategoryForType('rep_origin')).toBe('origins');
    expect(getCategoryForType('marker')).toBe('markers');
    expect(getCategoryForType('loxP')).toBe('recombination');
    expect(getCategoryForType('gRNA')).toBe('rna');
  });

  it('getCategoryForType falls back to other for unknown types', () => {
    expect(getCategoryForType('unknown_type')).toBe('other');
    expect(getCategoryForType('')).toBe('other');
    expect(getCategoryForType(undefined)).toBe('other');
  });

  it('groupByCategory groups parts correctly', () => {
    const parts = [
      { type: 'CDS', name: 'GFP' },
      { type: 'promoter', name: 'CMV' },
      { type: 'CDS', name: 'mCherry' },
      { type: 'rep_origin', name: 'pUC' },
      { type: 'weird_custom', name: 'Custom' },
    ];
    const grouped = groupByCategory(parts);
    expect(grouped.coding).toHaveLength(2);
    expect(grouped.regulatory).toHaveLength(1);
    expect(grouped.origins).toHaveLength(1);
    expect(grouped.other).toHaveLength(1);
    expect(grouped.markers).toBeUndefined();
  });
});
