/**
 * fragment-card-info — CANVAS-CLICK-1 (Игорь /loop 28.06): clicking a fragment card
 * must tell the genetic engineer WHAT the fragment is. Pure projection of a canvas
 * container (derived DAG frag / source / product) → the fields an engineer reads at a
 * glance: name, length, topology, how it was obtained, its (sticky) ends, feature count.
 *
 * Reads only what the derived container carries (pieces-to-dag-preview): name, sequence,
 * topology, annotations, origin.kind (cut|pcr|synthesis), _stagger (terminalStagger end
 * labels), _role, _reversed. No store, no React — unit-tested, reused by the info panel.
 */

const ACQ_BY_KIND = {
  // derived DAG containers (origin.kind = opKindForMethod)
  cut: 'рестрикция (дайджест)',
  pcr: 'ПЦР',
  'ov-pcr': 'overlap-ПЦР',
  synthesis: 'синтез',
  ligate: 'лигирование',
  gibson: 'Gibson',
  golden_gate: 'Golden Gate',
  kld: 'KLD',
  blunt: 'затупление',
  // committed containers (adapter origin.kind = op_*)
  op_cut: 'рестрикция (дайджест)',
  op_pcr: 'ПЦР',
  op_gibson: 'Gibson',
  op_ligate: 'лигирование',
  op_golden_gate: 'Golden Gate',
  op_kld: 'KLD',
  op_mutagenesis: 'мутагенез',
  op_blunt: 'затупление',
};
const ROLE_LABEL = {
  source: 'источник',
  product: 'продукт сборки',
  fragment: 'фрагмент',
};

/** Human end labels from the container: _stagger (RE staircase) → container.ends → []. */
function endLabels(container) {
  const st = container._stagger;
  if (st && (st.left || st.right)) {
    return [st.left && st.left.label, st.right && st.right.label].filter(Boolean);
  }
  const ends = container.ends;
  if (ends && (ends.fivePrime || ends.threePrime)) {
    const lbl = (e) => {
      if (!e) return null;
      if (e.type === 'blunt') return 'тупой';
      const tick = e.type === '3overhang' ? '3′' : '5′';
      return e.overhang ? `${tick} ${e.overhang}` : tick;
    };
    return [lbl(ends.fivePrime), lbl(ends.threePrime)].filter(Boolean);
  }
  return [];
}

/**
 * @param {object} container canvas container (derived frag / source / product)
 * @returns {{ name, lengthBp, topology:'circular'|'linear', role, acquisition,
 *   reversed, ends:string[], featureCount:number, featureNames:string[] }|null}
 */
export function fragmentCardInfo(container) {
  if (!container) return null;
  const seq = container.sequence || '';
  const lengthBp = seq.length || container.length || 0;
  const circular = !!(container.topology && container.topology.circular);
  const role = container._role || null;
  const originKind = container.origin && container.origin.kind;
  const acquisition = ACQ_BY_KIND[originKind] || ROLE_LABEL[role] || '';
  const anns = Array.isArray(container.annotations) ? container.annotations : [];
  const regions = anns.filter((a) => a && (a.level || 'region') === 'region');
  return {
    name: container.name || 'Фрагмент',
    lengthBp,
    topology: circular ? 'circular' : 'linear',
    role,
    acquisition,
    reversed: !!container._reversed,
    ends: endLabels(container),
    featureCount: regions.length,
    featureNames: regions.slice(0, 4).map((a) => a.name || a.type).filter(Boolean),
  };
}
