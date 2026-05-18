/**
 * zone-link-resolver — T8 K3 (§5.2, DEC-T8-08/10). A piece whose
 * sourceIds reference a container living in a DIFFERENT zone is a
 * cross-zone source. Grouped by source zone so the header shows one
 * badge per source zone (not per piece — DEC-T8-10).
 */
export function selectCrossZoneSourcesForZone(state, zoneId) {
  const pieces = ((state && state.pieces) || []).filter((p) => p.zoneId === zoneId);
  const containers = (state && state.containers) || [];
  const zones = (state && state.zones) || [];
  const byZone = new Map(); // sourceZoneId → { containerIds:Set, pieceIds:Set }

  for (const piece of pieces) {
    for (const sid of (piece.sourceIds || [])) {
      const sc = containers.find((c) => c.id === sid);
      if (!sc) continue;
      const sz = sc.zoneId;
      if (!sz || sz === zoneId) continue; // same-zone or loose → not cross-zone
      if (!byZone.has(sz)) byZone.set(sz, { containerIds: new Set(), pieceIds: new Set() });
      const e = byZone.get(sz);
      e.containerIds.add(sid);
      e.pieceIds.add(piece.id);
    }
  }

  return Array.from(byZone.entries()).map(([sourceZoneId, e]) => {
    const z = zones.find((zz) => zz.id === sourceZoneId);
    return {
      sourceZoneId,
      sourceZoneName: (z && z.name) || 'неизвестная зона',
      pieceIds: Array.from(e.pieceIds),
      containerIds: Array.from(e.containerIds),
    };
  });
}
