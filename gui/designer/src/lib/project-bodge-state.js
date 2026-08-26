/**
 * project-bodge-state.js — the ONE place a project becomes a `.bodge`, and a
 * `.bodge` becomes project state again (ANN-0M root A).
 *
 * Save used to be assembled inline in App.jsx, where it branched on whether a
 * CanvasSkeleton snapshot happened to exist. A user who imported primers but
 * never opened the assembly canvas has no snapshot, so that branch fell to the
 * v1 writer — which carries no primer pool at all — and the import was gone on
 * the next Open. The branch itself is the defect: what a file must contain
 * cannot depend on which screens the user happened to visit.
 *
 * So there is one collector. It takes project meta, a snapshot **or null**, and
 * the project's own primer records, and decides everything from there. An empty
 * assembly is a legitimate outcome; a missing primer pool is not.
 */

import { skeletonToCanonical } from '../components/CanvasSkeleton/lib/skeleton-bodge-bridge';
import { writeBodgeV2 } from './bodge-zip';
import { PRIMER_SCOPE_GLOBAL, primerScopeOf } from './primer-identity';

/**
 * The primer records that belong to one project, in stable order.
 *
 * A library-scoped or foreign-project record is not this file's business; the
 * project's own records always are.
 */
export function primersForProject(primersById, projectId) {
  const target = projectId ?? null;
  return Object.values(primersById || {})
    // PRIMER-LIVE-1 — the personal freezer never leaves this machine. Scope is
    // checked explicitly rather than trusted to follow from `projectId`: the
    // claim being made is "a tube of this exists", and a file that carried it
    // to another lab would be asserting something it cannot know.
    .filter((p) => p && primerScopeOf(p) !== PRIMER_SCOPE_GLOBAL)
    .filter((p) => p && (p.projectId ?? null) === target)
    .sort((a, b) => String(a.addedAt || '').localeCompare(String(b.addedAt || '')));
}

/** The primer records carried by a canonical `.bodge` v2 state. */
export function primersFromCanonical(state) {
  const rows = state && Array.isArray(state.primers) ? state.primers : [];
  return rows.filter((p) => p && p.id);
}

/**
 * Build the canonical v2 state for one project.
 *
 * @param {object}      args
 * @param {object}      args.projectMeta
 * @param {object|null} args.snapshot   CanvasSkeleton snapshot, or null when the
 *                                      user never opened the assembly canvas
 * @param {object[]}    [args.primers]  the project's canonical primer records
 * @returns {object} canonical `.bodge` v2 state
 */
export function buildProjectBodgeState({ projectMeta = {}, snapshot = null, primers = [] }) {
  return skeletonToCanonical(snapshot, projectMeta, primers);
}

/**
 * Serialize one project to a `.bodge` blob.
 *
 * @param {object} args
 * @param {object} args.project        the projectSlice row
 * @param {object|null} args.snapshot  `loadSnapshot(id)` — may legitimately be null
 * @param {object[]} [args.primers]    the project's canonical primer records
 * @returns {Promise<Blob>}
 */
export async function saveProjectToBodgeBlob({ project, snapshot = null, primers = [] }) {
  const projectMeta = {
    id: project.id,
    name: project.name,
    description: project.description,
    tags: project.tags,
    author: project.agent,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
  // One writer, always. The old `snapshot ? v2 : v1` branch meant a project
  // whose owner had never opened the assembly canvas was written by the v1
  // writer, which has no primer pool at all - so an imported primer was gone
  // on the next Open, silently and with no error anywhere. An empty assembly
  // is a legitimate thing to save; a missing pool is not.
  return writeBodgeV2(buildProjectBodgeState({ projectMeta, snapshot, primers }));
}
