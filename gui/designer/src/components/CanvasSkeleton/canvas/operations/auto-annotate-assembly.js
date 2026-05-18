/**
 * auto-annotate-assembly — post-assembly annotation enrichment.
 *
 * R9-4 (14.05.2026). После Gibson/Ligate/GoldenGate/KLD биолог получает
 * собранную последовательность с annotations merged из parents. НО:
 *   - RE sites которые ПОЯВИЛИСЬ на junction'ах не отмечены.
 *   - Start/stop codons в новых ORF не отмечены.
 *
 * Этот helper вызывает existing autoAnnotate() из core auto-annotate.js,
 * затем мерджит результат с existing annotations preserving original IDs.
 *
 * Гарантии:
 *   - Не удаляет существующие annotations.
 *   - Не дубликаты RE sites (filter by start+name).
 *   - Аннотации с одинаковыми start/end и same name считаются дубликатами.
 */
import { autoAnnotate } from '../../../../auto-annotate';

/**
 * enrichAssemblyAnnotations — augments container.annotations with
 * auto-detected RE sites, start/stop codons, etc.
 *
 * @param container  — output container с .sequence и .annotations.
 * @returns Array<annotation> — merged + de-duped.
 */
export function enrichAssemblyAnnotations(container) {
  if (!container || !container.sequence) return container?.annotations || [];
  const existing = Array.isArray(container.annotations) ? container.annotations : [];

  // Build "part" shape для autoAnnotate.
  const part = {
    name: container.name || '?',
    type: 'misc',
    sequence: container.sequence,
    annotations: existing.map((a) => ({ ...a, auto: false })),
  };

  let auto = [];
  try {
    auto = autoAnnotate(part) || [];
  } catch (e) {
    return existing;
  }

  // autoAnnotate возвращает массив со всеми annotations (preserved + new).
  // Фильтруем primary "misc"-region который автогенерирован для assembly:
  // мы не хотим thumb-thumb region над всей плазмидой.
  const filtered = auto.filter((a) => !(a.level === 'region' && a.type === 'misc' && a.auto === true));

  // De-dupe — same start, end, name → keep first.
  const seen = new Set();
  const out = [];
  for (const a of filtered) {
    const key = `${a.start}__${a.end}__${a.name || ''}__${a.type || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
