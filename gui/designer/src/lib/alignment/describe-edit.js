/**
 * describe-edit.js — pure helpers shared by the align store and the «Сохранить
 * исправленную версию» UI, so a working-copy edit reads the SAME in the change
 * summary and in the saved provenance (one source of truth, no drift).
 *
 * Two shapes arrive as «corrections»:
 *   • accept-base substitution  { pos, from, to }                 (acceptReadBaseAt)
 *   • a full edit op            { kind:'insert'|'delete'|'replace', … }
 *
 * `enrichEditDescriptor(op, fullSeq)` captures the ORIGINAL bases the op touches
 * (its «from» / «removed») from the PRE-edit sequence, so the summary can read
 * «было → стало» (Игорь: «замена чего на что?»). `formatCorrection(c)` renders
 * one human line for either shape.
 */

// Enrich an edit op with the original bases it replaces/deletes, read from the
// sequence as it is BEFORE the op applies. Insert has nothing to capture.
// Returns a new object; all original op fields are preserved.
export function enrichEditDescriptor(op, fullSeq) {
  if (!op || !op.kind) return op;
  const seq = typeof fullSeq === 'string' ? fullSeq : '';
  if (op.kind === 'replace') {
    const start = Number(op.start) || 0;
    const end = Number(op.end);
    return { ...op, from: seq.slice(start, Number.isFinite(end) ? end : start) };
  }
  if (op.kind === 'delete') {
    const pos = Number(op.pos) || 0;
    const length = Number(op.length) || 0;
    return { ...op, removed: seq.slice(pos, pos + length) };
  }
  return { ...op };
}

const q = (s) => `«${s == null || s === '' ? '∅' : s}»`;

export function formatCorrection(c) {
  if (!c) return 'правка';
  if (c.kind === 'insert') {
    const text = c.text != null ? c.text : (c.char != null ? c.char : '');
    const start = (c.pos ?? 0) + 1;
    const pos = text.length > 1 ? `поз ${start}–${(c.pos ?? 0) + text.length}` : `поз ${start}`;
    return `вставка · ${pos}: ${q(text)}`;
  }
  if (c.kind === 'delete') {
    const length = c.length != null ? c.length : (c.removed != null ? c.removed.length : 0);
    const start = (c.pos ?? 0) + 1;
    const pos = length > 1 ? `поз ${start}–${(c.pos ?? 0) + length}` : `поз ${start}`;
    const what = c.removed != null ? `: ${q(c.removed)}` : '';
    const cnt = length > 1 ? ` (${length} нт)` : '';
    return `удаление · ${pos}${what}${cnt}`;
  }
  if (c.kind === 'replace') {
    const start = (c.start ?? 0) + 1;
    const repl = c.replacement ?? '';
    // A 1-base replacement reads as a point change «поз N», not a range «N–N».
    const single = (c.end - c.start === 1) && repl.length <= 1;
    const pos = single ? `поз ${start}` : `поз ${start}–${c.end}`;
    if (c.from != null) return `замена · ${pos}: ${c.from || '∅'} → ${repl || '∅'}`;
    return `замена · ${pos} → ${q(repl)}`;
  }
  // accept-base substitution { pos, from, to }
  if (c.to != null && c.from != null && c.pos != null) {
    return `замена · поз ${c.pos + 1}: ${c.from} → ${c.to}`;
  }
  // origin rotation of a circular plasmid { kind:'origin', position } (1-based)
  if (c.kind === 'origin') {
    return `смена начала отсчёта → поз ${c.position ?? 1}`;
  }
  if (c.kind === 'topology') {
    const label = (value) => (value === 'circular' ? 'кольцевая' : (value === 'linear' ? 'линейная' : value));
    return `топология · ${label(c.from)} → ${label(c.to)}`;
  }
  return 'правка';
}

// ── coalescing contiguous runs (Игорь — «много вставок: одной записью») ──
// A typing/deletion run is ONE logical edit; the per-keystroke ops that compose
// it merge into a single record so the change summary + provenance read like the
// biolog's intent, not the keylog. Boundary = spatial contiguity: a caret jump
// (non-adjacent position) starts a new record.

// The position the next contiguous typed char would land at, for an insert run
// (pos + accumulated length) or a replace whose tail is being typed into.
function insertionFrontier(rec) {
  if (!rec) return null;
  if (rec.kind === 'insert') return rec.pos + (rec.text ? rec.text.length : 0);
  if (rec.kind === 'replace') return rec.start + (rec.replacement ? rec.replacement.length : 0);
  return null;
}

// Normalise an incoming descriptor into a stored record shape (insert carries a
// growable `text`; substitution {pos,from,to} passes through untouched).
function normalizeDescriptor(d) {
  if (!d) return d;
  if (d.kind === 'insert') {
    return { kind: 'insert', pos: Number(d.pos) || 0, text: d.text != null ? d.text : (d.char != null ? d.char : '') };
  }
  if (d.kind === 'delete') {
    const removed = d.removed != null ? d.removed : '';
    return { kind: 'delete', pos: Number(d.pos) || 0, length: d.length != null ? d.length : removed.length, removed };
  }
  if (d.kind === 'replace') {
    const rec = { kind: 'replace', start: Number(d.start) || 0, end: Number(d.end), replacement: d.replacement != null ? d.replacement : '' };
    if (d.from != null) rec.from = d.from;
    return rec;
  }
  return d; // accept-base substitution { pos, from, to }
}

// Append `descriptor` to `corrections`, merging it into the last record when it
// continues a contiguous run. Pure — returns a NEW array.
export function mergeCorrection(corrections, descriptor) {
  const list = Array.isArray(corrections) ? corrections : [];
  const d = normalizeDescriptor(descriptor);
  if (!d) return list.slice();

  if (d.kind === 'topology') {
    if (d.from === d.to) return list.slice();
    let index = -1;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]?.kind === 'topology') { index = i; break; }
    }
    if (index < 0) return [...list, d];
    const next = list.slice();
    if (d.to === list[index].from) next.splice(index, 1);
    else next[index] = { ...list[index], to: d.to };
    return next;
  }
  const last = list[list.length - 1];
  const head = list.slice(0, -1);

  if (last && d.kind === 'insert') {
    const frontier = insertionFrontier(last);
    if (frontier != null && d.pos === frontier) {
      if (last.kind === 'insert') return [...head, { ...last, text: last.text + d.text }];
      if (last.kind === 'replace') return [...head, { ...last, replacement: last.replacement + d.text }];
    }
  }

  if (last && d.kind === 'delete' && d.length === 1) {
    // Backspace erasing the just-typed tail of a run → shrink it (don't log a
    // delete of text that never reached the original sequence).
    if (last.kind === 'insert' && last.text.length > 0 && d.pos === last.pos + last.text.length - 1) {
      const text = last.text.slice(0, -1);
      return text ? [...head, { ...last, text }] : head;
    }
    if (last.kind === 'replace' && last.replacement.length > 0 && d.pos === last.start + last.replacement.length - 1) {
      return [...head, { ...last, replacement: last.replacement.slice(0, -1) }];
    }
  }

  if (last && last.kind === 'delete' && d.kind === 'delete') {
    // Backspace run — positions descend; grow leftwards.
    if (d.pos === last.pos - d.length) {
      return [...head, { ...last, pos: d.pos, length: last.length + d.length, removed: d.removed + last.removed }];
    }
    // Forward-delete run — caret fixed, following chars shift in; grow rightwards.
    if (d.pos === last.pos) {
      return [...head, { ...last, length: last.length + d.length, removed: last.removed + d.removed }];
    }
  }

  return [...list, d];
}
