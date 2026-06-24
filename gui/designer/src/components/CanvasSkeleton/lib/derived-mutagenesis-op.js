/**
 * derived-mutagenesis-op — build the payload for a canvas op_mutagenesis
 * node DERIVED from an in-editor edit (Кирпич 3c). Maps the editor mutation
 * shape `{position, fromBase, toBase}` → the canvas op shape
 * `{position, from, to}` (the executeMutagenesis adapter contract — NOT
 * fromBase/toBase). Pure; the wiring dispatches DERIVE_MUTAGENESIS_OP.
 *
 * Only point substitutions reach here (piece.mutations are substitutions;
 * ins/del go through range ops), so mutationType is always 'point'.
 */
export function buildMutagenesisOpPayload({
  templateId, mutations, zoneId = null, position = { x: 220, y: 220 },
} = {}) {
  const muts = (Array.isArray(mutations) ? mutations : [])
    .filter((m) => m && Number.isFinite(m.position))
    .map((m) => ({
      position: m.position,
      from: String(m.fromBase || '').toUpperCase(),
      to: String(m.toBase || '').toUpperCase(),
    }));
  if (!templateId || muts.length === 0) return null;
  return {
    kind: 'mutagenesis',
    inputs: [templateId],
    params: { templateId, mutationType: 'point', mutations: muts },
    zoneId,
    position,
  };
}
