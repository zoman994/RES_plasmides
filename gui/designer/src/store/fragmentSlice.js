/**
 * Fragment Slice — fragments on canvas, CRUD operations.
 * Fragments are instances of Parts placed in an assembly.
 */

import { autoAnnotate } from '../auto-annotate';
import { applyMutation } from '../mutagenesis';
import { generateRegionId } from '../domain-detection';
import { migratePartAnnotations } from '../migrate-annotations';
import { convertDomainsToAnnotations } from '../assembly-utils';
import { getRegions } from '../annotation-model';
import { checkDuplicates } from '../duplicate-checker';
import { createPlasmidGitReducers } from '../lib/plasmid-git-reducers';

/**
 * Adjust annotation coordinates after mutations change sequence length.
 * Mutations are sorted by dnaPosition (original sequence coords).
 */
function adjustAnnotationCoords(annotations, sortedMutations) {
  const shifts = [];
  for (const m of sortedMutations) {
    if (m.type === 'deletion') {
      shifts.push({ pos: m.dnaPosition, delta: -m.deleteLength });
    } else if (m.type === 'insertion') {
      shifts.push({ pos: m.dnaPosition, delta: m.insertSequence.length });
    }
  }
  if (!shifts.length) return annotations.map(a => ({ ...a }));

  function adjustCoord(coord) {
    let total = 0;
    for (const s of shifts) {
      if (s.pos < coord) total += s.delta;
    }
    return Math.max(0, coord + total);
  }

  return annotations.map(ann => {
    const start = adjustCoord(ann.start);
    const end = adjustCoord(ann.end);
    return { ...ann, start, end: Math.max(start, end) };
  });
}

let nextId = Date.now();
export const setNextId = (n) => { nextId = n; };

/** Create a fragment object from a Part (shared between addFragment and insertFragmentAt). */
function createFragFromPart(part) {
  let annotations = part.annotations?.some(a => a.level === 'region')
    ? [...part.annotations]
    : migratePartAnnotations(part);

  // One-time migration: legacy domains → detail annotations
  if (part.domains?.length && !annotations.some(a => a.migrated)) {
    const regions = annotations.filter(a => a.level === 'region');
    if (regions[0]) {
      annotations = [...annotations, ...convertDomainsToAnnotations(part.domains, regions[0].id, regions[0].start)];
    }
  }

  return {
    id: `f${nextId++}`, name: part.name, type: part.type,
    sequence: part.sequence || '', length: part.length || 0,
    strand: 1, needsAmplification: part.needsAmplification ?? true,
    sourceAssemblyId: part.sourceAssemblyId, partId: part.id,
    customColor: part.customColor,
    annotations,
  };
}

export const createFragmentSlice = (set, get) => ({
  // ═══ Plasmid-Git reducers (Sprint X): applyMutationGit / toggleCommit /
  //     archiveCommit / setCommitMessage. Extracted to lib/ per size-budget §9. ═══
  ...createPlasmidGitReducers(set, get),

  // ═══ Parts library (global, not per-assembly) ═══
  parts: [],
  lastDuplicateWarning: null, // { partName, matches: [{part, match, identity, message}] } | null
  setParts: (parts) => set({ parts }, false, 'setParts'),
  clearDuplicateWarning: () => set({ lastDuplicateWarning: null }, false, 'clearDuplicateWarning'),
  addPart: (part) => {
    // Check duplicates BEFORE adding (needs current parts list)
    if (part.sequence) {
      const dupes = checkDuplicates(part.sequence, get().parts);
      if (dupes.length > 0) {
        set({ lastDuplicateWarning: { partName: part.name, matches: dupes } }, false, 'duplicateWarning');
      } else {
        set({ lastDuplicateWarning: null }, false, 'duplicateWarning');
      }
    }

    set(state => {
    const newPart = {
      ...part,
      id: part.id || `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      parentId: part.parentId || null,
      parentIds: part.parentIds || [],
      children: part.children || [],
      derivation: part.derivation || null,
      source: part.source || 'manual',
      addedDate: part.addedDate || new Date().toISOString(),
      origin: part.origin || {
        projectId: get().activeProjectId,
        projectName: get().projectName,
        assemblyId: get().activeId,
        createdAt: new Date().toISOString(),
      },
    };
    // Auto-determine status from source
    if (!newPart.status) {
      if (['import', 'genbank_import', 'batch_import'].includes(newPart.source)) {
        newPart.status = 'verified';
      } else {
        newPart.status = 'draft';
      }
    }
    // Always auto-annotate: preserves existing regions + manual, adds details + points
    newPart.annotations = autoAnnotate(newPart);
    state.parts.push(newPart);
    // Link to single parent
    if (newPart.parentId) {
      const parent = state.parts.find(p => p.id === newPart.parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        if (!parent.children.includes(newPart.id)) parent.children.push(newPart.id);
      }
    }
    // Link to multiple parents (fusion)
    if (newPart.parentIds.length) {
      for (const pid of newPart.parentIds) {
        const parent = state.parts.find(p => p.id === pid);
        if (parent) {
          if (!parent.children) parent.children = [];
          if (!parent.children.includes(newPart.id)) parent.children.push(newPart.id);
        }
      }
    }
  }, false, 'addPart');
  },
  updatePart: (id, updates) => set(state => {
    const p = state.parts.find(x => x.id === id);
    if (p) Object.assign(p, updates);
  }, false, 'updatePart'),

  removePart: (id) => set(state => {
    state.parts = state.parts.filter(p => p.id !== id);
  }, false, 'removePart'),

  updatePartStatus: (id, status) => set(state => {
    const p = state.parts.find(x => x.id === id);
    if (p) {
      p.status = status;
      if (status === 'verified') p.verifiedDate = new Date().toISOString();
    }
  }, false, 'updatePartStatus'),

  archivePart: (id) => set(state => {
    const p = state.parts.find(x => x.id === id);
    if (p) p.status = 'archived';
  }, false, 'archivePart'),

  restorePart: (id, targetStatus = 'draft') => set(state => {
    const p = state.parts.find(x => x.id === id);
    if (p && p.status === 'archived') {
      p.status = targetStatus;
      if (targetStatus === 'verified') p.verifiedDate = new Date().toISOString();
    }
  }, false, 'restorePart'),

  // ═══ Fragment actions (modify active assembly) ═══
  // addFragment: legacy entry point. For circular plasmids with ≥2 regions
  // it routes into PlasmidUseWizard ("Use whole / Restriction / etc.").
  // ImportStartScreen primary actions ("На канвас" etc.) bypass this hijack
  // via addFragmentDirect — they must add the part as a plain fragment
  // without spawning a secondary modal.
  addFragment: (part) => {
    // Plasmid detection: circular + ≥2 regions → open wizard instead
    if (part.topology === 'circular' && getRegions(part.annotations).length >= 2) {
      get().setWizardPlasmid?.(part);
      return;
    }
    get().addFragmentDirect(part);
  },

  /**
   * Add part to canvas as a fragment unconditionally (no wizard hijack).
   * Used by ImportStartScreen — Kfix-2 (F-A) decoupled import-flow from
   * PlasmidUseWizard. Other entry points (palette drag, library "add to
   * canvas") still go through addFragment so the wizard auto-opens for
   * full annotated plasmids.
   */
  addFragmentDirect: (part) => {
    get().pushUndo?.();

    // Auto-save to library if not already there
    if (part.sequence && !get().parts.some(p => p.id === part.id)) {
      get().addPart({
        id: part.id,
        name: part.name,
        type: part.type || 'misc_feature',
        sequence: part.sequence,
        length: part.length || part.sequence.length,
        organism: part.organism,
        source: part.source || 'canvas_add',
      });
    }

    const frag = createFragFromPart(part);
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      asm.fragments.push(frag);
      // Add junction if more than 1 fragment
      if (asm.fragments.length > 1) {
        asm.junctions.push({
          type: 'overlap',
          overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
          enzyme: 'BsaI', overhang: '',
        });
      }
      asm.calculated = false;

    }, false, 'addFragmentDirect');
    // Auto-adjust junctions (force GG for identical neighbors, etc.)
    get().autoAdjustJunctions();
    // Auto-design GG overhangs if any junction is GG
    const asm = get().assemblies.find(a => a.id === get().activeId);
    if (asm?.junctions.some(j => j.type === 'golden_gate')) {
      queueMicrotask(() => get().autoDesignGGOverhangs());
    }
  },

  removeFragment: (index) => {
    get().pushUndo?.();
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      asm.fragments.splice(index, 1);
      // Remove the junction at the deleted position, preserve the rest
      if (asm.junctions.length > 0) {
        const jIdx = Math.min(index, asm.junctions.length - 1);
        asm.junctions.splice(jIdx, 1);
      }
      // Adjust junction count without destroying existing settings
      const count = asm.circular ? asm.fragments.length : Math.max(0, asm.fragments.length - 1);
      while (asm.junctions.length < count) {
        asm.junctions.push({
          type: 'overlap',
          overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
        });
      }
      asm.junctions.length = count;
      asm.calculated = false;
    }, false, 'removeFragment');
  },

  insertFragmentAt: (index, part) => {
    get().pushUndo?.();
    // Auto-save to library if not already there
    if (part.sequence && !get().parts.some(p => p.id === part.id)) {
      get().addPart({
        id: part.id, name: part.name, type: part.type || 'misc_feature',
        sequence: part.sequence, length: part.length || part.sequence.length,
        organism: part.organism, source: part.source || 'canvas_add',
      });
    }
    const frag = createFragFromPart(part);
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      asm.fragments.splice(index, 0, frag);
      // Adjust junction count, preserving existing junction settings
      const count = asm.circular ? asm.fragments.length : Math.max(0, asm.fragments.length - 1);
      while (asm.junctions.length < count) {
        asm.junctions.splice(Math.min(index, asm.junctions.length), 0, {
          type: 'overlap',
          overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
        });
      }
      asm.junctions.length = count;
      asm.calculated = false;

    }, false, 'insertFragmentAt');
    get().autoAdjustJunctions();
    const asm = get().assemblies.find(a => a.id === get().activeId);
    if (asm?.junctions.some(j => j.type === 'golden_gate')) {
      queueMicrotask(() => get().autoDesignGGOverhangs());
    }
  },

  flipFragment: (index) => {
    get().pushUndo?.();
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      const f = asm.fragments[index];
      if (!f) return;
      const RC = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
      const seqLen = f.sequence.length;
      f.sequence = f.sequence.split('').reverse().map(c => RC[c.toUpperCase()] || 'N').join('');
      f.strand = f.strand === 1 ? -1 : 1;
      if (f.annotations?.length) {
        f.annotations = f.annotations.map(a => ({
          ...a,
          start: seqLen - a.end,
          end: seqLen - a.start,
          strand: a.strand ? -a.strand : a.strand, // HIGH-1 fix: flip strand
        }));
      }
      asm.calculated = false;
      // CRIT-4 fix: re-run GG overhang design after flip
      const hasGG = asm.junctions.some(j => j.type === 'golden_gate');
      if (hasGG) {
        asm.apiWarnings = [...(asm.apiWarnings || []), '⚠ GG overhangs пересчитаны после flip фрагмента'];
        queueMicrotask(() => get().autoDesignGGOverhangs());
      }
    }, false, 'flipFragment');
  },

  replaceFragment: (index, newPart) => {
    get().pushUndo?.();
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm || !asm.fragments[index]) return;
      const old = asm.fragments[index];
      asm.fragments[index] = {
        ...createFragFromPart(newPart),
        strand: old.strand,
        needsAmplification: old.needsAmplification,
      };
      asm.calculated = false;
    }, false, 'replaceFragment');
  },

  saveFragmentToLibrary: (index) => {
    const asm = get().assemblies.find(a => a.id === get().activeId);
    if (!asm || !asm.fragments[index]) return;
    const frag = asm.fragments[index];
    get().addPart({
      name: frag.name,
      type: frag.type,
      sequence: frag.sequence,
      length: frag.length,
      annotations: frag.annotations,
      source: 'canvas',
    });
  },

  reorderFragments: (from, to) => {
    get().pushUndo?.();
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm || from === to) return;
      const [moved] = asm.fragments.splice(from, 1);
      const adjustedTo = from < to ? to - 1 : to;
      asm.fragments.splice(adjustedTo, 0, moved);
      // Move junctions to match fragment reorder, preserve settings
      if (asm.junctions.length > 0) {
        const jFrom = Math.min(from, asm.junctions.length - 1);
        const jTo = Math.min(to, asm.junctions.length - 1);
        const [movedJ] = asm.junctions.splice(jFrom, 1);
        const adjustedJTo = jFrom < jTo ? jTo - 1 : jTo;
        asm.junctions.splice(adjustedJTo, 0, movedJ);
      }
      // Adjust junction count without destroying existing settings
      const count = asm.circular ? asm.fragments.length : Math.max(0, asm.fragments.length - 1);
      while (asm.junctions.length < count) {
        asm.junctions.push({
          type: 'overlap',
          overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
        });
      }
      asm.junctions.length = count;
      asm.calculated = false;
      // HIGH-9: re-run GG overhang design after reorder
      const hasGG = asm.junctions.some(j => j.type === 'golden_gate');
      if (hasGG) {
        queueMicrotask(() => get().autoDesignGGOverhangs());
      }
    }, false, 'reorderFragments');
  },

  toggleAmplification: (index) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      const f = asm.fragments[index];
      if (f) f.needsAmplification = !f.needsAmplification;
      asm.calculated = false;
    }, false, 'toggleAmplification');
    // Auto-adjust junction modes after toggling
    get().autoAdjustJunctions();
  },

  updateFragment: (index, updates) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm || !asm.fragments[index]) return;
      Object.assign(asm.fragments[index], updates);
      asm.calculated = false;

    }, false, 'updateFragment');
  },

  // ═══ Mutagenesis: create mutant Part from parent ═══
  createMutant: (parentId, mutations) => {
    const parent = get().parts.find(p => p.id === parentId);
    if (!parent || !parent.sequence || !mutations?.length) return null;

    // Apply mutations in reverse position order to preserve coordinates
    const sorted = [...mutations].sort((a, b) => a.dnaPosition - b.dnaPosition);
    let mutantSeq = parent.sequence;
    for (const m of [...sorted].reverse()) {
      mutantSeq = applyMutation(mutantSeq, m);
    }

    // Name: "ParentName(D908A,E993A)"
    const labels = sorted.map(m => m.label).filter(Boolean).join(',');
    const mutantName = `${parent.name}(${labels})`;

    // Adjust annotation coordinates if length changed
    let annotations = parent.annotations?.length
      ? adjustAnnotationCoords(parent.annotations, sorted)
      : [];

    // Add mutation point annotations
    const regions = annotations.filter(a => a.level === 'region');
    for (const m of sorted) {
      const pos = m.dnaPosition;
      const parentRegion = regions.find(r => pos >= r.start && pos < r.end);
      annotations.push({
        name: m.label || `mut@${pos}`,
        type: 'mutation',
        start: pos,
        end: m.type === 'substitution' ? pos + 3
           : m.type === 'deletion' ? pos  // deletion collapses to a point
           : pos + (m.insertSequence?.length || 0),
        level: 'point',
        regionId: parentRegion?.id || null,
        auto: false,
        source: 'mutagenesis',
        details: {
          mutationType: m.type,
          label: m.label,
          dnaPosition: m.dnaPosition,
          ...(m.type === 'substitution' ? { newCodon: m.newCodon } : {}),
          ...(m.type === 'deletion' ? { deleteLength: m.deleteLength } : {}),
          ...(m.type === 'insertion' ? { insertSequence: m.insertSequence } : {}),
        },
      });
    }

    const newPart = {
      name: mutantName,
      type: parent.type,
      sequence: mutantSeq,
      length: mutantSeq.length,
      parentId,
      derivation: { type: 'mutation', mutations: sorted },
      annotations: annotations.length ? annotations : undefined,
      source: 'mutation',
      organism: parent.organism,
    };

    get().addPart(newPart);

    // Return the id of the newly created part
    return get().parts[get().parts.length - 1].id;
  },

  // ═══ Split: break one Part into two at a bp position ═══
  // Region-aware: spanning regions/details are cloned to both parts,
  // region IDs are regenerated, detail regionIds remapped.
  splitPart: (partId, position) => {
    const parent = get().parts.find(p => p.id === partId);
    if (!parent || !parent.sequence || position <= 0 || position >= parent.sequence.length) return null;

    const seq1 = parent.sequence.slice(0, position);
    const seq2 = parent.sequence.slice(position);

    // ── Region-aware annotation splitting ──
    const parentAnns = parent.annotations || [];
    const left = [], right = [];
    // Maps: old region id → new region id, per side
    const leftRegionMap = {};
    const rightRegionMap = {};

    // Pass 1: split all annotations into left/right/spanning
    for (const a of parentAnns) {
      if (a.end <= position) {
        // Fully in left part
        left.push({ ...a });
      } else if (a.start >= position) {
        // Fully in right part — shift coords
        right.push({ ...a, start: a.start - position, end: a.end - position });
      } else {
        // Spans the cut — clone to both parts, trimmed
        const leftCopy = { ...a, end: position, trimmed: true };
        const rightCopy = { ...a, start: 0, end: a.end - position, trimmed: true };

        if (a.level === 'region') {
          // Regions get new IDs on both sides
          const newLeftId = generateRegionId();
          const newRightId = generateRegionId();
          leftCopy.id = newLeftId;
          rightCopy.id = newRightId;
          leftCopy.name = `${a.name} (5')`;
          rightCopy.name = `${a.name} (3')`;
          leftRegionMap[a.id] = newLeftId;
          rightRegionMap[a.id] = newRightId;
        }

        left.push(leftCopy);
        right.push(rightCopy);
      }
    }

    // Pass 2: remap detail regionIds to new region IDs
    for (const a of left) {
      if (a.regionId && leftRegionMap[a.regionId]) {
        a.regionId = leftRegionMap[a.regionId];
      }
    }
    for (const a of right) {
      if (a.regionId && rightRegionMap[a.regionId]) {
        a.regionId = rightRegionMap[a.regionId];
      }
    }

    const base = {
      type: parent.type,
      parentId: partId,
      source: 'split',
      organism: parent.organism,
    };

    get().addPart({
      ...base,
      name: `${parent.name}_part1`,
      sequence: seq1,
      length: seq1.length,
      derivation: { type: 'split', position, index: 0 },
      annotations: left.length ? left : undefined,
    });
    const id1 = get().parts[get().parts.length - 1].id;

    get().addPart({
      ...base,
      name: `${parent.name}_part2`,
      sequence: seq2,
      length: seq2.length,
      derivation: { type: 'split', position, index: 1 },
      annotations: right.length ? right : undefined,
    });
    const id2 = get().parts[get().parts.length - 1].id;

    return [id1, id2];
  },

  // ═══ Fusion: join two Parts into one ═══
  fuseParts: (partId1, partId2, name) => {
    const p1 = get().parts.find(p => p.id === partId1);
    const p2 = get().parts.find(p => p.id === partId2);
    if (!p1 || !p2 || !p1.sequence || !p2.sequence) return null;

    const fusedSeq = p1.sequence + p2.sequence;
    const junctionPosition = p1.sequence.length;

    // Annotations: p1 as-is, p2 shifted
    const anns1 = (p1.annotations || []).map(a => ({ ...a }));
    const anns2 = (p2.annotations || []).map(a => ({
      ...a, start: a.start + junctionPosition, end: a.end + junctionPosition,
    }));
    const annotations = [...anns1, ...anns2];

    get().addPart({
      name: name || `${p1.name}-${p2.name}`,
      type: 'fusion',
      sequence: fusedSeq,
      length: fusedSeq.length,
      parentIds: [partId1, partId2],
      derivation: { type: 'fusion', junctionPosition },
      annotations: annotations.length ? annotations : undefined,
      source: 'fusion',
      organism: p1.organism,
    });

    return get().parts[get().parts.length - 1].id;
  },

  // ═══ Insert element into plasmid at a given position ═══
  insertElement: (plasmidId, insertPartId, position) => {
    const plasmid = get().parts.find(p => p.id === plasmidId);
    const insert = get().parts.find(p => p.id === insertPartId);
    if (!plasmid || !insert || !plasmid.sequence || !insert.sequence) return null;
    if (position < 0 || position > plasmid.sequence.length) return null;

    const newSeq = plasmid.sequence.slice(0, position) + insert.sequence + plasmid.sequence.slice(position);
    const insertLen = insert.sequence.length;

    // Shift annotations after insertion point
    const anns = (plasmid.annotations || []).map(a => {
      if (a.start >= position) return { ...a, start: a.start + insertLen, end: a.end + insertLen };
      if (a.end > position) return { ...a, end: a.end + insertLen };
      return { ...a };
    });
    // Add insert's annotations at the insertion point
    const insertAnns = (insert.annotations || []).map(a => ({
      ...a, start: a.start + position, end: a.end + position,
    }));

    get().addPart({
      name: `${plasmid.name}+${insert.name}`,
      type: plasmid.type,
      sequence: newSeq,
      length: newSeq.length,
      parentId: plasmidId,
      derivation: { type: 'insertion', insertedPart: insert.name, position },
      annotations: [...anns, ...insertAnns],
      source: 'insertion',
      organism: plasmid.organism,
      topology: plasmid.topology,
    });

    return get().parts[get().parts.length - 1].id;
  },

  // ═══ Delete element (region) from plasmid ═══
  deleteElement: (plasmidId, regionId) => {
    const plasmid = get().parts.find(p => p.id === plasmidId);
    if (!plasmid || !plasmid.sequence) return null;
    const region = (plasmid.annotations || []).find(a => a.id === regionId && a.level === 'region');
    if (!region) return null;

    const delLen = region.end - region.start;
    const newSeq = plasmid.sequence.slice(0, region.start) + plasmid.sequence.slice(region.end);

    // Remove the deleted region and its details, shift downstream
    const anns = (plasmid.annotations || [])
      .filter(a => {
        if (a.id === regionId) return false; // the deleted region
        if (a.regionId === regionId) return false; // its details
        if (a.start >= region.start && a.end <= region.end) return false; // fully inside
        return true;
      })
      .map(a => {
        if (a.start >= region.end) return { ...a, start: a.start - delLen, end: a.end - delLen };
        if (a.end > region.start && a.start < region.start) return { ...a, end: Math.min(a.end, region.start) };
        return { ...a };
      });

    get().addPart({
      name: `${plasmid.name}\u0394${region.name}`,
      type: plasmid.type,
      sequence: newSeq,
      length: newSeq.length,
      parentId: plasmidId,
      derivation: { type: 'deletion', deletedRegion: region.name, position: region.start, length: delLen },
      annotations: anns.length ? anns : undefined,
      source: 'deletion',
      organism: plasmid.organism,
      topology: plasmid.topology,
    });

    return get().parts[get().parts.length - 1].id;
  },
});
