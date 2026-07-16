/**
 * resolveSingleLinearizeCut — Игорь 07.07: «при выборе одного сайта, должна быть
 * возможность использования всего линейного фрагмента».
 *
 * A SINGLE restriction enzyme that cuts the molecule EXACTLY ONCE lets the biolog
 * linearize the whole plasmid and use the WHOLE linear fragment. Previously this
 * was offered ONLY when the unique site was CLICKED (firstRESite) — picking the
 * same enzyme from the dropdown force-routed to the gel (one full-length band =
 * a clunky detour). The helper unifies both: click OR dropdown, one unique cut →
 * linearize. A committed PAIR, ≥2 cuts, or ≥2 picked enzymes → null (must pick a
 * band off the gel; linearizing a multi-cutter is biologically wrong).
 */
import { describe, it, expect } from 'vitest';
import { resolveSingleLinearizeCut } from '../re-single-cut';

const UNIQUE = [
  { enzyme: 'EcoRI', site: 'GAATTC', pos: 42 },
  { enzyme: 'XhoI', site: 'CTCGAG', pos: 118 },
];

describe('resolveSingleLinearizeCut', () => {
  it('clicked single unique site → {enzyme, position} (existing path preserved)', () => {
    const out = resolveSingleLinearizeCut({
      firstRESite: { enzyme: 'EcoRI', position: 43 }, pickedEnzymes: [], reParams: null,
      uniqueSites: UNIQUE, cutCount: 1,
    });
    expect(out).toEqual({ enzyme: 'EcoRI', position: 43 });
  });

  it('single unique enzyme picked from the DROPDOWN → resolves its cut from the scan (the fix)', () => {
    const out = resolveSingleLinearizeCut({
      firstRESite: null, pickedEnzymes: ['XhoI'], reParams: null,
      uniqueSites: UNIQUE, cutCount: 1,
    });
    expect(out).toEqual({ enzyme: 'XhoI', position: 118 });
  });

  it('a committed PAIR (reParams) → null (that is an excision, not a linearize)', () => {
    const out = resolveSingleLinearizeCut({
      firstRESite: { enzyme: 'EcoRI', position: 43 },
      pickedEnzymes: [], reParams: { enzymes: ['EcoRI', 'XhoI'], cutSites: [{ position: 43 }, { position: 118 }] },
      uniqueSites: UNIQUE, cutCount: 2,
    });
    expect(out).toBeNull();
  });

  it('a multi-cutter (cutCount ≥ 2) → null (fragments the plasmid → must use the gel)', () => {
    const out = resolveSingleLinearizeCut({
      firstRESite: { enzyme: 'HindIII', position: 7 }, pickedEnzymes: [], reParams: null,
      uniqueSites: UNIQUE, cutCount: 3,
    });
    expect(out).toBeNull();
  });

  it('two picked enzymes → null (that is a double digest, not a single cut)', () => {
    const out = resolveSingleLinearizeCut({
      firstRESite: null, pickedEnzymes: ['EcoRI', 'XhoI'], reParams: null,
      uniqueSites: UNIQUE, cutCount: 2,
    });
    expect(out).toBeNull();
  });

  it('nothing selected → null', () => {
    expect(resolveSingleLinearizeCut({
      firstRESite: null, pickedEnzymes: [], reParams: null, uniqueSites: UNIQUE, cutCount: 0,
    })).toBeNull();
  });

  it('picked enzyme not among unique cutters (defensive) → null', () => {
    const out = resolveSingleLinearizeCut({
      firstRESite: null, pickedEnzymes: ['BsaI'], reParams: null, uniqueSites: UNIQUE, cutCount: 1,
    });
    expect(out).toBeNull();
  });
});
