/**
 * auto-group-pipeline — M-CANVAS-WORKFLOW-UX K10 (SPEC §4 automode).
 *
 * Pure heuristic that proposes op-group structure for a zone given its
 * un-grouped sources and final topology:
 *   - linear OR ≤6 sources   → single layer-0 overlap_pcr group.
 *   - circular & >6 sources  → layer-0 ovPCR groups of ⌈√N⌉, then a
 *                              layer-1 Gibson (or overlap_pcr if final
 *                              is linear) referencing those by index.
 *
 * Already-grouped pieces (`p.groupId != null`) are skipped (the biolog
 * may run automode AFTER a manual partial grouping). Layer-1 groups
 * reference intermediate pieces by index (`intermediateFromGroups`)
 * because the real ids only exist once the K15 finalizer materialises
 * them — the caller applies layer-0 immediately, layer-1+ after
 * finalize.
 */

export function autoGroupPipeline(zone, state) {
  const zoneId = zone && zone.id;
  const finalTopology = (zone && zone.finalTopology) || 'circular';
  const all = (state && state.pieces) || [];
  const sources = all
    .filter((p) => p && p.zoneId === zoneId && !p.groupId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (sources.length === 0) return { groups: [] };
  const ids = sources.map((p) => p.id);

  // Single layer for linear final OR small circular assemblies.
  if (finalTopology === 'linear' || sources.length <= 6) {
    return { groups: [{ kind: 'overlap_pcr', pieceIds: ids, layer: 0 }] };
  }

  // Multi-step: ⌈√N⌉ layer-0 ovPCR buckets + 1 layer-1 final op.
  const groupSize = Math.ceil(Math.sqrt(sources.length));
  const layer0 = [];
  for (let i = 0; i < ids.length; i += groupSize) {
    layer0.push({
      kind: 'overlap_pcr',
      pieceIds: ids.slice(i, i + groupSize),
      layer: 0,
    });
  }
  const layer1 = [{
    kind: finalTopology === 'circular' ? 'gibson' : 'overlap_pcr',
    intermediateFromGroups: layer0.map((_, i) => i),
    layer: 1,
  }];
  return { groups: [...layer0, ...layer1] };
}
