/**
 * lib-adapters — facade re-exporting per-op adapter functions.
 *
 * R9-2 (14.05.2026 — DEC-OPS-LIB-ADAPTERS-SPLIT). Файл декомпозирован:
 *   - adapters/_shared.js     — newContainer, reverseComplement, findOverlap,
 *                                concatWithOverlapTrim, mergeAnnotationsForConcat,
 *                                autoDesignPrimerPair, makeDesignedOligoContainer.
 *   - adapters/cut.js          — executeCut (real digest).
 *   - adapters/pcr.js          — executePCR (single + multi-template + auto-design).
 *   - adapters/gibson.js       — executeGibson (overlap-trim).
 *   - adapters/golden-gate.js  — executeGoldenGate (Type IIS).
 *   - adapters/ligate.js       — executeLigate (sticky/blunt).
 *   - adapters/kld.js          — executeKLD (primer-encoded mutation).
 *   - adapters/mutagenesis.js  — executeMutagenesis (point/ins/del).
 *
 * Этот файл хранит REGISTRY и executeOperation dispatcher; импорты
 * сторонних модулей продолжают работать через named re-exports.
 *
 * Без store-coupling. Каждый adapter принимает (operation, contextSnapshot)
 * и возвращает {outputs: Container[], error?: string}.
 */
export { executeCut } from './adapters/cut';
export { executePCR } from './adapters/pcr';
export { executeGibson } from './adapters/gibson';
export { executeGoldenGate } from './adapters/golden-gate';
export { executeLigate } from './adapters/ligate';
export { executeKLD } from './adapters/kld';
export { executeMutagenesis } from './adapters/mutagenesis';

import { getAdapter } from './op-kinds-registry';
import { assertContainerOk } from './types';

/**
 * executeOperation — главный entry-point. Dispatch на kind-specific
 * adapter через op-kinds-registry. Если kind не зарегистрирован — error.
 *
 * R11: после adapter call валидируем outputs через validateContainer.
 * DEV mode: warn в console если shape кривой; production silent skip.
 *
 * R12-1: REGISTRY removed, dispatch через `getAdapter()` registry.
 */
export function executeOperation(operation, ctx) {
  if (!operation || !operation.kind) {
    return { error: 'Operation kind не задан' };
  }
  const fn = getAdapter(operation.kind);
  if (!fn) return { error: `Не поддерживается kind: ${operation.kind}` };
  let result;
  try {
    result = fn(operation, ctx);
  } catch (e) {
    return { error: `Adapter error: ${e?.message || String(e)}` };
  }
  // DEV-only invariant check.
  if (result && Array.isArray(result.outputs)) {
    for (const out of result.outputs) {
      assertContainerOk(out, `executeOperation[${operation.kind}]`);
    }
  }
  return result;
}
