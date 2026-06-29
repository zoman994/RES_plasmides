/**
 * operation-info — CANVAS-CLICK-2 / V139 (Игорь /loop 28.06). Clicking a reaction node
 * (Cut / Ligate / Gibson / ромб) must show the engineer WHAT the reaction is — kind,
 * enzyme(s), method, inputs→output. The old onOperationClick called openEditorOpTab(op.id),
 * but on the DAG PREVIEW the ops are DERIVED (`dag-op-…`, `_derived`) — not committed store
 * operations — so the tab lookup found nothing → dead click (V139). An info panel reads the
 * node directly, so it works on both the live preview and committed ops. Pure, no store.
 */

const OP_LABEL = {
  cut: 'Рестрикция (Cut)',
  pcr: 'ПЦР',
  'ov-pcr': 'Overlap-ПЦР',
  gibson: 'Gibson',
  ligate: 'Лигирование',
  golden_gate: 'Golden Gate',
  kld: 'KLD',
  mutagenesis: 'Мутагенез',
  blunt: 'Затупление',
};

/**
 * @param {object} op operation node (derived `dag-op-…` or committed). Carries kind,
 *   params {enzymes?, method?, selfClosure?}, inputs[] / outputs[] (container ids).
 * @param {Array} containers canvas containers (to resolve input/output names).
 * @returns {{ kind, kindLabel, enzymes:string[], method:string|null, selfClosure:boolean,
 *   inputNames:string[], outputNames:string[], derived:boolean }|null}
 */
export function operationInfo(op, containers = []) {
  if (!op) return null;
  const byId = new Map((containers || []).map((c) => [c.id, c]));
  const nameOf = (id) => {
    const c = byId.get(id);
    return (c && c.name) || id;
  };
  const params = op.params || {};
  const enzymes = Array.isArray(params.enzymes) ? params.enzymes.filter(Boolean) : [];
  return {
    kind: op.kind || null,
    kindLabel: OP_LABEL[op.kind] || op.kind || 'Операция',
    enzymes,
    method: params.method || null,
    selfClosure: !!params.selfClosure,
    inputNames: (Array.isArray(op.inputs) ? op.inputs : []).map(nameOf),
    outputNames: (Array.isArray(op.outputs) ? op.outputs : []).map(nameOf),
    derived: !!op._derived,
  };
}
