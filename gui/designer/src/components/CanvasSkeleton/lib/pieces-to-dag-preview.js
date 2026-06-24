/**
 * pieces-to-dag-preview — LIVE derived projection of an assembly's pieces into a
 * source→reaction→fragment graph for the DAG view (Игорь 22.06.2026: «когда я
 * выбрал кусок, на DAG уже должна появиться карточка исходника + Cut = фрагмент»;
 * выбран «живой вывод из кусков»).
 *
 * The DAG view used to show only ALREADY-materialised nodes (`nodeListInZone`),
 * so a freshly picked piece produced nothing until «Реализовать». This derives,
 * per piece, the mechanism the recipe implies — WITHOUT mutating the store:
 *   - sourced piece, acquisitionMethod 'restriction' → source → Cut → fragment;
 *   - sourced piece, any other method               → source → PCR → fragment;
 *   - manual / snippet / synthesis / gap (no source) → a standalone fragment.
 * The same source container used by several pieces is emitted ONCE (deduped), so
 * the graph reads «один исходник → N разрезов».
 *
 * Pure: reuses `draftFromZone` (piece→segment, range-concat, rc, mutations) so the
 * derived fragment sequence matches exactly what realise/SegmentList show.
 * `«Реализовать»` stays the separate materialise-into-a-product-container step.
 */
import { draftFromZone } from './zone-pieces-to-dag';

/** Reaction op kind implied by a sourced piece's acquisition method. */
export function opKindForMethod(method) {
  return method === 'restriction' ? 'cut' : 'pcr';
}

export function derivePiecesToGraph(state, zone) {
  if (!state || !zone) return { containers: [], operations: [] };
  const draft = draftFromZone(state, zone);
  const segs = (draft && draft.segments) || [];
  const byId = new Map((state.containers || []).map((c) => [c.id, c]));
  const containers = [];
  const operations = [];
  const seenSource = new Set();

  segs.forEach((seg, i) => {
    const fragId = `dag-frag-${seg.id}`;
    const sourced = !!(seg.source && seg.source.type === 'container' && seg.source.containerId);

    // Source container node (deduped across pieces that share one source).
    let sourceNodeId = null;
    if (sourced) {
      const src = byId.get(seg.source.containerId);
      if (src) {
        sourceNodeId = `dag-src-${src.id}`;
        if (!seenSource.has(sourceNodeId)) {
          seenSource.add(sourceNodeId);
          containers.push({
            ...src, id: sourceNodeId, zoneId: zone.id, _derived: true, _role: 'source',
          });
        }
      }
    }

    const kind = opKindForMethod(seg.acquisitionMethod);

    // Fragment (the reaction's product).
    containers.push({
      id: fragId,
      zoneId: zone.id,
      kind: 'molecule',
      name: seg.label || `фрагмент ${i + 1}`,
      sequence: seg.sequence || '',
      length: (seg.sequence || '').length,
      topology: { circular: false },
      annotations: seg.annotations || [],
      origin: sourceNodeId
        ? { kind, parentName: (seg.source && seg.source.sourceContainerName) || '' }
        : { kind: 'synthesis' },
      _derived: true,
      _role: 'fragment',
    });

    // Reaction op — only when there is a source to act on (a synthesised /
    // manual fragment is its own node, no upstream reaction).
    if (sourceNodeId) {
      operations.push({
        id: `dag-op-${seg.id}`,
        zoneId: zone.id,
        kind,
        status: 'committed',
        inputs: [sourceNodeId],
        outputs: [fragId],
        params: kind === 'cut'
          ? {
            enzymes: (seg.acquisitionParams && seg.acquisitionParams.enzymes) || [],
            cutSites: (seg.acquisitionParams && seg.acquisitionParams.cutSites) || [],
          }
          : {},
        _derived: true,
      });
    }
  });

  return { containers, operations };
}
