/**
 * fixture-canvas-skeleton — стартовое состояние canvas.
 *
 * 12.05.2026 — Игорь: «очисти стартовый стол канваса — убери
 * скелетиков. теперь там должно быть на старете два прямоугольных
 * контейнера с значком +». Pre-baked 5 containers + 6 primers + 3
 * commits + 2 draft sessions заменены на V2 paradigma из
 * NOTES_CANVAS_V2_KICKOFF §2: два placeholder-контейнера (sequence=
 * null/''), без primer-пула, без commits, без drafts.
 *
 * Placeholder shape (V2):
 *   - sequence пустой → ContainerBlock рендерит pristine variant
 *     (dashed border, плюс в центре).
 *   - origin.kind: 'placeholder' — маркер для UI и tests.
 *   - kind: 'molecule' — same as filled containers; placeholder
 *     отличается отсутствием sequence (не отдельной kind).
 *
 * Заполнение:
 *   - drag entry из Library tree на placeholder → FILL_PLACEHOLDER
 *     dispatch → placeholder становится filled-контейнером (id
 *     сохраняется).
 *   - click на placeholder → shared library source picker с entries
 *     активного project'а → выбор → FILL_PLACEHOLDER.
 *
 * Drop на пустое место canvas (не placeholder) → создание НОВОГО
 * container (ADD_CONTAINER_FROM_ENTRY) — existing path.
 */

// V61 (14.05.2026) — призрачный (ghost) контейнер. На canvas всегда
// присутствует ровно ОДИН placeholder; при его заполнении автоматически
// создаётся новый (см. canvasReducer.ensureGhostPlaceholder). Раньше
// было 2 жёстких placeholder'а — биолог удалял оба и оставался без
// точки входа в picker.
// V62 (14.05.2026) — ghost закреплён в верхнем-левом углу canvas'a.
// При заполнении filled уезжает на cascade-слот (см. FILL_PLACEHOLDER),
// новый ghost respawn'ится снова в верхнем-левом — biolog видит знакомое
// «+» в одном и том же месте, рядом с tree.
export const GHOST_HOME_POSITION = { x: 40, y: 40 };

export const SKELETON_CONTAINERS = [
  {
    id: 'c-placeholder-1',
    kind: 'molecule',
    name: '',
    topology: { circular: false },
    length: 0,
    sequence: '',
    annotations: [],
    ends: null,
    origin: { kind: 'placeholder', createdAt: '2026-05-12T00:00:00Z' },
    position: GHOST_HOME_POSITION,
    parentCommitId: null,
  },
];

export const SKELETON_PRIMERS = [];
export const SKELETON_COMMITS = [];
// SKELETON_DRAFTS removed K3 (M-CANVAS-OPS, 12.05.2026 — DEC-OPS-02).
// Pre-V2 paradigma had hard-coded draft sessions to populate the
// editor tab strip; V2 opens editor view-only on dblclick, no draft
// linkage needed. See also: derive-primers.js + fixture-puc19.js
// deleted in the same K3 GC sweep.

export function buildContainerIndex(containers) {
  const out = {};
  for (const c of containers) out[c.id] = c;
  return out;
}

/**
 * isPlaceholderContainer — единый predicate для всех слоёв.
 * Placeholder = пустая sequence + origin.kind 'placeholder' ИЛИ просто
 * пустая sequence (drag entry в placeholder заменяет origin, но если
 * процесс заполнения не закончился — sequence ещё пустая).
 */
export function isPlaceholderContainer(container) {
  if (!container) return false;
  // K10 (DEC-OPS-09) — oligonucleotide containers store sequences in
  // payload.sequences[]; treat as filled when any lane has a sequence.
  if (container.kind === 'oligonucleotide') {
    const seqs = container.payload?.sequences;
    if (Array.isArray(seqs) && seqs.some((s) => s?.sequence)) return false;
    if (container.sequence && container.sequence.length > 0) return false;
    return true;
  }
  if (container.sequence && container.sequence.length > 0) return false;
  return true;
}
