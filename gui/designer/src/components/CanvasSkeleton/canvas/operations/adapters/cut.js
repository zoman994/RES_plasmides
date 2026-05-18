/**
 * adapters/cut.js — executeCut adapter.
 *
 * R9-2 (14.05.2026): extracted from lib-adapters.js.
 *
 * S2 (14.05.2026): real fidelity. Использует digest() из restriction-db
 * который honors enzyme.cut[0]/cut[1] (sticky/blunt overhang-aware) и
 * shifts annotations для circular → linear.
 */
import { findSitesInSequence, RE_ENZYMES, digest } from '../../../../../restriction-db';
import { newContainer } from './_shared';
import { resolveOpTemplate } from '../../../lib/op-piece-bridge';

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
  const cuts = [];
  for (const enzyme of enzymes) {
    const re = RE_ENZYMES[enzyme];
    if (!re) continue;
    const sites = findSitesInSequence(enzyme, seq);
    for (const s of sites) {
      cuts.push({ position: s.position + re.cut[0], enzyme });
    }
  }
  cuts.sort((a, b) => a.position - b.position);
  if (cuts.length === 0) {
    return { error: 'Нет сайтов рестрикции в темплейте' };
  }

  // R5-2: clip annotations to each fragment's range.
  const clipAnnotationsToRange = (lo, hi) => {
    const out = [];
    for (const a of anns) {
      if (typeof a?.start !== 'number' || typeof a?.end !== 'number') continue;
      const aLo = Math.max(a.start, lo);
      const aHi = Math.min(a.end, hi);
      if (aHi <= aLo) continue;
      out.push({ ...a, start: aLo - lo, end: aHi - lo });
    }
    return out;
  };

  const fragments = [];
  if (isCircular) {
    for (let i = 0; i < cuts.length; i += 1) {
      const a = cuts[i].position;
      const b = cuts[(i + 1) % cuts.length].position;
      let part;
      let fragAnns;
      if (i === cuts.length - 1) {
        part = seq.slice(a) + seq.slice(0, b);
        fragAnns = [
          ...clipAnnotationsToRange(a, seq.length),
          ...clipAnnotationsToRange(0, b).map((x) => ({
            ...x,
            start: x.start + (seq.length - a),
            end: x.end + (seq.length - a),
          })),
        ];
      } else {
        part = seq.slice(a, b);
        fragAnns = clipAnnotationsToRange(a, b);
      }
      fragments.push({
        sequence: part,
        annotations: fragAnns,
        name: `${template.name || 'fragment'}_cut${i + 1}`,
      });
    }
  } else {
    let last = 0;
    for (let i = 0; i < cuts.length; i += 1) {
      fragments.push({
        sequence: seq.slice(last, cuts[i].position),
        annotations: clipAnnotationsToRange(last, cuts[i].position),
        name: `${template.name || 'fragment'}_part${i + 1}`,
      });
      last = cuts[i].position;
    }
    fragments.push({
      sequence: seq.slice(last),
      annotations: clipAnnotationsToRange(last, seq.length),
      name: `${template.name || 'fragment'}_part${cuts.length + 1}`,
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
