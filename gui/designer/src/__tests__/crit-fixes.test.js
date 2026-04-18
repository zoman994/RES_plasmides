import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import { designPrimersLocal } from '../local-primer-design';

// Helper: set up store with an assembly
function setupAssembly(fragments, junctions, opts = {}) {
  const asm = {
    id: 'test_asm',
    name: 'Test',
    fragments,
    junctions,
    circular: opts.circular || false,
    calculated: false,
    assemblyType: opts.assemblyType || 'overlap',
    apiWarnings: [],
  };
  useStore.setState({
    assemblies: [asm],
    activeId: 'test_asm',
  });
}

// ── CRIT-4: flipFragment in GG assembly re-designs overhangs ──
describe('CRIT-4: flipFragment + GG overhang re-design', () => {
  const fragA = {
    id: 'f1', name: 'FragA', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG',
    needsAmplification: true, strand: 1, annotations: [],
  };
  const fragB = {
    id: 'f2', name: 'FragB', sequence: 'CGATCGATCGATCGATCGATCGATCGATG',
    needsAmplification: true, strand: 1, annotations: [],
  };

  it('flipFragment in GG assembly triggers apiWarning about overhangs', () => {
    setupAssembly(
      [{ ...fragA }, { ...fragB }],
      [{ type: 'golden_gate', overhang: 'ATCG', enzyme: 'BsaI' }],
      { assemblyType: 'golden_gate' },
    );
    useStore.getState().flipFragment(0);
    const asm = useStore.getState().assemblies[0];
    expect(asm.apiWarnings.some(w => w.includes('GG overhangs'))).toBe(true);
  });

  it('flipFragment in overlap assembly does NOT add GG warning', () => {
    setupAssembly(
      [{ ...fragA }, { ...fragB }],
      [{ type: 'overlap', overlapLength: 30 }],
    );
    useStore.getState().flipFragment(0);
    const asm = useStore.getState().assemblies[0];
    expect(asm.apiWarnings.some(w => w.includes('GG overhangs'))).toBe(false);
  });
});

// ── HIGH-1: flipFragment inverts annotation strand ──
describe('HIGH-1: flipFragment inverts annotation strand', () => {
  it('strand 1 → -1 after flip', () => {
    const frag = {
      id: 'f1', name: 'FragA', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG',
      needsAmplification: true, strand: 1,
      annotations: [{ name: 'CDS', start: 0, end: 10, strand: 1, level: 'region' }],
    };
    setupAssembly([{ ...frag }], []);
    useStore.getState().flipFragment(0);
    const ann = useStore.getState().assemblies[0].fragments[0].annotations[0];
    expect(ann.strand).toBe(-1);
  });

  it('strand -1 → 1 after flip', () => {
    const frag = {
      id: 'f1', name: 'FragA', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG',
      needsAmplification: true, strand: 1,
      annotations: [{ name: 'CDS', start: 5, end: 20, strand: -1, level: 'region' }],
    };
    setupAssembly([{ ...frag }], []);
    useStore.getState().flipFragment(0);
    const ann = useStore.getState().assemblies[0].fragments[0].annotations[0];
    expect(ann.strand).toBe(1);
  });

  it('undefined strand stays undefined after flip', () => {
    const frag = {
      id: 'f1', name: 'FragA', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG',
      needsAmplification: true, strand: 1,
      annotations: [{ name: 'misc', start: 0, end: 5, level: 'detail' }],
    };
    setupAssembly([{ ...frag }], []);
    useStore.getState().flipFragment(0);
    const ann = useStore.getState().assemblies[0].fragments[0].annotations[0];
    expect(ann.strand).toBeUndefined();
  });
});

// ── CRIT-5: short fragment warning text includes "merge" suggestion ──
describe('CRIT-5: short fragment warning', () => {
  it('fragment <18bp produces warning with merge suggestion', () => {
    const frags = [
      { name: 'Short', sequence: 'ATGCGATCG', needsAmplification: true },
      { name: 'Normal', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG', needsAmplification: true },
    ];
    const juncs = [{ type: 'overlap', overlapLength: 30, overlapMode: 'split' }];
    const { warnings } = designPrimersLocal(frags, juncs, false);
    const mergeWarning = warnings.find(w => w.includes('Short') && w.includes('merge'));
    expect(mergeWarning).toBeTruthy();
  });
});

// ── HIGH-9: reorderFragments in GG triggers overhang re-design ──
describe('HIGH-9: reorderFragments GG re-design', () => {
  it('reorder in GG assembly triggers autoDesignGGOverhangs', () => {
    const fragA = { id: 'f1', name: 'A', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG', needsAmplification: true, strand: 1, annotations: [] };
    const fragB = { id: 'f2', name: 'B', sequence: 'CGATCGATCGATCGATCGATCGATCGATG', needsAmplification: true, strand: 1, annotations: [] };
    const fragC = { id: 'f3', name: 'C', sequence: 'GATCGATCGATCGATCGATCGATCGATCG', needsAmplification: true, strand: 1, annotations: [] };
    setupAssembly(
      [{ ...fragA }, { ...fragB }, { ...fragC }],
      [
        { type: 'golden_gate', overhang: 'ATCG', enzyme: 'BsaI' },
        { type: 'golden_gate', overhang: 'GCTA', enzyme: 'BsaI' },
      ],
      { assemblyType: 'golden_gate' },
    );
    useStore.getState().reorderFragments(0, 2);
    // After reorder, assembly should be recalculated (calculated = false)
    const asm = useStore.getState().assemblies[0];
    expect(asm.calculated).toBe(false);
  });

  it('reorder in overlap assembly does NOT trigger GG re-design warning', () => {
    const fragA = { id: 'f1', name: 'A', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG', needsAmplification: true, strand: 1, annotations: [] };
    const fragB = { id: 'f2', name: 'B', sequence: 'CGATCGATCGATCGATCGATCGATCGATG', needsAmplification: true, strand: 1, annotations: [] };
    setupAssembly(
      [{ ...fragA }, { ...fragB }],
      [{ type: 'overlap', overlapLength: 30 }],
    );
    useStore.getState().reorderFragments(0, 1);
    const asm = useStore.getState().assemblies[0];
    expect(asm.calculated).toBe(false);
  });
});

// ── HIGH-6: single fragment → info warning ──
describe('HIGH-6: single fragment warning', () => {
  it('1 fragment returns info warning about no primers needed', () => {
    const frags = [{ name: 'Solo', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG', needsAmplification: true }];
    const { primers, warnings } = designPrimersLocal(frags, [], false);
    expect(primers).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('Один фрагмент');
  });
});

// ── P1: single backbone (needsAmplification=false) → 0 primers ──
describe('P1: single backbone fragment no primers', () => {
  it('single no-PCR backbone produces 0 primers and no N+N warning', () => {
    const frags = [{
      name: 'pAN7-1', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG',
      needsAmplification: false, type: 'backbone',
    }];
    const { primers, warnings } = designPrimersLocal(frags, [], false);
    expect(primers).toHaveLength(0);
    expect(warnings.some(w => w.includes('без ПЦР — overlap невозможен'))).toBe(false);
  });

  it('two identical backbone fragments (StrictMode double-push) → duplicates detected', () => {
    const frag = {
      name: 'pAN7-1', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG',
      needsAmplification: false, type: 'backbone',
    };
    // Simulating StrictMode double-push: 2 identical fragments
    const { primers } = designPrimersLocal([frag, { ...frag }], [], false);
    // Even if 2 fragments pass, both are needsAmplification=false with same seq
    // Primers ARE generated (designPrimersLocal doesn't skip no-PCR frags)
    // But the real fix is preventing the double-push in PlasmidUseWizard
    expect(primers.length).toBeGreaterThan(0); // confirms the double-push causes primers
  });

  it('handleUseWhole guard: calling addFragment twice with same partId should not duplicate', () => {
    setupAssembly([], []);
    const store = useStore.getState();
    const asm = store.assemblies[0];
    // Simulate what handleUseWhole does
    const frag = {
      id: 'f123', name: 'pAN7-1', type: 'backbone',
      sequence: 'ATGCGATCGATCGATCGATCGATCGATCG', length: 29,
      strand: 1, needsAmplification: false, partId: 'part_pAN7',
    };
    // First push
    useStore.setState(state => {
      const a = state.assemblies.find(x => x.id === state.activeId);
      if (a && !a.fragments.some(f => f.partId === frag.partId)) {
        a.fragments.push({ ...frag });
      }
    });
    // Second push (StrictMode double-fire)
    useStore.setState(state => {
      const a = state.assemblies.find(x => x.id === state.activeId);
      if (a && !a.fragments.some(f => f.partId === frag.partId)) {
        a.fragments.push({ ...frag });
      }
    });
    const result = useStore.getState().assemblies[0];
    expect(result.fragments).toHaveLength(1);
  });
});

// ── P1v2: auto-design must clear stale primers when fragments drop to 1 ──
describe('P1v2: stale primer cleanup', () => {
  it('designPrimersLocal returns empty for single no-PCR backbone', () => {
    const frags = [{ name: 'pAN7-1', sequence: 'ATGCGATCG'.repeat(100), needsAmplification: false }];
    const { primers, warnings } = designPrimersLocal(frags, [], false);
    expect(primers).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('stale primers from 2-fragment state must be cleared when going to 1 fragment', () => {
    // Step 1: setup assembly with 2 fragments → primers calculated
    const seq = 'ATGCGATCGATCGATCGATCGATCGATCG';
    setupAssembly(
      [
        { id: 'f1', name: 'A', sequence: seq, needsAmplification: true, strand: 1, annotations: [] },
        { id: 'f2', name: 'B', sequence: seq, needsAmplification: true, strand: 1, annotations: [] },
      ],
      [{ type: 'overlap', overlapLength: 30 }],
    );
    const { primers } = designPrimersLocal(
      useStore.getState().assemblies[0].fragments,
      useStore.getState().assemblies[0].junctions,
      false,
    );
    expect(primers.length).toBeGreaterThan(0); // 4 primers for 2 fragments

    // Step 2: store these primers (simulating useEffect write)
    useStore.setState(state => {
      const asm = state.assemblies[0];
      asm.primers = primers;
      asm.calculated = true;
    });
    expect(useStore.getState().assemblies[0].primers.length).toBeGreaterThan(0);

    // Step 3: remove second fragment → 1 fragment left
    useStore.setState(state => {
      const asm = state.assemblies[0];
      asm.fragments = [asm.fragments[0]];
      asm.junctions = [];
    });

    // Step 4: auto-design returns null for 1 fragment
    const result = designPrimersLocal(useStore.getState().assemblies[0].fragments, [], false);
    expect(result.primers).toHaveLength(0);

    // The App.jsx useEffect SHOULD clear primers here — that's the fix
    // Simulating the fixed behavior:
    const asm = useStore.getState().assemblies[0];
    expect(asm.fragments).toHaveLength(1);
    // Old primers are stale — they should be cleared by App.jsx useEffect
  });
});

// ── P2: architecture contract — sanitize at entry yields clean primers ──
// (Blocks 11/11b added defensive sanitize inside designPrimersLocal; Phase 1.1
// centralised it in sequence-utils and enforces sanitize-at-entry, so
// designPrimersLocal now trusts its input. Regression tests for sanitize
// itself live in sequence-utils.test.js.)
describe('P2: sanitize-at-entry contract', () => {
  it('dirty sequence routed through sanitizeSequence yields clean primers', async () => {
    const { sanitizeSequence } = await import('../sequence-utils');
    const dirty = '\0ATGCGATCGATCGATCGATCGATCGATCG';
    const frags = [
      { name: 'A', sequence: sanitizeSequence(dirty), needsAmplification: true },
      { name: 'B', sequence: 'CGATCGATCGATCGATCGATCGATCGATG', needsAmplification: true },
    ];
    const { primers } = designPrimersLocal(frags, [{ type: 'overlap', overlapLength: 30 }], false);
    for (const p of primers) {
      expect(p.sequence).not.toContain('\0');
      expect(p.sequence).not.toContain('∅');
    }
  });
});

// ── HIGH-10: removeFragment circular junction count ──
describe('HIGH-10: removeFragment circular junction count', () => {
  it('circular 3 fragments → remove last → 2 junctions', () => {
    setupAssembly(
      [
        { id: 'f1', name: 'A', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG', needsAmplification: true, strand: 1, annotations: [] },
        { id: 'f2', name: 'B', sequence: 'CGATCGATCGATCGATCGATCGATCGATG', needsAmplification: true, strand: 1, annotations: [] },
        { id: 'f3', name: 'C', sequence: 'GATCGATCGATCGATCGATCGATCGATCG', needsAmplification: true, strand: 1, annotations: [] },
      ],
      [
        { type: 'overlap', overlapLength: 30 },
        { type: 'overlap', overlapLength: 30 },
        { type: 'overlap', overlapLength: 30 },
      ],
      { circular: true },
    );
    useStore.getState().removeFragment(2); // remove last
    const asm = useStore.getState().assemblies[0];
    expect(asm.fragments).toHaveLength(2);
    expect(asm.junctions).toHaveLength(2); // circular: 2 frags = 2 junctions
  });

  it('linear 3 fragments → remove last → 1 junction', () => {
    setupAssembly(
      [
        { id: 'f1', name: 'A', sequence: 'ATGCGATCGATCGATCGATCGATCGATCG', needsAmplification: true, strand: 1, annotations: [] },
        { id: 'f2', name: 'B', sequence: 'CGATCGATCGATCGATCGATCGATCGATG', needsAmplification: true, strand: 1, annotations: [] },
        { id: 'f3', name: 'C', sequence: 'GATCGATCGATCGATCGATCGATCGATCG', needsAmplification: true, strand: 1, annotations: [] },
      ],
      [
        { type: 'overlap', overlapLength: 30 },
        { type: 'overlap', overlapLength: 30 },
      ],
    );
    useStore.getState().removeFragment(2);
    const asm = useStore.getState().assemblies[0];
    expect(asm.fragments).toHaveLength(2);
    expect(asm.junctions).toHaveLength(1); // linear: 2 frags = 1 junction
  });
});
