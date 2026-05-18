/**
 * adapters/mutagenesis.js — executeMutagenesis (point/insertion/deletion).
 *
 * R9-2 (14.05.2026): extracted from lib-adapters.js.
 *
 * R6-6: preserve annotations через shift arithmetic.
 */
import { newContainer } from './_shared';
import { resolveOpTemplate } from '../../../lib/op-piece-bridge';

export function executeMutagenesis(operation, ctx) {
  const templateId = operation.params?.templateId || operation.inputs?.[0];
  // T2 DEC-T2-01 hybrid — piece-resolve only when inputPieces set.
  const template = (operation.inputPieces && operation.inputPieces.length > 0
    ? resolveOpTemplate(operation, ctx)
    : null) || ctx.containers[templateId];
  if (!template) return { error: `Темплейт не найден: ${templateId}` };
  const mutType = operation.params?.mutationType || 'point';
  const mutations = operation.params?.mutations || [];
  if (mutations.length === 0) return { error: 'Список мутаций пуст' };

  let seq = template.sequence;
  let annotations = Array.isArray(template.annotations)
    ? template.annotations.filter((a) => typeof a?.start === 'number' && typeof a?.end === 'number').map((a) => ({ ...a }))
    : [];
  for (const m of mutations) {
    const pos = m.position;
    if (pos < 0 || pos >= seq.length) {
      return { error: `Позиция ${pos} вне последовательности (длина ${seq.length})` };
    }
    if (mutType === 'point') {
      if (m.from && seq[pos] !== m.from.toUpperCase()) {
        return { error: `В позиции ${pos} ожидался ${m.from}, фактически ${seq[pos]}` };
      }
      seq = seq.slice(0, pos) + (m.to || '').toUpperCase() + seq.slice(pos + 1);
    } else if (mutType === 'insertion') {
      const ins = (m.insert || '').toUpperCase();
      seq = seq.slice(0, pos) + ins + seq.slice(pos);
      annotations = annotations.map((a) => {
        if (a.end <= pos) return a;
        if (a.start >= pos) return { ...a, start: a.start + ins.length, end: a.end + ins.length };
        return { ...a, end: a.end + ins.length };
      });
    } else if (mutType === 'deletion') {
      const len = m.length || 1;
      seq = seq.slice(0, pos) + seq.slice(pos + len);
      annotations = annotations.reduce((acc, a) => {
        if (a.end <= pos) {
          acc.push(a);
        } else if (a.start >= pos + len) {
          acc.push({ ...a, start: a.start - len, end: a.end - len });
        } else if (a.start >= pos && a.end <= pos + len) {
          // fully inside — drop.
        } else if (a.start < pos && a.end > pos + len) {
          acc.push({ ...a, end: a.end - len });
        } else if (a.start < pos && a.end > pos) {
          acc.push({ ...a, end: pos });
        } else if (a.start < pos + len && a.end > pos + len) {
          acc.push({ ...a, start: pos, end: a.end - len });
        }
        return acc;
      }, []);
    }
  }

  const mutant = newContainer({
    name: `${template.name || 'template'}_mut`,
    sequence: seq,
    circular: !!template.topology?.circular,
    annotations,
    origin: { kind: 'op_mutagenesis', operationId: operation.id, parentContainerId: templateId, mutType, mutationCount: mutations.length },
  });
  return { outputs: [mutant] };
}
