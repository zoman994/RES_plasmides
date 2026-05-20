/**
 * bodge-export-profiles — preset filters for .bodge v2 exports.
 *
 * Spec §13. Profiles control per-section filters across:
 *   containers / containerHistory / assemblies / primers /
 *   notebook.entries / notebook.attachments / sangerDetails / library.
 *
 * Each section has three states: full / filtered / excluded.
 * Profile = combination of section states.
 *
 * Entry points:
 *   applyProfile(profileName, state) → filtered state
 *   getCustomProfileFromUI(checkboxState) → ProfileSpec
 *   EXPORT_PROFILES_REGISTRY — readonly map of preset definitions.
 */
import { stripDeviceId } from './bodge-manifest-v2';

const PROFILE_FULL = {
  name: 'full',
  description: 'Все секции, все вложения, полная история',
  sections: {
    containers: 'full',
    containerHistory: 'full',
    assemblies: 'full',
    primers: 'full',
    notebookEntries: 'full',
    notebookAttachments: 'full',
    sangerDetails: 'full',
    library: 'full',
  },
};

const PROFILE_PUBLIC_SUPP = {
  name: 'public-supp',
  description: 'Containers + assemblies + primers + notebook (text only). Strip deviceId.',
  sections: {
    containers: 'full',
    containerHistory: 'full',
    assemblies: 'full',
    primers: 'full',
    notebookEntries: 'full',
    notebookAttachments: 'excluded',
    sangerDetails: 'excluded',
    library: 'full',
  },
  stripTelemetry: true,
};

const PROFILE_CONTAINERS_BUNDLE = {
  name: 'containers-bundle',
  description: 'Только containers/, без сборок. Binding-only primer refs, без notebook.',
  sections: {
    containers: 'full',
    containerHistory: 'full',
    assemblies: 'excluded',
    primers: 'filtered', // binding-only, no library-selection origins
    notebookEntries: 'excluded',
    notebookAttachments: 'excluded',
    sangerDetails: 'excluded',
    library: 'full',
  },
};

const PROFILE_SINGLE_ASSEMBLY = {
  name: 'single-assembly',
  description: 'Одна chosen assembly + referenced containers + primers + zone-filtered notebook.',
  sections: {
    containers: 'filtered', // only those referenced by the assembly
    containerHistory: 'full',
    assemblies: 'filtered',
    primers: 'filtered',
    notebookEntries: 'filtered', // zoneId-scoped
    notebookAttachments: 'filtered',
    sangerDetails: 'full',
    library: 'filtered',
  },
};

const PROFILE_CUSTOM = {
  name: 'custom',
  description: 'UI checkbox matrix per section',
  sections: {},
};

export const EXPORT_PROFILES_REGISTRY = Object.freeze({
  full: PROFILE_FULL,
  'public-supp': PROFILE_PUBLIC_SUPP,
  'containers-bundle': PROFILE_CONTAINERS_BUNDLE,
  'single-assembly': PROFILE_SINGLE_ASSEMBLY,
  custom: PROFILE_CUSTOM,
});

export function getProfileSpec(name) {
  return EXPORT_PROFILES_REGISTRY[name] || null;
}

/**
 * Apply a profile to a canonical state. Returns a NEW state with
 * filtered sections. Does NOT mutate input.
 *
 * For single-assembly the caller passes opts.singleAssemblyZoneId so we
 * know which to keep.
 */
export function applyProfile(profileName, state, opts = {}) {
  const profile = typeof profileName === 'string'
    ? getProfileSpec(profileName)
    : profileName;
  if (!profile) throw new Error(`applyProfile: unknown profile "${profileName}"`);
  const out = { ...state };
  const s = profile.sections;

  // Containers.
  if (s.containers === 'excluded') {
    out.containers = [];
  } else if (s.containers === 'filtered' && opts.singleAssemblyZoneId) {
    out.containers = filterContainersByZone(state, opts.singleAssemblyZoneId);
  } else {
    out.containers = [...(state.containers || [])];
  }

  // Container history (provenance.commits).
  if (s.containerHistory !== 'full') {
    out.containers = out.containers.map(c => ({
      ...c,
      provenance: c.provenance
        ? { ...c.provenance, commits: c.provenance.commits?.slice(-1) || [] }
        : null,
    }));
  }

  // Assemblies (zones + pieces + operations + junctions).
  if (s.assemblies === 'excluded') {
    out.zones = [];
    out.pieces = [];
    out.operations = [];
    out.junctions = [];
  } else if (s.assemblies === 'filtered' && opts.singleAssemblyZoneId) {
    const z = opts.singleAssemblyZoneId;
    out.zones = (state.zones || []).filter(zn => zn.id === z);
    out.pieces = (state.pieces || []).filter(p => p.zoneId === z);
    out.operations = (state.operations || []).filter(o => o.zoneId === z);
    const pieceIdSet = new Set(out.pieces.map(p => p.id));
    out.junctions = (state.junctions || []).filter(j =>
      pieceIdSet.has(j.leftPieceId) || pieceIdSet.has(j.rightPieceId));
  } else {
    out.zones = [...(state.zones || [])];
    out.pieces = [...(state.pieces || [])];
    out.operations = [...(state.operations || [])];
    out.junctions = [...(state.junctions || [])];
  }

  // Primers.
  if (s.primers === 'excluded') {
    out.primers = [];
  } else if (s.primers === 'filtered') {
    // For single-assembly: only primers referenced by the kept assembly.
    if (opts.singleAssemblyZoneId) {
      const referenced = new Set();
      for (const o of out.operations) {
        if (o.params?.primerPairId) referenced.add(o.params.primerPairId);
      }
      out.primers = (state.primers || []).filter(p =>
        referenced.has(p.id) || referenced.has(p.forwardId) || referenced.has(p.reverseId));
    } else if (profile.name === 'containers-bundle') {
      // Binding-only: drop library-selection primers (those are workflow,
      // not container metadata).
      out.primers = (state.primers || []).filter(p =>
        p.boundContainers && p.boundContainers.length > 0);
    } else {
      out.primers = [...(state.primers || [])];
    }
  } else {
    out.primers = [...(state.primers || [])];
  }

  // Notebook entries.
  if (s.notebookEntries === 'excluded') {
    out.notebookEntries = [];
  } else if (s.notebookEntries === 'filtered' && opts.singleAssemblyZoneId) {
    out.notebookEntries = (state.notebookEntries || []).filter(e =>
      !e.zoneRef || e.zoneRef === opts.singleAssemblyZoneId);
  } else {
    out.notebookEntries = [...(state.notebookEntries || [])];
  }

  // Notebook attachments.
  if (s.notebookAttachments === 'excluded') {
    out.attachmentsManifest = {};
  } else if (s.notebookAttachments === 'filtered' && opts.singleAssemblyZoneId) {
    const keptEntryIds = new Set(out.notebookEntries.map(e => e.id));
    const filtered = {};
    for (const [path, meta] of Object.entries(state.attachmentsManifest || {})) {
      if (!meta?.entryRef || keptEntryIds.has(meta.entryRef)) filtered[path] = meta;
    }
    out.attachmentsManifest = filtered;
  } else {
    out.attachmentsManifest = { ...(state.attachmentsManifest || {}) };
  }

  // Sanger details (materializedClones[].notes / sangerVerified).
  if (s.sangerDetails === 'excluded') {
    out.operations = out.operations.map(o => ({
      ...o,
      materializedClones: o.materializedClones?.map(c => ({
        cloneId: c.cloneId,
        label: c.label,
        sangerVerified: 'pending',
        notes: '',
      })) || null,
    }));
  }

  // Library.
  if (s.library === 'excluded') {
    out.libraryEntries = [];
  } else if (s.library === 'filtered' && opts.singleAssemblyZoneId) {
    const containerIdSet = new Set(out.containers.map(c => c.id));
    out.libraryEntries = (state.libraryEntries || []).filter(e =>
      !e.containerId || containerIdSet.has(e.containerId));
  } else {
    out.libraryEntries = [...(state.libraryEntries || [])];
  }

  // Strip telemetry if profile requests it (public-supp).
  if (profile.stripTelemetry) {
    if (out.projectMeta?.author) {
      out.projectMeta = {
        ...out.projectMeta,
        author: { ...out.projectMeta.author, deviceId: '' },
      };
    }
  }

  return out;
}

function filterContainersByZone(state, zoneId) {
  const pieces = (state.pieces || []).filter(p => p.zoneId === zoneId);
  const ops = (state.operations || []).filter(o => o.zoneId === zoneId);
  const referenced = new Set();
  for (const p of pieces) for (const sid of p.sourceIds || []) referenced.add(sid);
  for (const o of ops) {
    for (const i of o.inputs || []) referenced.add(i);
    for (const out of o.outputs || []) referenced.add(out);
    for (const c of o.materializedClones || []) if (c.cloneId) referenced.add(c.cloneId);
  }
  return (state.containers || []).filter(c => referenced.has(c.id));
}

/**
 * Construct a custom profile from a UI checkbox matrix.
 * Input shape: `{containers: bool, containerHistory: bool, ...}`.
 * Maps `true → 'full'`, `false → 'excluded'`. No `filtered` state from
 * UI (use a profile preset for that).
 */
export function getCustomProfileFromUI(checkboxState = {}) {
  const sections = {};
  const keys = [
    'containers', 'containerHistory', 'assemblies', 'primers',
    'notebookEntries', 'notebookAttachments', 'sangerDetails', 'library',
  ];
  for (const k of keys) {
    sections[k] = checkboxState[k] ? 'full' : 'excluded';
  }
  return {
    name: 'custom',
    description: 'User-defined',
    sections,
    stripTelemetry: !!checkboxState.stripTelemetry,
  };
}

// Re-export for convenience in writeBodgeV2 callers.
export { stripDeviceId };
