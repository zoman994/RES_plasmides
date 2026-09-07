/**
 * adapters/cut.js — executeCut adapter.
 *
 * R9-2 (14.05.2026): extracted from lib-adapters.js.
 *
 * S2 (14.05.2026): real fidelity. Использует digest() из restriction-db
 * который honors enzyme.cut[0]/cut[1] (sticky/blunt overhang-aware) и
 * shifts annotations для circular → linear.
 */
import { effectiveEnzymes, digest } from '../../../../../restriction-db';
import { scanOccurrences } from '../../../../../lib/restriction-occurrence';
import { newContainer } from './_shared';
import { resolveOpTemplate } from '../../../lib/op-piece-bridge';
import { projectAnnotationsGeometry } from '../../../lib/segment-annotation-transfer';

/**
 * L11 (audit) — the cut END an enzyme leaves, in the shape detectJunctionKind
 * reads (overhang + type + enzymeUsed). The legacy linear path produced fragments
 * with NO ends, so a downstream junction mis-classified as 'overlap' instead of
 * the enzyme-correct re_ligation / golden_gate.
 */
function endFromOccurrence(occurrence) {
  if (!occurrence || !occurrence.overhang) return null;
  const overhangType = occurrence.overhang.type;
  const type = overhangType === 'blunt'
    ? 'blunt'
    : (overhangType === '3overhang' ? '3overhang' : '5overhang');
  return {
    overhang: occurrence.overhang.seq || '',
    type,
    enzymeUsed: occurrence.enzyme,
  };
}

export function executeCut(operation, ctx) {
  const templateId = operation.params?.templateId || operation.inputs?.[0];
  const enzymes = operation.params?.enzymes || [];
  // T2 DEC-T2-01 hybrid — piece-resolve only when inputPieces set.
  const template = (operation.inputPieces && operation.inputPieces.length > 0
    ? resolveOpTemplate(operation, ctx)
    : null) || ctx.containers[templateId];
  if (!template) return { error: `Темплейт не найден: ${templateId}` };
  if (!template.sequence) return { error: 'Темплейт без последовательности' };
  if (enzymes.length === 0) return { error: 'Не выбраны ферменты' };

  const seq = template.sequence;
  const anns = Array.isArray(template.annotations) ? template.annotations : [];
  const isCircular = !!template.topology?.circular;

  // S2: для 1-2 ферментов используем digest() (full bio-fidelity).
  if (enzymes.length <= 2) {
    const enz1 = enzymes[0];
    const enz2 = enzymes[1] || null;
    if (isCircular) {
      const result = digest(seq, anns, enz1, enz2);
      if (result.error) {
        if (/cuts 0 times/.test(result.error)) {
          return { error: 'Нет сайтов рестрикции в темплейте' };
        }
        return { error: result.error };
      }
      const fragmentSources = [];
      if (result.backbone) {
        const isLinearize = result.type === 'linearize';
        fragmentSources.push({
          ...result.backbone,
          name: isLinearize
            ? `${template.name}_lin_${enz1}`
            : `${template.name}_backbone`,
        });
      }
      if (result.excised && result.excised.sequence) {
        fragmentSources.push({
          ...result.excised,
          name: `${template.name}_excised`,
        });
      }
      if (fragmentSources.length === 0) {
        return { error: 'digest() не вернул фрагменты' };
      }
      const outputs = fragmentSources
        .filter((f) => f.sequence && f.sequence.length > 0)
        .map((f, idx) => {
          const endsObj = (f.leftEnd || f.rightEnd)
            ? { fivePrime: f.leftEnd || null, threePrime: f.rightEnd || null }
            : null;
          // R10-3 (14.05.2026): tag origin with parent topology + excised flag.
          // - parentWasCircular: visual hint в MiniPlasmidMap render broken-circle.
          // - isExcised: small fragment вырезанный double-digest'ом (для render dim).
          //   digest() возвращает result.type='excise' когда есть .excised:
          //   фрагмент f.name содержит '_excised' suffix.
          const isExcised = typeof f.name === 'string' && f.name.endsWith('_excised');
          return newContainer({
            name: f.name,
            sequence: f.sequence,
            circular: false,
            annotations: Array.isArray(f.annotations) ? f.annotations : [],
            ends: endsObj,
            origin: {
              kind: 'op_cut',
              operationId: operation.id,
              parentContainerId: templateId,
              enzymes,
              parentWasCircular: true,
              isExcised,
              fragmentIndex: idx,
            },
          });
        });
      return { outputs };
    }
  }

  // Legacy multi-enzyme / linear path (≥3 enzymes или linear template).
  const catalog = effectiveEnzymes();
  const cuts = scanOccurrences(seq, {
    circular: isCircular,
    enzymes: catalog,
    names: enzymes,
  })
    .filter((occurrence) => Number.isFinite(occurrence.topCut))
    .map((occurrence) => ({
      position: occurrence.topCut,
      enzyme: occurrence.enzyme,
      occurrence,
      end: endFromOccurrence(occurrence),
    }));
  cuts.sort((a, b) => a.position - b.position);
  if (cuts.length === 0) {
    return { error: 'Нет сайтов рестрикции в темплейте' };
  }

  // R5-2 / ASM-5: location is authoritative. Project every canonical segment
  // and derive scalar start/end from it in the same operation.
  const projectAnnotationsToRanges = (ranges) => projectAnnotationsGeometry(anns, ranges);

  const fragments = [];
  if (isCircular) {
    for (let i = 0; i < cuts.length; i += 1) {
      const a = cuts[i].position;
      const b = cuts[(i + 1) % cuts.length].position;
      let part;
      let fragAnns;
      if (i === cuts.length - 1) {
        part = seq.slice(a) + seq.slice(0, b);
        fragAnns = projectAnnotationsToRanges([
          { start: a, end: seq.length, offset: 0 },
          { start: 0, end: b, offset: seq.length - a },
        ]);
      } else {
        part = seq.slice(a, b);
        fragAnns = projectAnnotationsToRanges([{ start: a, end: b, offset: 0 }]);
      }
      fragments.push({
        sequence: part,
        annotations: fragAnns,
        name: `${template.name || 'fragment'}_cut${i + 1}`,
        leftEnd: cuts[i].end ? { ...cuts[i].end } : null,
        rightEnd: cuts[(i + 1) % cuts.length].end
          ? { ...cuts[(i + 1) % cuts.length].end }
          : null,
      });
    }
  } else {
    let last = 0;
    for (let i = 0; i < cuts.length; i += 1) {
      fragments.push({
        sequence: seq.slice(last, cuts[i].position),
        annotations: projectAnnotationsToRanges([{
          start: last, end: cuts[i].position, offset: 0,
        }]),
        name: `${template.name || 'fragment'}_part${i + 1}`,
        // L11 — left end = the previous cut's enzyme (none for the first piece,
        // it's the original linear 5′ end); right end = this cut's enzyme.
        leftEnd: i === 0 || !cuts[i - 1].end ? null : { ...cuts[i - 1].end },
        rightEnd: cuts[i].end ? { ...cuts[i].end } : null,
      });
      last = cuts[i].position;
    }
    fragments.push({
      sequence: seq.slice(last),
      annotations: projectAnnotationsToRanges([{ start: last, end: seq.length, offset: 0 }]),
      name: `${template.name || 'fragment'}_part${cuts.length + 1}`,
      leftEnd: cuts[cuts.length - 1].end ? { ...cuts[cuts.length - 1].end } : null,
      rightEnd: null, // original linear 3′ end
    });
  }
  const nonEmpty = fragments.filter((f) => f.sequence.length > 0);
  // R10-3: smallest fragment(s) tag as excised для visual dim.
  // Heuristic: in multi-cut circular, the SHORTEST fragment is "excised";
  // в linear cut path просто помечаем все как cut products (parentWasCircular
  // detected from template.topology.circular).
  const minLen = Math.min(...nonEmpty.map((f) => f.sequence.length));
  const parentWasCircular = !!template.topology?.circular;
  const outputs = nonEmpty.map((f, idx) => newContainer({
    name: f.name,
    sequence: f.sequence,
    circular: false,
    annotations: f.annotations,
    // L11 — carry the cut ends so a downstream junction classifies by the enzyme.
    ends: (f.leftEnd || f.rightEnd)
      ? { fivePrime: f.leftEnd || null, threePrime: f.rightEnd || null }
      : null,
    origin: {
      kind: 'op_cut',
      operationId: operation.id,
      parentContainerId: templateId,
      enzymes,
      parentWasCircular,
      isExcised: parentWasCircular && f.sequence.length === minLen && nonEmpty.length > 1,
      fragmentIndex: idx,
    },
  }));
  return { outputs };
}
